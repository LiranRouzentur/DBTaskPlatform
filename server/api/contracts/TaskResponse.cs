namespace TaskPlatform.Api.Contracts;

/// <summary>
/// Slim row for GET /api/tasks; the client lazy-loads <see cref="TaskDetail"/> when a row opens.
/// </summary>
// Slim wire shape used by the task list — kept narrow so the list endpoint stays cheap.
// Detail is fetched lazily on row open via GET /api/tasks/{id}.
public sealed record TaskListItem(
    // Surrogate key of the task row, used as the URL parameter on /api/tasks/{id} endpoints.
    int Id,
    // Foreign key into TaskTypes — drives row icon/colour on the client.
    int TaskTypeId,
    // Current status as the public Code value (not the surrogate StatusDefinition.Id).
    int Status,
    // True after the task has been closed; the client renders closed tasks as immutable.
    bool IsClosed,
    // Owner of the task right now — refreshed on each successful status transition.
    int AssignedUserId,
    // UTC timestamp of the last write; used for the "Updated" column and concurrency hints.
    DateTime UpdatedAtUtc);

/// <summary>
/// Full task projection. customData/assignee maps keyed by status code; retiredStatuses lists codes with soft-deleted data.
/// </summary>
// Full task projection returned by GET /api/tasks/{id}. CustomDataByStatus and AssigneeByStatus
// are keyed by public status Code (not the surrogate StatusDefinition.Id) so the client can
// look up per-status data without hitting /api/task-types.
public sealed record TaskDetail(
    // Surrogate key of the task row.
    int Id,
    // Foreign key into TaskTypes — pairs with /api/task-types metadata on the client.
    int TaskTypeId,
    // Current status as the public Code value.
    int Status,
    // True after the task has been closed (closed-immutable rule applies thereafter).
    bool IsClosed,
    // Current owner of the task; per-status historical owners live in AssigneeByStatus.
    int AssignedUserId,
    // Per-status captured data: statusCode → { fieldName → typed value }. Soft-deleted rows
    // are excluded — those surface via RetiredStatuses instead.
    IReadOnlyDictionary<int, IReadOnlyDictionary<string, object?>> CustomDataByStatus,
    // Per-status assignee snapshots — the user who owned the task when that status completed.
    IReadOnlyDictionary<int, int> AssigneeByStatus,
    // Status codes whose captured data has been soft-deleted (backward move) and never re-entered.
    // The client renders these as "needs re-entry" badges.
    IReadOnlyList<int> RetiredStatuses,
    // UTC timestamp of the last write to the task; reflected back to clients for staleness checks.
    DateTime UpdatedAtUtc);
