namespace TaskPlatform.Domain.Workflow;

/// <summary>
/// Custom-field types. Adding a value requires arms in CustomDataParser/Writer + a row in StatusFieldKindRow.
/// </summary>
public enum StatusFieldKind
{
    String = 1,
    Number = 2,
}
