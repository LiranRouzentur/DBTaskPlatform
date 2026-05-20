using TaskPlatform.Domain.Workflow;

namespace TaskPlatform.Domain.Entities;

/// <summary>
/// Who was responsible for a task at status X. Hard-deleted on backward moves, recreated on forward re-entry.
/// </summary>
// Composite natural key: (TaskId, StatusDefinitionId). One row per status the task has visited.
public sealed class TaskAssignment
{
    // FK to the owning task — part of the composite natural key.
    public int TaskId { get; private set; }
    // FK to the StatusDefinition this assignment belongs to — part of the composite natural key.
    public int StatusDefinitionId { get; private set; }
    // The user id responsible for the task at this status.
    public int AssignedUserId { get; private set; }
    // UTC timestamp when this assignment was recorded or last updated.
    public DateTime AssignedAtUtc { get; private set; }

    // Private parameterless constructor for EF materialization only.
    private TaskAssignment() { }

    // Factory for new assignment rows. Called by TaskItem when entering a status that doesn't yet
    // have an assignment row in the local history.
    internal static TaskAssignment Capture(
        // Owning task id; may be 0 when the row is staged before the task itself has an id (EF
        // populates the FK on save via the navigation).
        int taskId,
        // FK to the StatusDefinition this assignment row covers.
        int statusDefinitionId,
        // User id responsible at this status.
        int userId,
        // Clock for AssignedAtUtc.
        DateTime nowUtc) => new()
    {
        TaskId = taskId,
        StatusDefinitionId = statusDefinitionId,
        AssignedUserId = userId,
        AssignedAtUtc = nowUtc,
    };

    // Refreshes the responsible user / timestamp on an existing row. Used by the upsert path when
    // a status is re-visited (e.g. correcting step data through /steps).
    internal void Update(
        // New user id to record as responsible at this status.
        int userId,
        // Clock for the refreshed AssignedAtUtc.
        DateTime nowUtc)
    {
        AssignedUserId = userId;
        AssignedAtUtc = nowUtc;
    }
}
