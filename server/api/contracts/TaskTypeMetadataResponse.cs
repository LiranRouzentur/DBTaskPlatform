namespace TaskPlatform.Api.Contracts;

/// <summary>
/// Wire shape of /api/task-types. <c>Kind</c> is the StatusFieldKind enum stringified ("String"/"Number").
/// </summary>
// Top-level task-type metadata returned by /api/task-types. Drives the Angular dynamic form so
// adding a task type is a data change (DB rows) rather than a code change.
public sealed record TaskTypeMetadataResponse(
    // Surrogate key — used as the foreign key on TaskItem.TaskTypeId.
    int Id,
    // Display name shown in the task-type picker.
    string Name,
    // Public Code of the type's final status — used by the client to gate the Close action.
    int FinalStatus,
    // Ordered status definitions for this task type (sorted by Position server-side).
    IReadOnlyList<StatusMetadataResponse> Statuses);

// Per-status metadata block — one entry per StatusDefinition row for a task type.
public sealed record StatusMetadataResponse(
    // Public status Code (integer label rendered in the workflow stepper).
    int Status,
    // Display name for the status (e.g. "Approved", "Closed").
    string Name,
    // Ordered field specs for this status (sorted by Position server-side).
    IReadOnlyList<FieldSpecMetadataResponse> Fields);

// Per-field spec metadata — describes one StatusFieldSpec row to the dynamic-form renderer.
public sealed record FieldSpecMetadataResponse(
    // Field label / form-control key shown in the dynamic form.
    string Name,
    // Stringified StatusFieldKind enum ("String" or "Number"). The CustomDataParser switch on
    // this value is the only allowed type-based switch in the workflow path.
    string Kind,
    // Number of values to capture. 1 → scalar control; >1 → fixed-length FormArray (no add/remove).
    int ItemCount,
    // Optional minimum (length for strings, value for numbers) used by client + server validators.
    int? Min,
    // Optional maximum (length for strings, value for numbers) used by client + server validators.
    int? Max);
