using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using TaskPlatform.Application.Services;
using TaskPlatform.Application.Workflow;
using TaskPlatform.Domain.Entities;
using TaskPlatform.Domain.Errors;
using TaskPlatform.Domain.Workflow;

namespace TaskPlatform.Application.Services;

public readonly record struct TaskListFilters(
    int? UserId = null,
    int? TaskTypeId = null,
    bool? IsClosed = null);

// Application service for every task operation. Each public method ends in a single
// SaveChangesAsync (no explicit transactions) so EnableRetryOnFailure stays safe. Reads split
// into slim ListAsync (AsNoTracking) vs full GetByIdAsync (IgnoreQueryFilters for retired rows).
public sealed class TaskService(
    IAppDbContext db,
    ITaskTypeRegistry registry,
    WorkflowEngine engine,
    TimeProvider time,
    ILogger<TaskService> logger)
{
    public async Task<WorkflowOutcome<TaskItem>> CreateAsync(
        int taskTypeId,
        int initialAssignedUserId,
        CancellationToken ct = default)
    {
        if (!registry.TryGet(taskTypeId, out var type))
        {
            return WorkflowOutcome<TaskItem>.Failure(new WorkflowError.UnknownTaskType(taskTypeId));
        }

        if (initialAssignedUserId <= 0)
        {
            return WorkflowOutcome<TaskItem>.Failure(new WorkflowError.InvalidNextUser());
        }

        if (!await db.Users.TagWith("TaskService.CreateAsync/UserExists").AnyAsync(u => u.Id == initialAssignedUserId, ct))
        {
            return WorkflowOutcome<TaskItem>.Failure(new WorkflowError.UnknownUser(initialAssignedUserId));
        }

        var nowUtc = time.GetUtcNow().UtcDateTime;
        var task = TaskItem.Create(type!, initialAssignedUserId, nowUtc);
        db.Tasks.Add(task);
        DetachStatusDefinitionNavigations(task);
        await db.SaveChangesAsync(ct);
        logger.LogInformation(
            "Task {TaskId} created in type {TaskTypeId} assigned to user {UserId}.",
            task.Id, taskTypeId, initialAssignedUserId);
        return WorkflowOutcome<TaskItem>.Success(task);
    }

    public async Task<WorkflowOutcome<TaskItem>> ChangeStatusAsync(
        int taskId,
        int newStatus,
        JsonElement customData,
        int nextAssignedUserId,
        CancellationToken ct = default)
    {
        var task = await LoadTrackedAsync(taskId, ct);
        if (task is null)
        {
            return WorkflowOutcome<TaskItem>.Failure(new WorkflowError.TaskNotFound(taskId));
        }

        if (!await db.Users.TagWith("TaskService.ChangeStatusAsync/NextUserExists").AnyAsync(u => u.Id == nextAssignedUserId, ct))
        {
            return WorkflowOutcome<TaskItem>.Failure(new WorkflowError.UnknownUser(nextAssignedUserId));
        }

        var nowUtc = time.GetUtcNow().UtcDateTime;
        var outcome = engine.ChangeStatus(task, newStatus, customData, nextAssignedUserId, nowUtc);

        if (outcome.IsSuccess)
        {
            DetachStatusDefinitionNavigations(task);
            await db.SaveChangesAsync(ct);
            logger.LogInformation(
                "Task {TaskId} moved to status {Status} assigned to user {UserId}.",
                task.Id, newStatus, nextAssignedUserId);
        }

        return outcome;
    }

    public async Task<WorkflowOutcome<TaskItem>> UpdateStepDataAsync(
        int taskId,
        int status,
        JsonElement customData,
        int assignedUserId,
        CancellationToken ct = default)
    {
        var task = await LoadTrackedAsync(taskId, ct);
        if (task is null)
        {
            return WorkflowOutcome<TaskItem>.Failure(new WorkflowError.TaskNotFound(taskId));
        }

        if (!await db.Users.TagWith("TaskService.UpdateStepDataAsync/UserExists").AnyAsync(u => u.Id == assignedUserId, ct))
        {
            return WorkflowOutcome<TaskItem>.Failure(new WorkflowError.UnknownUser(assignedUserId));
        }

        var nowUtc = time.GetUtcNow().UtcDateTime;
        var outcome = engine.UpdateStepData(task, status, customData, assignedUserId, nowUtc);

        if (outcome.IsSuccess)
        {
            DetachStatusDefinitionNavigations(task);
            await db.SaveChangesAsync(ct);
            logger.LogInformation(
                "Task {TaskId} step {Status} data updated; assignee={UserId}.",
                task.Id, status, assignedUserId);
        }

        return outcome;
    }

    public async Task<WorkflowOutcome<TaskItem>> CloseAsync(int taskId, CancellationToken ct = default)
    {
        var task = await LoadTrackedAsync(taskId, ct);
        if (task is null)
        {
            return WorkflowOutcome<TaskItem>.Failure(new WorkflowError.TaskNotFound(taskId));
        }

        var outcome = engine.Close(task, time.GetUtcNow().UtcDateTime);
        if (outcome.IsSuccess)
        {
            await db.SaveChangesAsync(ct);
            logger.LogInformation("Task {TaskId} closed.", task.Id);
        }

        return outcome;
    }

    public async Task<IReadOnlyList<TaskItem>> ListAsync(
        TaskListFilters filters,
        CancellationToken ct = default)
    {
        IQueryable<TaskItem> q = db.Tasks
            .TagWith("TaskService.ListAsync")
            .AsNoTracking()
            .Include(t => t.CurrentStatusDefinition);

        if (filters.UserId is { } uid)        q = q.Where(t => t.CurrentAssignedUserId == uid);
        if (filters.TaskTypeId is { } typeId) q = q.Where(t => t.TaskTypeId == typeId);
        if (filters.IsClosed is { } closed)   q = q.Where(t => t.IsClosed == closed);

        return await q
            .OrderByDescending(t => t.UpdatedAtUtc)
            .ToListAsync(ct);
    }

    public Task<TaskItem?> GetByIdAsync(int taskId, CancellationToken ct = default) =>
        db.Tasks
            .TagWith("TaskService.GetByIdAsync")
            .AsNoTracking()
            .IgnoreQueryFilters()
            .Where(t => t.IsDeleted == null)
            .Include(t => t.CurrentStatusDefinition)
            .Include(t => t.FieldValues)
            .Include(t => t.Assignments)
            .FirstOrDefaultAsync(t => t.Id == taskId, ct);

    public async Task<IReadOnlyList<User>> GetAllUsersAsync(CancellationToken ct = default) =>
        await db.Users
            .TagWith("TaskService.GetAllUsersAsync")
            .AsNoTracking()
            .OrderBy(u => u.FullName)
            .ToListAsync(ct);

    public IReadOnlyCollection<TaskType> GetTaskTypes() => registry.All;

    // Foot-gun guard: the engine assigns a registry-cached (AsNoTracking) StatusDefinition to the
    // tracked entity. Without marking it Unchanged, EF would INSERT a duplicate parent row on
    // SaveChanges. Do not remove without rethinking the registry/tracking interaction.
    private void DetachStatusDefinitionNavigations(TaskItem task)
    {
        if (task.CurrentStatusDefinition is { } status)
        {
            var entry = db.Entry(status);
            if (entry.State == EntityState.Added || entry.State == EntityState.Detached)
            {
                entry.State = EntityState.Unchanged;
            }
        }
    }

    // Write-path loader. IgnoreQueryFilters lets the engine see retained (soft-deleted) field
    // values so backward-then-forward moves can restore them. IsDeleted == null at the task
    // level is re-applied here so soft-deleted tasks return 404 instead of being mutated.
    private Task<TaskItem?> LoadTrackedAsync(int taskId, CancellationToken ct) =>
        db.Tasks
            .TagWith("TaskService.LoadTrackedAsync")

            .Include(t => t.CurrentStatusDefinition)
            .Include(t => t.FieldValues)
            .Include(t => t.Assignments)
            .IgnoreQueryFilters()
            .Where(t => t.IsDeleted == null)
            .FirstOrDefaultAsync(t => t.Id == taskId, ct);
}
