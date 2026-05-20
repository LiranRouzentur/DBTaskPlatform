namespace TaskPlatform.Domain.Workflow;

/// <summary>
/// Result of per-status custom-data validation. Errors keyed by field name; 422 ProblemDetails.Extensions["errors"].
/// </summary>
// Tiny value-object used by CustomDataParser to accumulate per-field validation outcomes. Two
// terminal states only: Success (no errors) or Failure (one or more field error arrays).
public sealed class ValidationResult
{
    // Shared, immutable empty-error dictionary returned by Success(). Avoids allocating a new
    // empty dictionary per successful validation call.
    private static readonly IReadOnlyDictionary<string, string[]> EmptyErrors =
        new Dictionary<string, string[]>();

    // True when no field-level errors were recorded.
    public bool IsValid { get; }
    // Field-name → array-of-messages map. Empty when IsValid is true. Surfaces in the 422
    // ProblemDetails Extensions["errors"] so the Angular dynamic form can project errors per field.
    public IReadOnlyDictionary<string, string[]> Errors { get; }

    // Private constructor — callers go through the Success/Failure factories so the two states
    // remain explicit and the IsValid/Errors invariant cannot be broken.
    private ValidationResult(
        // Whether validation passed.
        bool isValid,
        // Field error map; empty when isValid is true.
        IReadOnlyDictionary<string, string[]> errors)
    {
        IsValid = isValid;
        Errors = errors;
    }

    // Factory for the no-errors case. Reuses the shared EmptyErrors instance for zero-alloc.
    public static ValidationResult Success() => new(true, EmptyErrors);

    // Factory for the failure case. The provided errors dictionary is taken as-is — callers must
    // ensure it's been frozen / not subsequently mutated.
    public static ValidationResult Failure(
        // Field-name → array-of-messages map describing the failures.
        IReadOnlyDictionary<string, string[]> errors) =>
        new(false, errors);
}
