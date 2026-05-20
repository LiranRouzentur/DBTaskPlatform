using System.Text.Json;
using TaskPlatform.Domain.Entities;
using TaskPlatform.Domain.Workflow;

namespace TaskPlatform.Application.Mapping;

// Single point that validates per-status custom-field data. Adding a StatusFieldKind touches
// this file + CustomDataWriter + the StatusFieldKinds lookup row — and nowhere else.
// Error shape Dictionary<fieldName, string[]> is sent as ProblemDetails.Extensions["errors"].
public static class CustomDataParser
{
    public static ParseResult Parse(
        int taskId,
        StatusDefinition status,
        JsonElement data)
    {
        var errors = new Dictionary<string, List<string>>();
        var values = new List<TaskFieldValue>(status.Fields.Count);
        var dataIsObject = data.ValueKind == JsonValueKind.Object;

        foreach (var field in status.Fields)
        {
            ProcessField(taskId, field, dataIsObject ? data : default, dataIsObject, errors, values);
        }

        if (errors.Count == 0)
        {
            return new ParseResult(ValidationResult.Success(), values);
        }

        var packed = errors.ToDictionary(kv => kv.Key, kv => kv.Value.ToArray());
        
        return new ParseResult(ValidationResult.Failure(packed), []);
    }

    private static void ProcessField(
        int taskId,
        StatusFieldSpec field,
        JsonElement data,
        bool dataIsObject,
        Dictionary<string, List<string>> errors,
        List<TaskFieldValue> values)
    {
        if (!dataIsObject)
        {
            AddError(errors, field.Name, "This field is required.");
            return;
        }

        if (!data.TryGetProperty(field.Name, out var prop) || prop.ValueKind == JsonValueKind.Null)
        {
            AddError(errors, field.Name, "This field is required.");
            return;
        }

        if (field.ItemCount > 1)
        {
            ProcessArray(taskId, field, prop, errors, values);
        }
        else
        {
            ProcessSingle(taskId, field, prop, errors, values, itemIndex: 1);
        }
    }

    private static void ProcessArray(
        int taskId,
        StatusFieldSpec field,
        JsonElement prop,
        Dictionary<string, List<string>> errors,
        List<TaskFieldValue> values)
    {
        if (prop.ValueKind != JsonValueKind.Array)
        {
            AddError(errors, field.Name, $"Must be an array of exactly {field.ItemCount} item(s).");
            return;
        }

        var items = prop.EnumerateArray().ToArray();
        if (items.Length != field.ItemCount)
        {
            AddError(errors, field.Name, $"Must contain exactly {field.ItemCount} item(s).");
            return;
        }

        for (var i = 0; i < items.Length; i++)
        {
            ProcessSingle(taskId, field, items[i], errors, values, itemIndex: i + 1);
        }
    }

    private static void ProcessSingle(
        int taskId,
        StatusFieldSpec field,
        JsonElement prop,
        Dictionary<string, List<string>> errors,
        List<TaskFieldValue> values,
        int itemIndex)
    {
        switch (field.Kind)
        {
            case StatusFieldKind.String:
                ProcessStringItem(taskId, field, prop, errors, values, itemIndex);
                break;

            case StatusFieldKind.Number:
                ProcessNumberItem(taskId, field, prop, errors, values, itemIndex);
                break;
        }
    }

    private static void ProcessStringItem(
        int taskId,
        StatusFieldSpec field,
        JsonElement prop,
        Dictionary<string, List<string>> errors,
        List<TaskFieldValue> values,
        int itemIndex)
    {
        if (prop.ValueKind != JsonValueKind.String)
        {
            AddError(errors, field.Name, ItemQualifier(field, itemIndex) + "Must be a string.");
            return;
        }

        var s = prop.GetString();
        if (string.IsNullOrWhiteSpace(s))
        {
            AddError(errors, field.Name, ItemQualifier(field, itemIndex) + "This field is required.");
            return;
        }

        var length = s.Length;
        if (field.Min.HasValue && length < field.Min.Value)
        {
            AddError(errors, field.Name, ItemQualifier(field, itemIndex) + $"Must be at least {field.Min.Value} character(s).");
            return;
        }
        if (field.Max.HasValue && length > field.Max.Value)
        {
            AddError(errors, field.Name, ItemQualifier(field, itemIndex) + $"Must be at most {field.Max.Value} character(s).");
            return;
        }

        values.Add(TaskFieldValue.ForString(taskId, field, s, itemIndex));
    }

    private static void ProcessNumberItem(
        int taskId,
        StatusFieldSpec field,
        JsonElement prop,
        Dictionary<string, List<string>> errors,
        List<TaskFieldValue> values,
        int itemIndex)
    {
        if (prop.ValueKind != JsonValueKind.Number)
        {
            AddError(errors, field.Name, ItemQualifier(field, itemIndex) + "Must be a number.");
            return;
        }

        var n = prop.GetDecimal();
        if (field.Min.HasValue && n < field.Min.Value)
        {
            AddError(errors, field.Name, ItemQualifier(field, itemIndex) + $"Must be at least {field.Min.Value}.");
            return;
        }
        if (field.Max.HasValue && n > field.Max.Value)
        {
            AddError(errors, field.Name, ItemQualifier(field, itemIndex) + $"Must be at most {field.Max.Value}.");
            return;
        }

        values.Add(TaskFieldValue.ForNumber(taskId, field, n, itemIndex));
    }

    private static string ItemQualifier(StatusFieldSpec field, int itemIndex)
        => field.ItemCount > 1 ? $"Item {itemIndex}: " : "";

    private static void AddError(Dictionary<string, List<string>> errors, string key, string message)
    {
        if (!errors.TryGetValue(key, out var list))
        {
            list = [];
            errors[key] = list;
        }
        list.Add(message);
    }
}

public readonly record struct ParseResult(
    ValidationResult Validation,
    IReadOnlyList<TaskFieldValue> Values);
