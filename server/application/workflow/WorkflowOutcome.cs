using TaskPlatform.Domain.Errors;

namespace TaskPlatform.Application.Workflow;

// Result type: domain rule violations travel as values, not exceptions.
// WorkflowErrorMapper.Classify converts the Error payload into ProblemDetails — only unexpected
// throws ever reach the exception-handler chain.
public sealed class WorkflowOutcome<T>
    where T : class
{
    // True when the operation succeeded and Value is non-null.
    public bool IsSuccess { get; }
    // Inverse of IsSuccess; provided as a convenience for the read-side of call sites.
    public bool IsFailure => !IsSuccess;
    // Carrier of the successful payload; null when IsSuccess is false.
    public T? Value { get; }
    // Discriminated WorkflowError union describing the failure; null when IsSuccess is true.
    public WorkflowError? Error { get; }

    // Private ctor — instances are only ever produced through the Success/Failure factories so the
    // (isSuccess, value, error) invariants stay consistent across the codebase.
    private WorkflowOutcome(
        // Tag bit set by the factory chosen by the caller.
        bool isSuccess,
        // Payload for successful outcomes; null otherwise.
        T? value,
        // Error for failed outcomes; null otherwise.
        WorkflowError? error)
    {
        IsSuccess = isSuccess;
        Value = value;
        Error = error;
    }

    // Factory for the success branch — populates Value, leaves Error null.
    public static WorkflowOutcome<T> Success(
        // Non-null successful payload.
        T value) => new(true, value, null);

    // Factory for the failure branch — populates Error, leaves Value null.
    public static WorkflowOutcome<T> Failure(
        // Discriminated WorkflowError describing what went wrong.
        WorkflowError error) => new(false, null, error);
}
