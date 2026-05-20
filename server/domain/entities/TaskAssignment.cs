using TaskPlatform.Domain.Workflow;

namespace TaskPlatform.Domain.Entities;

/// <summary>
/// Who was responsible for a task at status X. Hard-deleted on backward moves, recreated on forward re-entry.
/// </summary>
public sealed class TaskAssignment
{
    public int TaskId { get; private set; }
    public int StatusDefinitionId { get; private set; }
    public int AssignedUserId { get; private set; }
    public DateTime AssignedAtUtc { get; private set; }

    private TaskAssignment() { }

    internal static TaskAssignment Capture(int taskId, int statusDefinitionId, int userId, DateTime nowUtc) => new()
    {
        TaskId = taskId,
        StatusDefinitionId = statusDefinitionId,
        AssignedUserId = userId,
        AssignedAtUtc = nowUtc,
    };

    internal void Update(int userId, DateTime nowUtc)
    {
        AssignedUserId = userId;
        AssignedAtUtc = nowUtc;
    }
}
