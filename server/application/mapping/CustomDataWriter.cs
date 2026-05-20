using TaskPlatform.Domain.Entities;
using TaskPlatform.Domain.Workflow;

namespace TaskPlatform.Application.Mapping;

// Inverse of CustomDataParser; used only by ResponseMapper.ToDetail. Same StatusFieldKind
// dispatch as the parser — keep both in lock-step when a new kind is added.
public static class CustomDataWriter
{
    // Reshapes the flat TaskFieldValue rows into a per-field JSON object: scalar fields become
    // single values, multi-item fields become arrays ordered by ItemIndex.
    public static IReadOnlyDictionary<string, object?> Write(
        // Captured field-value rows for the status whose data we're projecting back to JSON.
        IReadOnlyList<TaskFieldValue> values,
        // Lookup from StatusFieldSpec.Id → spec metadata; supplied by the caller (response mapper).
        IReadOnlyDictionary<int, StatusFieldSpec> specsById)
    {
        // Group values by spec id so each output property corresponds to one spec. Sorted by
        // ItemIndex inside each bucket so arrays come back in their original order.
        var bySpec = values
            .GroupBy(v => v.StatusFieldSpecId)
            .ToDictionary(g => g.Key, g => g.OrderBy(v => v.ItemIndex).ToList());

        // Output map: field-name → scalar / array payload. Reserved at the bucket count to skip a regrow.
        var dict = new Dictionary<string, object?>(bySpec.Count);
        foreach (var (specId, rows) in bySpec)
        {
            // Resolved spec metadata — Kind selects the scalar/array shape and the underlying column.
            var spec = specsById[specId];
            // Per-field payload: either an array (ItemCount > 1) or the single underlying value.
            object? payload = spec.ItemCount > 1
                ? ItemsArray(rows, spec)
                : ScalarValue(rows[0], spec);
            dict[spec.Name] = payload;
        }
        return dict;
    }

    // Scalar projection — reads the kind-appropriate column off the single row. Mirrors ProcessSingle.
    private static object? ScalarValue(
        // The single value row holding the captured scalar.
        TaskFieldValue row,
        // Spec describing which column (String / Number) to read.
        StatusFieldSpec spec) =>
        spec.Kind switch
        {
            StatusFieldKind.String => row.StringValue,
            StatusFieldKind.Number => (object?)row.NumberValue,
            _ => null,
        };

    // Array projection — materializes a typed array (string[] or decimal?[]) preserving item order.
    private static Array ItemsArray(
        // Pre-sorted (by ItemIndex) rows for one multi-item field.
        IReadOnlyList<TaskFieldValue> rows,
        // Spec describing which column to read across rows.
        StatusFieldSpec spec) =>
        spec.Kind switch
        {
            StatusFieldKind.String => rows.Select(r => r.StringValue).ToArray(),
            StatusFieldKind.Number => rows.Select(r => r.NumberValue).ToArray(),
            _ => Array.Empty<object>(),
        };
}
