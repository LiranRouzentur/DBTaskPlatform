namespace TaskPlatform.Api.ExceptionHandlers;

// Single source of truth for RFC 7807 `type` URIs across all exception handlers + mapper.
internal static class ProblemTypes
{
    // Workflow / state-machine conflicts — used for 409s (closed-immutable, no-forward-skip, etc.).
    public const string Workflow = "https://example.com/errors/workflow";
    // Validation failures — used for 400 (bad request shape) and 422 (field-level invalid-data).
    public const string Validation = "https://example.com/errors/validation";
    // Resource lookup failures — used for 404 TaskNotFound.
    public const string NotFound = "https://example.com/errors/not-found";
    // Catch-all for unexpected exceptions reaching GlobalExceptionHandler — used for 500.
    public const string Internal = "https://example.com/errors/internal";
}
