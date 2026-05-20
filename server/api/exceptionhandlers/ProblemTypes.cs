namespace TaskPlatform.Api.ExceptionHandlers;

// Single source of truth for RFC 7807 `type` URIs across all exception handlers + mapper.
internal static class ProblemTypes
{
    public const string Workflow = "https://example.com/errors/workflow";
    public const string Validation = "https://example.com/errors/validation";
    public const string NotFound = "https://example.com/errors/not-found";
    public const string Internal = "https://example.com/errors/internal";
}
