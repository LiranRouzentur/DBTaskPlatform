using System.ComponentModel.DataAnnotations;
using System.Text.Json;

namespace TaskPlatform.Api.Contracts;

/// <summary>
/// Body for POST /api/tasks/{id}/steps. Edits a status's data + assignee in place (no movement).
/// </summary>
public sealed record UpdateStepDataRequest(
    [param: Range(1, int.MaxValue)] int Status,
    [param: Range(1, int.MaxValue)] int AssignedUserId,
    JsonElement CustomData);
