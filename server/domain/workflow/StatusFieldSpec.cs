namespace TaskPlatform.Domain.Workflow;

/// <summary>
/// Required custom field on a status. ItemCount=1 scalar / &gt;1 fixed array; Min/Max are length-or-value bounds by Kind.
/// </summary>
public sealed class StatusFieldSpec
{
    public int Id { get; private set; }
    public int StatusDefinitionId { get; private set; }
    public string Name { get; private set; } = "";

    public int KindId { get; private set; }

    public int ItemCount { get; private set; }

    public int? Min { get; private set; }

    public int? Max { get; private set; }

    public int Position { get; private set; }

    public StatusFieldKind Kind => (StatusFieldKind)KindId;

    private StatusFieldSpec() { }

    internal void SetParent(int statusDefinitionId)
    {
        StatusDefinitionId = statusDefinitionId;
    }

    public static StatusFieldSpec Seed(
        int id,
        string name,
        StatusFieldKind kind,
        int itemCount,
        int position,
        int? min = null,
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
