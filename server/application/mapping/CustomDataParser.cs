using System.Text.Json;
using TaskPlatform.Domain.Entities;
using TaskPlatform.Domain.Workflow;

namespace TaskPlatform.Application.Mapping;

// Single point that validates per-status custom-field data. Adding a StatusFieldKind touches
// this file + CustomDataWriter + the StatusFieldKinds lookup row — and nowhere else.
// Error shape Dictionary<fieldName, string[]> is sent as ProblemDetails.Extensions["errors"].
public static class CustomDataParser
{
    // Entry point: validates the incoming JsonElement against the target StatusDefinition's
    // field specs and either returns the materialized TaskFieldValue list or a 422-shaped error map.
    public static ParseResult Parse(
        // Surrogate id of the task being mutated; written into each produced TaskFieldValue row.
        int taskId,
        // Target status whose Fields[] describe the expected payload shape.
        StatusDefinition status,
        // Caller-supplied custom-data payload; must be a JSON object (otherwise every field reports required).
        JsonElement data)
    {
        // Accumulator: per-field-name list of human-readable error messages. Empty → success.
        var errors = new Dictionary<string, List<string>>();
        // Successfully parsed TaskFieldValue rows in spec order — added to the task on success.
        var values = new List<TaskFieldValue>(status.Fields.Count);
        // True when data is a JSON object; false (object / array / null / scalar) means we still
        // walk every spec but each one short-circuits with "required".
        var dataIsObject = data.ValueKind == JsonValueKind.Object;

        foreach (var field in status.Fields)
        {
            ProcessField(taskId, field, dataIsObject ? data : default, dataIsObject, errors, values);
        }

        if (errors.Count == 0)
        {
            return new ParseResult(ValidationResult.Success(), values);
        }

        // Convert the mutable List<string> buckets to arrays for the immutable ValidationResult contract.
        var packed = errors.ToDictionary(kv => kv.Key, kv => kv.Value.ToArray());

        return new ParseResult(ValidationResult.Failure(packed), []);
    }

    // Per-field dispatcher: required-check, then array vs scalar based on the spec's ItemCount.
    private static void ProcessField(
        // Surrogate id of the task; passed through to produced TaskFieldValue rows.
        int taskId,
        // Schema row describing the expected field (name, kind, min/max, item count).
        StatusFieldSpec field,
        // The JSON object data we're reading from. Meaningful only when dataIsObject == true.
        JsonElement data,
        // False when the whole payload wasn't a JSON object — every field then reports required.
        bool dataIsObject,
        // Error accumulator passed down so individual handlers can append messages.
        Dictionary<string, List<string>> errors,
        // Value accumulator passed down so individual handlers can append successful rows.
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

    // Fixed-length array handler. ItemCount mismatch is a single error; per-item type + range
    // checks are delegated to ProcessSingle so the kind switch lives in exactly one place.
    private static void ProcessArray(
        // Surrogate id of the task; passed through to produced TaskFieldValue rows.
        int taskId,
        // Schema row describing the array field.
        StatusFieldSpec field,
        // JSON value at field.Name in the payload — expected to be an array.
        JsonElement prop,
        // Error accumulator.
        Dictionary<string, List<string>> errors,
        // Value accumulator.
        List<TaskFieldValue> values)
    {
        if (prop.ValueKind != JsonValueKind.Array)
        {
            AddError(errors, field.Name, $"Must be an array of exactly {field.ItemCount} item(s).");
            return;
        }

        // Materialized array of the JSON elements so we can both count + index them.
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

    // The single accepted StatusFieldKind dispatch in the workflow path — adding a kind means
    // a new case here + a matching arm in CustomDataWriter + a new StatusFieldKinds row.
    private static void ProcessSingle(
        // Surrogate id of the task; passed through to produced TaskFieldValue rows.
        int taskId,
        // Schema row describing the field whose value we're validating.
        StatusFieldSpec field,
        // JSON value of the scalar (or one element of the array) being validated.
        JsonElement prop,
        // Error accumulator.
        Dictionary<string, List<string>> errors,
        // Value accumulator.
        List<TaskFieldValue> values,
        // 1-based item position used for both error qualifiers ("Item 2: ...") and the row's ItemIndex.
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

    // String-kind handler: type check, non-empty (whitespace-trimmed), then min/max length bounds.
    private static void ProcessStringItem(
        // Surrogate id of the task; written into the produced TaskFieldValue.
        int taskId,
        // Schema row describing the field — Min/Max here are character-count bounds.
        StatusFieldSpec field,
        // JSON value being validated — must be JsonValueKind.String.
        JsonElement prop,
        // Error accumulator.
        Dictionary<string, List<string>> errors,
        // Value accumulator.
        List<TaskFieldValue> values,
        // 1-based item position for error qualifier text and the row's ItemIndex.
        int itemIndex)
    {
        if (prop.ValueKind != JsonValueKind.String)
        {
            AddError(errors, field.Name, ItemQualifier(field, itemIndex) + "Must be a string.");
            return;
        }

        // Raw string read from the JSON token — may be empty, which counts as required-failed below.
        var s = prop.GetString();
        if (string.IsNullOrWhiteSpace(s))
        {
            AddError(errors, field.Name, ItemQualifier(field, itemIndex) + "This field is required.");
            return;
        }

        // Character count used for both min and max bound checks below.
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

    // Number-kind handler: type check, then min/max numeric bounds. Uses decimal to preserve precision.
    private static void ProcessNumberItem(
        // Surrogate id of the task; written into the produced TaskFieldValue.
        int taskId,
        // Schema row describing the field — Min/Max here are numeric bounds.
        StatusFieldSpec field,
        // JSON value being validated — must be JsonValueKind.Number.
        JsonElement prop,
        // Error accumulator.
        Dictionary<string, List<string>> errors,
        // Value accumulator.
        List<TaskFieldValue> values,
        // 1-based item position for error qualifier text and the row's ItemIndex.
        int itemIndex)
    {
        if (prop.ValueKind != JsonValueKind.Number)
        {
            AddError(errors, field.Name, ItemQualifier(field, itemIndex) + "Must be a number.");
            return;
        }

        // Decimal interpretation of the JSON number — picked over double to keep currency-ish values exact.
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

    // Prepends "Item N: " to per-item error messages only when the field is a multi-item array,
    // so scalar errors stay terse ("Must be a string." not "Item 1: Must be a string.").
    private static string ItemQualifier(
        // Schema row — only ItemCount > 1 enables the qualifier.
        StatusFieldSpec field,
        // 1-based item index used in the produced qualifier text.
        int itemIndex)
        => field.ItemCount > 1 ? $"Item {itemIndex}: " : "";

    // Helper that lazily allocates the per-field error bucket so empty fields don't carry empty lists.
    private static void AddError(
        // Error accumulator the message is appended to.
        Dictionary<string, List<string>> errors,
        // Field name used as the key in the resulting ProblemDetails.Extensions["errors"] object.
        string key,
        // Human-readable validation message to add.
        string message)
    {
        if (!errors.TryGetValue(key, out var list))
        {
            list = [];
            errors[key] = list;
        }
        list.Add(message);
    }
}

// Bundles the validation outcome with the materialized TaskFieldValue rows. On failure Values
// is empty; on success Validation.IsValid is true and Values is in spec order ready for MoveTo.
public readonly record struct ParseResult(
    // Either Success() or Failure(errors) — drives the 200 vs 422 branch upstream.
    ValidationResult Validation,
    // Materialized field rows in spec order. Empty when Validation.IsValid is false.
    IReadOnlyList<TaskFieldValue> Values);
