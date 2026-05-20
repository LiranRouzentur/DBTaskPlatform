namespace TaskPlatform.Domain.Workflow;

/// <summary>
/// Lookup row backing the <see cref="StatusFieldKind"/> enum (DB-level FK integrity only).
/// </summary>
public sealed class StatusFieldKindRow
{
    public int Id { get; private set; }
    public string Kind { get; private set; } = "";

    private StatusFieldKindRow() { }

    public static StatusFieldKindRow Seed(int id, string kind) => new()
    {
        Id = id,
        Kind = kind,
    };
}
