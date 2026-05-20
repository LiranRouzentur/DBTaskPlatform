using System.ComponentModel.DataAnnotations;
using System.Text.Json;

namespace TaskPlatform.Api.Contracts;

/// <summary>
/// Body for POST /api/tasks/{id}/status. <c>NewStatus</c> = target code; <c>CustomData</c> stays as JsonElement for schema-aware parsing.
/// </summary>
public sealed record ChangeStatusRequest(
    [param: Range(1, int.MaxValue)] int NewStatus,
    [param: Range(1, int.MaxValue)] int NextAssignedUserId,
    JsonElement CustomData);
