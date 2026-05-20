namespace TaskPlatform.Domain.Workflow;

/// <summary>
/// Lookup row backing the <see cref="StatusFieldKind"/> enum (DB-level FK integrity only).
/// </summary>
// Surrogate ids are pinned via ValueGeneratedNever so the integer values match the enum exactly.
// Adding a new enum value requires inserting a matching row through a migration — keeps FK
// integrity between StatusFieldSpec.KindId and the lookup table at the DB level.
public sealed class StatusFieldKindRow
{
    // Pinned surrogate id matching the StatusFieldKind enum value (1=String, 2=Number).
    public int Id { get; private set; }
    // Human-readable kind name persisted alongside the id for ad-hoc DB inspection.
    public string Kind { get; private set; } = "";

    // Private parameterless constructor for EF materialization only.
    private StatusFieldKindRow() { }

    // Seed-only factory used by the initial migration to populate the lookup table.
    public static StatusFieldKindRow Seed(
        // Pinned id — must match the corresponding StatusFieldKind enum value.
        int id,
        // Display name of the kind (e.g. "String", "Number").
        string kind) => new()
    {
        Id = id,
        Kind = kind,
    };
}
