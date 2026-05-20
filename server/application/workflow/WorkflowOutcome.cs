using TaskPlatform.Domain.Errors;

namespace TaskPlatform.Application.Workflow;

// Result type: domain rule violations travel as values, not exceptions.
public sealed class WorkflowOutcome<T>
    where T : class
{
    public bool IsSuccess { get; }
    public bool IsFailure => !IsSuccess;
    public T? Value { get; }
    public WorkflowError? Error { get; }

    private WorkflowOutcome(bool isSuccess, T? value, WorkflowError? error)
    {
        IsSuccess = isSuccess;
        Value = value;
        Error = error;
    }

    public static WorkflowOutcome<T> Success(T value) => new(true, value, null);

    public static WorkflowOutcome<T> Failure(WorkflowError error) => new(false, null, error);
}
