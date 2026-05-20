using System.Text.Json;
using TaskPlatform.Application.Mapping;
using TaskPlatform.Domain.Entities;
using TaskPlatform.Domain.Errors;
using TaskPlatform.Domain.Workflow;

namespace TaskPlatform.Application.Workflow;

// Generic workflow rule core. Pure (no DB, no HTTP, no logging); mutates the entity in-memory
// and lets TaskService persist. All type-specific dispatch goes through the registry and
// CustomDataParser — no `switch (taskType)` here.
public sealed class WorkflowEngine(ITaskTypeRegistry registry)
{
    /// <summary>
    /// Forward/backward status move. Runs every generic rule, then defers to CustomDataParser.
    /// </summary>
    public WorkflowOutcome<TaskItem> ChangeStatus(
        TaskItem task,
        int targetCode,
        JsonElement customData,
        int nextAssignedUserId,
        DateTime nowUtc)
    {
        // Closed tasks are immutable; reject before any further work.
        if (task.IsClosed)
        {
            return WorkflowOutcome<TaskItem>.Failure(new WorkflowError.ClosedImmutable());
        }

        var type = registry.Get(task.TaskTypeId);
        var currentCode = CurrentCodeOf(type, task);

        // No-op move: target == current. Surfaced as a distinct error so the UI can short-circuit.
        if (targetCode == currentCode)
        {
            return WorkflowOutcome<TaskItem>.Failure(new WorkflowError.NoMovement(targetCode));
        }

        // Statuses are ascending integers starting at 1.
        if (targetCode < 1)
        {
            return WorkflowOutcome<TaskItem>.Failure(new WorkflowError.InvalidStatus(targetCode));
        }

        // Forward moves must be sequential; backward moves bypass this branch and are unrestricted.
        if (targetCode > currentCode + 1)
        {
            return WorkflowOutcome<TaskItem>.Failure(
                new WorkflowError.NoForwardSkip(currentCode, targetCode));
        }

        var finalCode = type.FinalStatusCode;

        if (targetCode > finalCode)
        {
            return WorkflowOutcome<TaskItem>.Failure(
                new WorkflowError.BeyondFinal(targetCode, finalCode));
        }

        // Every status change must record the next assigned user.
        if (nextAssignedUserId <= 0)
        {
            return WorkflowOutcome<TaskItem>.Failure(new WorkflowError.InvalidNextUser());
        }

        // Defensive: a null here means a status row is missing in the middle of the range.
        var target = type.Statuses.FirstOrDefault(s => s.Code == targetCode);
        if (target is null)
        {
            return WorkflowOutcome<TaskItem>.Failure(new WorkflowError.InvalidStatus(targetCode));
        }

        // Type-specific data validated here (CustomDataParser is the only StatusFieldKind switch).
        var parsed = CustomDataParser.Parse(task.Id, target, customData);
        if (!parsed.Validation.IsValid)
        {
            return WorkflowOutcome<TaskItem>.Failure(new WorkflowError.InvalidData(parsed.Validation.Errors));
        }

        // MoveTo soft-deletes field values above target on backward moves; restores on forward.
        task.MoveTo(type, target, nextAssignedUserId, parsed.Values, nowUtc);
        return WorkflowOutcome<TaskItem>.Success(task);
    }

    /// <summary>
    /// In-place edit of a prior or current status's data + assignee; forward codes are rejected.
    /// </summary>
    public WorkflowOutcome<TaskItem> UpdateStepData(
        TaskItem task,
        int code,
        JsonElement customData,
        int assignedUserId,
        DateTime nowUtc)
    {
        if (task.IsClosed)
        {
            return WorkflowOutcome<TaskItem>.Failure(new WorkflowError.ClosedImmutable());
        }

        var type = registry.Get(task.TaskTypeId);
        var currentCode = CurrentCodeOf(type, task);

        if (code < 1 || code > currentCode)
        {
            return WorkflowOutcome<TaskItem>.Failure(new WorkflowError.InvalidStatus(code));
        }

        if (assignedUserId <= 0)
        {
            return WorkflowOutcome<TaskItem>.Failure(new WorkflowError.InvalidNextUser());
        }

        var target = type.Statuses.FirstOrDefault(s => s.Code == code);
        if (target is null)
        {
            return WorkflowOutcome<TaskItem>.Failure(new WorkflowError.InvalidStatus(code));
        }

        var parsed = CustomDataParser.Parse(task.Id, target, customData);
        if (!parsed.Validation.IsValid)
        {
            return WorkflowOutcome<TaskItem>.Failure(new WorkflowError.InvalidData(parsed.Validation.Errors));
        }

        task.UpdateStep(target, assignedUserId, parsed.Values, nowUtc);
        return WorkflowOutcome<TaskItem>.Success(task);
    }

    /// <summary>
    /// Close — valid only from the final status. Closed tasks become immutable thereafter.
    /// </summary>
    public WorkflowOutcome<TaskItem> Close(TaskItem task, DateTime nowUtc)
    {
        if (task.IsClosed)
        {
            return WorkflowOutcome<TaskItem>.Failure(new WorkflowError.AlreadyClosed());
        }

        var type = registry.Get(task.TaskTypeId);
        var finalCode = type.FinalStatusCode;
        var currentCode = CurrentCodeOf(type, task);
        if (currentCode != finalCode)
        {
            return WorkflowOutcome<TaskItem>.Failure(
                new WorkflowError.NotAtFinal(currentCode, finalCode));
        }

        task.MarkClosed(nowUtc);
        return WorkflowOutcome<TaskItem>.Success(task);
    }

    // Resolves the entity's FK to the workflow Code that the rule checks reason in.
    private static int CurrentCodeOf(TaskType type, TaskItem task) =>
        type.Statuses.First(s => s.Id == task.CurrentStatusDefinitionId).Code;
}
