using TaskPlatform.Domain.Workflow;

namespace TaskPlatform.Domain.Entities;

// One value per (task, spec, itemIndex) triple, polymorphic on Kind (StringValue OR NumberValue).
// Mutation internal — only TaskItem.UpsertFieldValues may change. `Spec` nav is configured but
// intentionally NOT loaded; callers resolve spec metadata via the registry by FK.
public sealed class TaskFieldValue
{
    // Surrogate PK assigned by the database on INSERT.
    public int Id { get; private set; }
    // FK to the owning TaskItem. Part of the natural key in conjunction with StatusFieldSpecId / ItemIndex.
    public int TaskId { get; private set; }
    // FK to the StatusFieldSpec metadata row this value satisfies. Drives shape/kind resolution.
    public int StatusFieldSpecId { get; private set; }

    // Position within an array-valued spec. ItemCount=1 specs always carry index 1; ItemCount>1
    // specs produce a fixed-length series (1..N). Part of the natural unique key.
    public int ItemIndex { get; private set; } = 1;

    // Navigation to the StatusFieldSpec. Configured for FK integrity but typically left unloaded —
    // the registry is the authoritative source of spec metadata at runtime.
    public StatusFieldSpec Spec { get; private set; } = default!;

    // String payload for specs of Kind=String. Null when this row represents a number.
    public string? StringValue { get; private set; }
    // Decimal payload for specs of Kind=Number. Null when this row represents a string.
    public decimal? NumberValue { get; private set; }

    // Soft-delete flag (null = live, true = retired). Matches the partial unique index that
    // permits only one live row per (TaskId, StatusFieldSpecId, ItemIndex) tuple — see R-01.
    public bool? IsDeleted { get; private set; }

    // Private parameterless constructor for EF materialization only.
    private TaskFieldValue() { }

    // Mark this row as retired. Called by TaskItem when a backward move retires values above the
    // new target, or when an upsert removes a previously-set entry.
    internal void MarkDeleted() => IsDeleted = true;

    // Reassign the captured payload and revive the row (IsDeleted cleared to null = live). Used by
    // the upsert path when a previously-soft-deleted row is re-entered on a forward move.
    internal void SetValues(
        // New string payload (null for number-kind specs).
        string? stringValue,
        // New decimal payload (null for string-kind specs).
        decimal? numberValue)
    {
        StringValue = stringValue;
        NumberValue = numberValue;
        IsDeleted = null;
    }

    // Factory for a string-kind value. Used by CustomDataWriter / the seeder to construct rows
    // without exposing the property setters.
    public static TaskFieldValue ForString(
        // Owning task id; left as 0 when constructing pre-INSERT (EF will populate on save).
        int taskId,
        // Spec metadata this value satisfies — supplies the FK and kind assertion.
        StatusFieldSpec spec,
        // Captured string payload.
        string value,
        // Position within the array (1-based). Defaults to 1 for scalar specs.
        int itemIndex = 1) => new()
    {
        TaskId = taskId,
        StatusFieldSpecId = spec.Id,
        ItemIndex = itemIndex,
        StringValue = value,
    };

    // Factory for a number-kind value. Mirrors ForString but writes to NumberValue.
    public static TaskFieldValue ForNumber(
        // Owning task id; left as 0 when constructing pre-INSERT.
        int taskId,
        // Spec metadata this value satisfies.
        StatusFieldSpec spec,
        // Captured decimal payload.
        decimal value,
        // Position within the array (1-based). Defaults to 1 for scalar specs.
        int itemIndex = 1) => new()
    {
        TaskId = taskId,
        StatusFieldSpecId = spec.Id,
        ItemIndex = itemIndex,
        NumberValue = value,
    };
}
