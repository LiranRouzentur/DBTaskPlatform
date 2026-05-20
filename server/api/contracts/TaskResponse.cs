namespace TaskPlatform.Api.Contracts;

/// <summary>
/// Slim row for GET /api/tasks; the client lazy-loads <see cref="TaskDetail"/> when a row opens.
/// </summary>
public sealed record TaskListItem(
    int Id,
    int TaskTypeId,
    int Status,
    bool IsClosed,
    int AssignedUserId,
    DateTime UpdatedAtUtc);

/// <summary>
/// Full task projection. customData/assignee maps keyed by status code; retiredStatuses lists codes with soft-deleted data.
/// </summary>
public sealed record TaskDetail(
    int Id,
    int TaskTypeId,
    int Status,
    bool IsClosed,
    int AssignedUserId,
    IReadOnlyDictionary<int, IReadOnlyDictionary<string, object?>> CustomDataByStatus,
    IReadOnlyDictionary<int, int> AssigneeByStatus,
    IReadOnlyList<int> RetiredStatuses,
    DateTime UpdatedAtUtc);
