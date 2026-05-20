namespace TaskPlatform.Domain.Workflow;

/// <summary>
/// Result of per-status custom-data validation. Errors keyed by field name; 422 ProblemDetails.Extensions["errors"].
/// </summary>
public sealed class ValidationResult
{
    private static readonly IReadOnlyDictionary<string, string[]> EmptyErrors =
        new Dictionary<string, string[]>();

    public bool IsValid { get; }
    public IReadOnlyDictionary<string, string[]> Errors { get; }

    private ValidationResult(bool isValid, IReadOnlyDictionary<string, string[]> errors)
    {
        IsValid = isValid;
        Errors = errors;
    }

    public static ValidationResult Success() => new(true, EmptyErrors);

    public static ValidationResult Failure(IReadOnlyDictionary<string, string[]> errors) =>
        new(false, errors);
}
