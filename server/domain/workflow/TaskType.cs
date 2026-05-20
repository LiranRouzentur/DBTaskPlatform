namespace TaskPlatform.Domain.Workflow;

// Workflow definition: ordered StatusDefinitions + unique final status. Cached by
// TaskTypeRegistry. Seed() fails fast if exactly-one-final is violated.
public sealed class TaskType
{
    public int Id { get; private set; }
    public string Name { get; private set; } = "";

    private readonly List<StatusDefinition> _statuses = [];
    public IReadOnlyList<StatusDefinition> Statuses => _statuses;

    public int FinalStatusCode => Statuses.Single(s => s.IsFinal).Code;

    public StatusDefinition FinalStatus => Statuses.Single(s => s.IsFinal);

    private TaskType() { }

    public static TaskType Seed(int id, string name, IEnumerable<StatusDefinition> statuses)
    {
        var staged = statuses.ToList();
        var finalCount = staged.Count(s => s.IsFinal);
        if (finalCount != 1)
        {
            throw new ArgumentException(
                $"TaskType '{name}' must have exactly one final status (got {finalCount}).",
                nameof(statuses));
        }
        var type = new TaskType { Id = id, Name = name };
        type._statuses.AddRange(staged);
        return type;
    }
}
