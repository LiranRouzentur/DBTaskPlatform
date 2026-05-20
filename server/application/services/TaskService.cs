using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using TaskPlatform.Application.Services;
using TaskPlatform.Application.Workflow;
using TaskPlatform.Domain.Entities;
using TaskPlatform.Domain.Errors;
using TaskPlatform.Domain.Workflow;

namespace TaskPlatform.Application.Services;

// Value-type bundle of optional filters passed to ListAsync. A record struct keeps allocations
// at zero while preserving by-value equality and the readable name-based construction at call sites.
public readonly record struct TaskListFilters(
    // Restrict to tasks currently assigned to this user id; null means "any assignee".
    int? UserId = null,
    // Restrict to tasks of this task-type id; null means "any type".
    int? TaskTypeId = null,
    // True → closed only, false → open only, null → both.
    bool? IsClosed = null);

// Application service for every task operation. Each public method ends in a single
// SaveChangesAsync (no explicit transactions) so EnableRetryOnFailure stays safe. Reads split
// into slim ListAsync (AsNoTracking) vs full GetByIdAsync (IgnoreQueryFilters for retired rows).
public sealed class TaskService(
    // DB seam — controllers/services depend on the IAppDbContext interface, not AppDbContext directly.
    IAppDbContext db,
    // Singleton in-memory cache of TaskType → Statuses → Fields, populated once at startup.
    ITaskTypeRegistry registry,
    // Pure workflow rule core — no DB access; mutates the tracked entity in-memory.
    WorkflowEngine engine,
    // Injected clock so tests can freeze time without reaching for DateTime.UtcNow.
    TimeProvider time,
    // Structured logger used to emit one Information entry per successful state transition.
    ILogger<TaskService> logger)
{
    // Creates a brand-new task of the given type, pre-assigned to a user. Validates the type
    // (registry) and the user (DB existence) before persisting in a single SaveChanges.
    public async Task<WorkflowOutcome<TaskItem>> CreateAsync(
        // Surrogate id of the TaskType to instantiate.
        int taskTypeId,
        // Surrogate id of the user the new task is initially assigned to. Must be > 0.
        int initialAssignedUserId,
        // Propagated to EF so client disconnects abort the save instead of completing it.
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

        // Wall-clock instant stamped on UpdatedAtUtc / CreatedAtUtc for the new task.
        var nowUtc = time.GetUtcNow().UtcDateTime;
        // New TaskItem aggregate produced by the domain factory; status is set to the type's first step.
        var task = TaskItem.Create(type!, initialAssignedUserId, nowUtc);
        db.Tasks.Add(task);
        DetachStatusDefinitionNavigations(task);
        await db.SaveChangesAsync(ct);
        logger.LogInformation(
            "Task {TaskId} created in type {TaskTypeId} assigned to user {UserId}.",
            task.Id, taskTypeId, initialAssignedUserId);
        return WorkflowOutcome<TaskItem>.Success(task);
    }

    // Moves a task to a new status, validating the transition + per-status custom data + the
    // next assignee in one atomic SaveChanges. Engine produces the outcome; we only persist.
    public async Task<WorkflowOutcome<TaskItem>> ChangeStatusAsync(
        // Surrogate id of the task being transitioned.
        int taskId,
        // Target StatusDefinition.Code (1-based, ascending). Workflow engine validates direction.
        int newStatus,
        // Per-status custom-data payload. Shape is validated by CustomDataParser inside the engine.
        JsonElement customData,
        // Surrogate id of the user the task should be assigned to after the move. Must be > 0.
        int nextAssignedUserId,
        // Propagated through EF so client disconnects abort the transition.
        CancellationToken ct = default)
    {
        // Tracked TaskItem aggregate loaded with the relations the engine inspects + mutates.
        var task = await LoadTrackedAsync(taskId, ct);
        if (task is null)
        {
            return WorkflowOutcome<TaskItem>.Failure(new WorkflowError.TaskNotFound(taskId));
        }

        if (!await db.Users.TagWith("TaskService.ChangeStatusAsync/NextUserExists").AnyAsync(u => u.Id == nextAssignedUserId, ct))
        {
            return WorkflowOutcome<TaskItem>.Failure(new WorkflowError.UnknownUser(nextAssignedUserId));
        }

        // Wall-clock instant stamped on the new assignment + UpdatedAtUtc.
        var nowUtc = time.GetUtcNow().UtcDateTime;
        // Result of running every workflow rule against the in-memory entity. Engine never touches DB.
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

    // Edits captured custom-data on a prior or the current status without moving the task forward.
    // The UX affordance lets users fix mistakes in earlier steps.
    public async Task<WorkflowOutcome<TaskItem>> UpdateStepDataAsync(
        // Surrogate id of the task whose step data is being rewritten.
        int taskId,
        // The status code whose captured data is being edited. Must be ≤ current status (engine-enforced).
        int status,
        // Replacement custom-data payload for that step; re-validated by CustomDataParser.
        JsonElement customData,
        // User the step's assignment row should reflect after the edit.
        int assignedUserId,
        // Aborts the update + SaveChanges if the client disconnects.
        CancellationToken ct = default)
    {
        // Tracked TaskItem loaded with field values + assignments so the engine can edit them in-memory.
        var task = await LoadTrackedAsync(taskId, ct);
        if (task is null)
        {
            return WorkflowOutcome<TaskItem>.Failure(new WorkflowError.TaskNotFound(taskId));
        }

        if (!await db.Users.TagWith("TaskService.UpdateStepDataAsync/UserExists").AnyAsync(u => u.Id == assignedUserId, ct))
        {
            return WorkflowOutcome<TaskItem>.Failure(new WorkflowError.UnknownUser(assignedUserId));
        }

        // Wall-clock instant stamped on UpdatedAtUtc when the engine accepts the edit.
        var nowUtc = time.GetUtcNow().UtcDateTime;
        // Engine outcome carrying either the mutated entity or a WorkflowError to convert to ProblemDetails.
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

    // Marks a task closed. Closed tasks become immutable (enforced in the domain by MoveTo).
    public async Task<WorkflowOutcome<TaskItem>> CloseAsync(
        // Surrogate id of the task being closed.
        int taskId,
        // Aborts the close + SaveChanges if the client disconnects.
        CancellationToken ct = default)
    {
        // Tracked TaskItem so MarkClosed runs against the row EF will persist.
        var task = await LoadTrackedAsync(taskId, ct);
        if (task is null)
        {
            return WorkflowOutcome<TaskItem>.Failure(new WorkflowError.TaskNotFound(taskId));
        }

        // Engine validates the close (only valid from the final status); we persist on success.
        var outcome = engine.Close(task, time.GetUtcNow().UtcDateTime);
        if (outcome.IsSuccess)
        {
            await db.SaveChangesAsync(ct);
            logger.LogInformation("Task {TaskId} closed.", task.Id);
        }

        return outcome;
    }

    // Slim list query for the task table. AsNoTracking + a single Include of the current status —
    // intentionally lighter than GetByIdAsync because the list view doesn't need field values.
    public async Task<IReadOnlyList<TaskItem>> ListAsync(
        // Optional user / type / closed filters; missing values fall through to "no restriction".
        TaskListFilters filters,
        // Aborts the query if the client disconnects.
        CancellationToken ct = default)
    {
        // Starting LINQ query. Tagged for SQL Server's dm_exec_query_stats attribution.
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

    // Read-by-id for the detail screen. IgnoreQueryFilters lets us see soft-deleted field-values
    // while explicitly re-applying the IsDeleted == null guard at the task level (so deleted tasks 404).
    public Task<TaskItem?> GetByIdAsync(
        // Surrogate id of the task to fetch.
        int taskId,
        // Aborts the query if the client disconnects.
        CancellationToken ct = default) =>
        db.Tasks
            .TagWith("TaskService.GetByIdAsync")
            .AsNoTracking()
            .IgnoreQueryFilters()
            .Where(t => t.IsDeleted == null)
            .Include(t => t.CurrentStatusDefinition)
            .Include(t => t.FieldValues)
            .Include(t => t.Assignments)
            .FirstOrDefaultAsync(t => t.Id == taskId, ct);

    // Users picker source. AsNoTracking + alpha ordering — cheap enough to be uncached today.
    public async Task<IReadOnlyList<User>> GetAllUsersAsync(
        // Aborts the query if the client disconnects.
        CancellationToken ct = default) =>
        await db.Users
            .TagWith("TaskService.GetAllUsersAsync")
            .AsNoTracking()
            .OrderBy(u => u.FullName)
            .ToListAsync(ct);

    // TaskTypes are served straight from the in-memory registry; no DB round-trip.
    public IReadOnlyCollection<TaskType> GetTaskTypes() => registry.All;

    // Foot-gun guard: the engine assigns a registry-cached (AsNoTracking) StatusDefinition to the
    // tracked entity. Without marking it Unchanged, EF would INSERT a duplicate parent row on
    // SaveChanges. Do not remove without rethinking the registry/tracking interaction.
    private void DetachStatusDefinitionNavigations(
        // The freshly-mutated TaskItem whose CurrentStatusDefinition came from the registry cache.
        TaskItem task)
    {
        if (task.CurrentStatusDefinition is { } status)
        {
            // EF entry for the navigation — we flip its State so only the FK column updates.
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
    private Task<TaskItem?> LoadTrackedAsync(
        // Surrogate id of the task to load (tracked, with relations the engine needs).
        int taskId,
        // Propagated to EF so client disconnects abort the load.
        CancellationToken ct) =>
        db.Tasks
            .TagWith("TaskService.LoadTrackedAsync")

            .Include(t => t.CurrentStatusDefinition)
            .Include(t => t.FieldValues)
            .Include(t => t.Assignments)
            .IgnoreQueryFilters()
            .Where(t => t.IsDeleted == null)
            .FirstOrDefaultAsync(t => t.Id == taskId, ct);
}
