using TaskPlatform.Domain.Entities;
using TaskPlatform.Domain.Workflow;

namespace TaskPlatform.Application.Mapping;

// Inverse of CustomDataParser; used only by ResponseMapper.ToDetail. Same StatusFieldKind
// dispatch as the parser — keep both in lock-step when a new kind is added.
public static class CustomDataWriter
{
    public static IReadOnlyDictionary<string, object?> Write(
        IReadOnlyList<TaskFieldValue> values,
        IReadOnlyDictionary<int, StatusFieldSpec> specsById)
    {
        
        var bySpec = values
            .GroupBy(v => v.StatusFieldSpecId)
            .ToDictionary(g => g.Key, g => g.OrderBy(v => v.ItemIndex).ToList());

        var dict = new Dictionary<string, object?>(bySpec.Count);
        foreach (var (specId, rows) in bySpec)
        {
            var spec = specsById[specId];
            object? payload = spec.ItemCount > 1
                ? ItemsArray(rows, spec)
                : ScalarValue(rows[0], spec);
            dict[spec.Name] = payload;
        }
        return dict;
    }

    private static object? ScalarValue(TaskFieldValue row, StatusFieldSpec spec) =>
        spec.Kind switch
        {
            StatusFieldKind.String => row.StringValue,
            StatusFieldKind.Number => (object?)row.NumberValue,
            _ => null,
        };

    private static Array ItemsArray(IReadOnlyList<TaskFieldValue> rows, StatusFieldSpec spec) =>
        spec.Kind switch
        {
            StatusFieldKind.String => rows.Select(r => r.StringValue).ToArray(),
            StatusFieldKind.Number => rows.Select(r => r.NumberValue).ToArray(),
            _ => Array.Empty<object>(),
        };
}
