using System.Text.Json;
using TaskPlatform.Application.Mapping;
using TaskPlatform.Domain.Entities;
using TaskPlatform.Domain.Errors;
using TaskPlatform.Domain.Workflow;

namespace TaskPlatform.Application.Workflow;

// Generic workflow rule core. Pure (no DB, no HTTP, no logging); mutates the entity in-memory
// and lets TaskService persist. All type-specific dispatch goes through the registry and
// CustomDataParser — no `switch (taskType)` here.
public sealed class WorkflowEngine(
    // Singleton in-memory cache of TaskType → Statuses → Fields used to resolve the task's type.
    ITaskTypeRegistry registry)
{
    /// <summary>
    /// Forward/backward status move. Runs every generic rule, then defers to CustomDataParser.
    /// </summary>
    public WorkflowOutcome<TaskItem> ChangeStatus(
        // The tracked TaskItem whose status (and field values) will be mutated in-memory.
        TaskItem task,
        // Target StatusDefinition.Code (1-based, ascending). Direction is derived vs current.
        int targetCode,
        // Caller-supplied custom-data payload, validated by CustomDataParser against the target.
        JsonElement customData,
        // Surrogate id of the user the task should be assigned to after the move. Must be > 0.
        int nextAssignedUserId,
        // Wall-clock instant stamped on UpdatedAtUtc and the new assignment row.
        DateTime nowUtc)
    {
        // Closed tasks are immutable; reject before any further work.
        if (task.IsClosed)
        {
            return WorkflowOutcome<TaskItem>.Failure(new WorkflowError.ClosedImmutable());
        }

        // TaskType metadata (Statuses + Fields) for the type this task instance belongs to.
        var type = registry.Get(task.TaskTypeId);
        // Workflow Code currently held by the task — derived from CurrentStatusDefinitionId.
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

        // Highest Code in the type — moves above this are rejected as BeyondFinal.
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
        // The tracked TaskItem whose existing step data is being rewritten in-memory.
        TaskItem task,
        // Status Code whose captured data is being edited; must be ≤ current.
        int code,
        // Replacement custom-data payload; re-validated by CustomDataParser against this step's spec.
        JsonElement customData,
        // User the step's assignment row should reflect after the edit. Must be > 0.
        int assignedUserId,
        // Wall-clock instant stamped on UpdatedAtUtc when the engine accepts the edit.
        DateTime nowUtc)
    {
        if (task.IsClosed)
        {
            return WorkflowOutcome<TaskItem>.Failure(new WorkflowError.ClosedImmutable());
        }

        // TaskType metadata for the type this task belongs to.
        var type = registry.Get(task.TaskTypeId);
        // The task's current workflow Code — only steps at or below this code are editable.
        var currentCode = CurrentCodeOf(type, task);

        if (code < 1 || code > currentCode)
        {
            return WorkflowOutcome<TaskItem>.Failure(new WorkflowError.InvalidStatus(code));
        }

        if (assignedUserId <= 0)
        {
            return WorkflowOutcome<TaskItem>.Failure(new WorkflowError.InvalidNextUser());
        }

        // The StatusDefinition whose Fields[] describe the expected payload shape.
        var target = type.Statuses.FirstOrDefault(s => s.Code == code);
        if (target is null)
        {
            return WorkflowOutcome<TaskItem>.Failure(new WorkflowError.InvalidStatus(code));
        }

        // Same per-status data validation as ChangeStatus — exact same error projection.
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
    public WorkflowOutcome<TaskItem> Close(
        // The tracked TaskItem to mark closed.
        TaskItem task,
        // Wall-clock instant stamped on UpdatedAtUtc / ClosedAtUtc.
        DateTime nowUtc)
    {
        if (task.IsClosed)
        {
            return WorkflowOutcome<TaskItem>.Failure(new WorkflowError.AlreadyClosed());
        }

        // TaskType metadata used to resolve the final code we must be at to close.
        var type = registry.Get(task.TaskTypeId);
        // The highest Code in the type — only tasks at this Code may be closed.
        var finalCode = type.FinalStatusCode;
        // The task's current Code — compared against finalCode to gate the close.
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
    private static int CurrentCodeOf(
        // TaskType whose Statuses[] are searched for the matching definition id.
        TaskType type,
        // The task whose CurrentStatusDefinitionId we're mapping back to a Code.
        TaskItem task) =>
        type.Statuses.First(s => s.Id == task.CurrentStatusDefinitionId).Code;
}
