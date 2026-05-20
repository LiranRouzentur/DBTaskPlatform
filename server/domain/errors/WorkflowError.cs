namespace TaskPlatform.Domain.Errors;

// Discriminated union of domain rule violations. Carried by WorkflowOutcome<T> instead of
// throwing. New arms MUST also be added to WorkflowErrorMapper.Classify (fallback throws) and
// to the client's WorkflowRule union for toast-title gating.
public abstract record WorkflowError
{
    public abstract string Rule { get; }
    public abstract string Message { get; }

    public sealed record ClosedImmutable : WorkflowError
    {
        public override string Rule => "closed-immutable";
        public override string Message => "Closed tasks are immutable.";
    }

    public sealed record AlreadyClosed : WorkflowError
    {
        public override string Rule => "already-closed";
        public override string Message => "Task is already closed.";
    }

    public sealed record NoMovement(int Status) : WorkflowError
    {
        public override string Rule => "no-movement";
        public override string Message => $"Target status {Status} equals current status.";
    }

    public sealed record InvalidStatus(int Attempted) : WorkflowError
    {
        public override string Rule => "invalid-status";
        public override string Message => $"Status must be a positive integer (attempted {Attempted}).";
    }

    public sealed record NoForwardSkip(int Current, int Attempted) : WorkflowError
    {
        public override string Rule => "no-forward-skip";
        public override string Message =>
            $"Forward moves must be sequential (current {Current}, attempted {Attempted}).";
    }

    public sealed record BeyondFinal(int Attempted, int Final) : WorkflowError
    {
        public override string Rule => "beyond-final";
        public override string Message => $"Status {Attempted} is beyond the final status ({Final}).";
    }

    public sealed record NotAtFinal(int Current, int Final) : WorkflowError
    {
        public override string Rule => "not-at-final";
        public override string Message =>
            $"Task can only be closed at final status {Final} (current {Current}).";
    }

    public sealed record InvalidNextUser : WorkflowError
    {
        public override string Rule => "invalid-next-user";
        public override string Message => "Next assigned user is missing.";
    }

    public sealed record InvalidData(IReadOnlyDictionary<string, string[]> Errors) : WorkflowError
    {
        public override string Rule => "invalid-data";
        public override string Message => "Status-specific data validation failed.";
    }

    public sealed record TaskNotFound(int Id) : WorkflowError
    {
        public override string Rule => "task-not-found";
        public override string Message => $"Task {Id} was not found.";
    }

    public sealed record UnknownTaskType(int Id) : WorkflowError
    {
        public override string Rule => "unknown-task-type";
        public override string Message => $"Unknown task type {Id}.";
    }

    public sealed record UnknownUser(int UserId) : WorkflowError
    {
        public override string Rule => "unknown-user";
        public override string Message => $"Unknown user {UserId}.";
    }
}
