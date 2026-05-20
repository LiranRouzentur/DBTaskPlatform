using System.ComponentModel.DataAnnotations;
using System.Text.Json;

namespace TaskPlatform.Api.Contracts;

/// <summary>
/// Body for POST /api/tasks/{id}/steps. Edits a status's data + assignee in place (no movement).
/// </summary>
// Wire shape for the step-edit endpoint. Unlike ChangeStatusRequest, this rewrites data for a
// status the task already passed through (or the current one) without advancing the workflow.
public sealed record UpdateStepDataRequest(
    // Target status Code whose captured data is being rewritten. Must be at or before current.
    [param: Range(1, int.MaxValue)] int Status,
    // Assignee snapshot for that status's history row.
    [param: Range(1, int.MaxValue)] int AssignedUserId,
    // Raw JSON body parsed by CustomDataParser against the target status's field specs.
    JsonElement CustomData);
