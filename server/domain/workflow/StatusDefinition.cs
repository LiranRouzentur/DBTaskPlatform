namespace TaskPlatform.Domain.Workflow;

/// <summary>
/// One status in a workflow. Id=pinned PK; Code=ascending workflow int; Position=display order; one IsFinal per type.
/// </summary>
// Each StatusDefinition owns its StatusFieldSpec children — the registry loads the whole graph
// AsNoTracking + AsSplitQuery to avoid Cartesian duplication.
public sealed class StatusDefinition
{
    // Surrogate PK pinned via ValueGeneratedNever — see ADR-07 in decisions.md.
    public int Id { get; private set; }
    // FK to the owning TaskType.
    public int TaskTypeId { get; private set; }
    // Ascending workflow code. Drives forward/backward comparisons in the engine; Code itself is
    // independent of display order so a workflow can be re-ordered visually without renumbering.
    public int Code { get; private set; }
    // Display name shown in pickers and detail views.
    public string Name { get; private set; } = "";
    // 1-based display order. Independent of Code so the UI can present statuses without coupling
    // the workflow numbering scheme.
    public int Position { get; private set; }
    // True for the single terminal status of the workflow. Enforced one-per-type by TaskType.Seed.
    public bool IsFinal { get; private set; }

    // Backing field — EF binds via PropertyAccessMode.Field so the read-only nav property cannot
    // be mutated from outside (status-field specs are immutable after seeding).
    private readonly List<StatusFieldSpec> _fields = [];
    // Read-only projection of the StatusFieldSpec rows attached to this status. May be empty for
    // statuses that capture no custom data.
    public IReadOnlyList<StatusFieldSpec> Fields => _fields;

    // Private parameterless constructor for EF materialization only.
    private StatusDefinition() { }

    /// <summary>
    /// Builds a fully-populated StatusDefinition for the seeder, wiring each child spec's parent FK.
    /// </summary>
    public static StatusDefinition Seed(
        // Pinned surrogate id for this status row.
        int id,
        // FK to the owning TaskType.
        int taskTypeId,
        // Ascending workflow code.
        int code,
        // Display name.
        string name,
        // Display order.
        int position,
        // Whether this status is the terminal one.
        bool isFinal,
        // Custom-data specs attached to this status. Their parent FK is wired here.
        IEnumerable<StatusFieldSpec> fields)
    {
        // The freshly-constructed StatusDefinition that we'll attach child specs to.
        var def = new StatusDefinition
        {
            Id = id,
            TaskTypeId = taskTypeId,
            Code = code,
            Name = name,
            Position = position,
            IsFinal = isFinal,
        };
        foreach (var f in fields)
        {
            f.SetParent(def.Id);
            def._fields.Add(f);
        }
        return def;
    }
}
