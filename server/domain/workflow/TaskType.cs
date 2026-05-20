namespace TaskPlatform.Domain.Workflow;

// Workflow definition: ordered StatusDefinitions + unique final status. Cached by
// TaskTypeRegistry. Seed() fails fast if exactly-one-final is violated.
public sealed class TaskType
{
    // Surrogate PK. Pinned via ValueGeneratedNever for stable cross-environment references.
    public int Id { get; private set; }
    // Display name of the workflow (e.g. "Procurement"). Empty-string default avoids null.
    public string Name { get; private set; } = "";

    // Backing list for Statuses — populated only through Seed(). Empty after default-construction
    // so EF can hydrate before nav property loads.
    private readonly List<StatusDefinition> _statuses = [];
    // Read-only projection of every status row associated with this workflow.
    public IReadOnlyList<StatusDefinition> Statuses => _statuses;

    // Convenience accessor — workflow code of the unique final status. Single() throws if the
    // invariant is violated, which doubles as a defensive runtime check.
    public int FinalStatusCode => Statuses.Single(s => s.IsFinal).Code;

    // The unique terminal StatusDefinition row. Used by the engine to detect close-at-final.
    public StatusDefinition FinalStatus => Statuses.Single(s => s.IsFinal);

    // Private parameterless constructor for EF materialization only.
    private TaskType() { }

    // Seed-only factory. Validates the exactly-one-final invariant upfront so a malformed seed
    // fails the application boot, not the first runtime request.
    public static TaskType Seed(
        // Pinned surrogate id for the workflow.
        int id,
        // Display name.
        string name,
        // Status rows that make up this workflow. Order is not assumed here — Position drives it.
        IEnumerable<StatusDefinition> statuses)
    {
        // Materialized snapshot of the input sequence so we can count and reuse it.
        var staged = statuses.ToList();
        // Number of statuses flagged IsFinal — must be exactly one for a well-formed workflow.
        var finalCount = staged.Count(s => s.IsFinal);
        if (finalCount != 1)
        {
            throw new ArgumentException(
                $"TaskType '{name}' must have exactly one final status (got {finalCount}).",
                nameof(statuses));
        }
        // The freshly-constructed TaskType ready to have its status list populated.
        var type = new TaskType { Id = id, Name = name };
        type._statuses.AddRange(staged);
        return type;
    }
}
