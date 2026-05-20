namespace TaskPlatform.Domain.Workflow;

/// <summary>
/// One status in a workflow. Id=pinned PK; Code=ascending workflow int; Position=display order; one IsFinal per type.
/// </summary>
public sealed class StatusDefinition
{
    public int Id { get; private set; }
    public int TaskTypeId { get; private set; }
    public int Code { get; private set; }
    public string Name { get; private set; } = "";
    public int Position { get; private set; }
    public bool IsFinal { get; private set; }

    // Backing field — EF binds via PropertyAccessMode.Field so the read-only nav property cannot
    // be mutated from outside (status-field specs are immutable after seeding).
    private readonly List<StatusFieldSpec> _fields = [];
    public IReadOnlyList<StatusFieldSpec> Fields => _fields;

    private StatusDefinition() { }

    /// <summary>
    /// Builds a fully-populated StatusDefinition for the seeder, wiring each child spec's parent FK.
    /// </summary>
    public static StatusDefinition Seed(
        int id,
        int taskTypeId,
        int code,
        string name,
        int position,
        bool isFinal,
        IEnumerable<StatusFieldSpec> fields)
    {
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
