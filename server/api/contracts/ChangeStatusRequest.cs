using System.ComponentModel.DataAnnotations;
using System.Text.Json;

namespace TaskPlatform.Api.Contracts;

/// <summary>
/// Body for POST /api/tasks/{id}/status. <c>NewStatus</c> = target code; <c>CustomData</c> stays as JsonElement for schema-aware parsing.
/// </summary>
// Wire shape for status transitions. CustomData stays as a raw JsonElement so CustomDataParser
// can validate per-status schema (the only place a switch on StatusFieldKind is allowed).
public sealed record ChangeStatusRequest(
    // Target status Code. [Range] rejects 0/negative at the DTO layer before reaching the engine.
    [param: Range(1, int.MaxValue)] int NewStatus,
    // Required assignee for the new status; the engine enforces non-zero via InvalidNextUser.
    [param: Range(1, int.MaxValue)] int NextAssignedUserId,
    // Raw JSON body for per-status fields — never typed at the DTO layer to keep the API generic.
    JsonElement CustomData);
