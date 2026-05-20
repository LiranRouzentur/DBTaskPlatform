using System.ComponentModel.DataAnnotations;

namespace TaskPlatform.Api.Contracts;

/// <summary>
/// Body for POST /api/tasks. New tasks always start at status 1; [Range] rejects 0/negative ids at the DTO layer.
/// </summary>
public sealed record CreateTaskRequest(
    [param: Range(1, int.MaxValue)] int TaskTypeId,
    [param: Range(1, int.MaxValue)] int InitialAssignedUserId);
