namespace TaskPlatform.Domain.Workflow;

/// <summary>
/// Custom-field types. Adding a value requires arms in CustomDataParser/Writer + a row in StatusFieldKindRow.
/// </summary>
// Drives the single permitted switch statement in the workflow path (CustomDataParser.ProcessSingle).
// Numeric values are pinned so the DB lookup table stays referentially stable across migrations.
public enum StatusFieldKind
{
    // Text payload — captured in TaskFieldValue.StringValue. Length bounded by Spec.Min/Max.
    String = 1,
    // Decimal payload — captured in TaskFieldValue.NumberValue. Value bounded by Spec.Min/Max.
    Number = 2,
}
