namespace TaskPlatform.Domain.Workflow;

/// <summary>
/// Required custom field on a status. ItemCount=1 scalar / &gt;1 fixed array; Min/Max are length-or-value bounds by Kind.
/// </summary>
// Metadata only — never carries captured data itself (that lives on TaskFieldValue). Loaded by
// the registry alongside its parent StatusDefinition.
public sealed class StatusFieldSpec
{
    // Surrogate PK pinned via ValueGeneratedNever — see ADR-07 in decisions.md.
    public int Id { get; private set; }
    // FK to the owning StatusDefinition. Wired by StatusDefinition.Seed via SetParent.
    public int StatusDefinitionId { get; private set; }
    // Display name shown in the dynamic form and used as the error key in InvalidData.Errors.
    public string Name { get; private set; } = "";

    // FK to the StatusFieldKindRow lookup. Backed by an int so EF can model the FK directly while
    // the strongly-typed Kind property exposes the enum to domain code.
    public int KindId { get; private set; }

    // 1 → scalar, >1 → fixed-length array. The Angular layer builds a FormControl vs FormArray
    // from this number (see TaskFormBuilder).
    public int ItemCount { get; private set; }

    // Lower bound (inclusive). For String, it's a length lower bound; for Number, a value lower
    // bound. Null means unbounded on this side.
    public int? Min { get; private set; }

    // Upper bound (inclusive). For String, it's a length upper bound; for Number, a value upper
    // bound. Null means unbounded on this side.
    public int? Max { get; private set; }

    // Display order within the parent status.
    public int Position { get; private set; }

    // Strongly-typed projection of KindId. Used by CustomDataParser.ProcessSingle's permitted
    // switch on StatusFieldKind.
    public StatusFieldKind Kind => (StatusFieldKind)KindId;

    // Private parameterless constructor for EF materialization only.
    private StatusFieldSpec() { }

    // Wires the parent FK after construction. Called from StatusDefinition.Seed so the seeder can
    // build child specs without already knowing the parent's pinned id at construction time.
    internal void SetParent(
        // The pinned id of the owning StatusDefinition.
        int statusDefinitionId)
    {
        StatusDefinitionId = statusDefinitionId;
    }

    // Seed-only factory used by DatabaseSeeder to construct spec metadata rows.
    public static StatusFieldSpec Seed(
        // Pinned surrogate id.
        int id,
        // Display name.
        string name,
        // Strongly-typed kind — mapped onto KindId via the (int) cast.
        StatusFieldKind kind,
        // 1 = scalar, >1 = fixed array length.
        int itemCount,
        // Display order within the parent status.
        int position,
        // Optional lower bound (length for String, value for Number).
        int? min = null,
        // Optional upper bound (length for String, value for Number).
        int? max = null) => new()
    {
        Id = id,
        Name = name,
        KindId = (int)kind,
        ItemCount = itemCount,
        Position = position,
        Min = min,
        Max = max,
    };
}
