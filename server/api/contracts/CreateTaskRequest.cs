using System.ComponentModel.DataAnnotations;

namespace TaskPlatform.Api.Contracts;

/// <summary>
/// Body for POST /api/tasks. New tasks always start at status 1; [Range] rejects 0/negative ids at the DTO layer.
/// </summary>
// Wire shape for task creation. New tasks always start at status 1 — that's domain policy,
// not configurable through this DTO. Both ids are surrogate keys validated by [Range].
public sealed record CreateTaskRequest(
    // Foreign key into TaskTypes — the engine looks up the type from ITaskTypeRegistry.
    [param: Range(1, int.MaxValue)] int TaskTypeId,
    // Required initial assignee; mapped onto TaskItem.CurrentAssignedUserId at creation time.
    [param: Range(1, int.MaxValue)] int InitialAssignedUserId);
