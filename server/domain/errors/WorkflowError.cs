namespace TaskPlatform.Domain.Errors;

// Discriminated union of domain rule violations. Carried by WorkflowOutcome<T> instead of
// throwing. New arms MUST also be added to WorkflowErrorMapper.Classify (fallback throws) and
// to the client's WorkflowRule union for toast-title gating.
public abstract record WorkflowError
{
    // Kebab-case rule identifier — the contract surface mirrored by the Angular WorkflowRule
    // union. Surfaced to clients via ProblemDetails.Extensions["rule"].
    public abstract string Rule { get; }
    // Human-readable message included in the ProblemDetails response. Localization is out of scope.
    public abstract string Message { get; }

    // Attempt to write a task that has already been closed. Closed-immutable is enforced in the
    // domain so the UI gate is just defense-in-depth.
    public sealed record ClosedImmutable : WorkflowError
    {
        // Kebab-case rule key surfaced to the client.
        public override string Rule => "closed-immutable";
        // Human message included in the ProblemDetails body.
        public override string Message => "Closed tasks are immutable.";
    }

    // Caller tried to close a task that is already closed. Distinct from ClosedImmutable because
    // the operation (close) is different from a generic write attempt.
    public sealed record AlreadyClosed : WorkflowError
    {
        // Kebab-case rule key.
        public override string Rule => "already-closed";
        // Human message.
        public override string Message => "Task is already closed.";
    }

    // ChangeStatus called with a target status equal to the current one — disallowed because
    // every move must transition. The /steps endpoint is the right surface for in-place edits.
    public sealed record NoMovement(
        // The attempted (and current) status code that triggered the rule.
        int Status) : WorkflowError
    {
        // Kebab-case rule key.
        public override string Rule => "no-movement";
        // Human message — embeds the redundant status code for diagnosis.
        public override string Message => $"Target status {Status} equals current status.";
    }

    // Status code outside the valid (positive) range. Defensive guard against malformed payloads.
    public sealed record InvalidStatus(
        // The non-positive integer received from the caller.
        int Attempted) : WorkflowError
    {
        // Kebab-case rule key.
        public override string Rule => "invalid-status";
        // Human message — embeds the offending number to aid debugging.
        public override string Message => $"Status must be a positive integer (attempted {Attempted}).";
    }

    // Forward moves must be sequential (current + 1). Skipping a status is rejected so workflow
    // history stays dense and field-value capture cannot be bypassed.
    public sealed record NoForwardSkip(
        // The task's status code at the time the move was attempted.
        int Current,
        // The status code the caller tried to jump to.
        int Attempted) : WorkflowError
    {
        // Kebab-case rule key.
        public override string Rule => "no-forward-skip";
        // Human message embedding both current and attempted codes.
        public override string Message =>
            $"Forward moves must be sequential (current {Current}, attempted {Attempted}).";
    }

    // Attempted to move to a status code greater than the workflow's final code. Distinct from
    // skip because the target is outside the workflow's defined range entirely.
    public sealed record BeyondFinal(
        // The status code the caller tried to move to.
        int Attempted,
        // The actual final status code for the task's type.
        int Final) : WorkflowError
    {
        // Kebab-case rule key.
        public override string Rule => "beyond-final";
        // Human message embedding both codes.
        public override string Message => $"Status {Attempted} is beyond the final status ({Final}).";
    }

    // Close was requested but the task hasn't reached its final status yet. Closing is only valid
    // at the workflow's terminal step.
    public sealed record NotAtFinal(
        // The task's current status code.
        int Current,
        // The final status code at which closing would be valid.
        int Final) : WorkflowError
    {
        // Kebab-case rule key.
        public override string Rule => "not-at-final";
        // Human message embedding both codes so the client toast can be self-explanatory.
        public override string Message =>
            $"Task can only be closed at final status {Final} (current {Current}).";
    }

    // The next-assigned-user id is missing or zero for an operation that requires one. Surfaced
    // on ChangeStatus when the caller hasn't supplied a downstream owner.
    public sealed record InvalidNextUser : WorkflowError
    {
        // Kebab-case rule key.
        public override string Rule => "invalid-next-user";
        // Human message.
        public override string Message => "Next assigned user is missing.";
    }

    // Per-status custom-data validation failed. Errors are keyed by field name so the Angular
    // dynamic-form layer can project them onto matching FormControls.
    public sealed record InvalidData(
        // Field-name → array-of-messages map produced by CustomDataParser. Surfaces in the 422
        // ProblemDetails Extensions["errors"].
        IReadOnlyDictionary<string, string[]> Errors) : WorkflowError
    {
        // Kebab-case rule key.
        public override string Rule => "invalid-data";
        // Generic message — the per-field detail lives in Errors.
        public override string Message => "Status-specific data validation failed.";
    }

    // Task id does not exist. Surfaces as 404 ProblemDetails via WorkflowErrorMapper.Classify.
    public sealed record TaskNotFound(
        // The task id that was not found.
        int Id) : WorkflowError
    {
        // Kebab-case rule key.
        public override string Rule => "task-not-found";
        // Human message embedding the missing id.
        public override string Message => $"Task {Id} was not found.";
    }

    // Caller specified a task-type id that doesn't exist in the registry. Surfaces on Create
    // when the payload references a deleted or never-defined task type.
    public sealed record UnknownTaskType(
        // The task-type id that was not found.
        int Id) : WorkflowError
    {
        // Kebab-case rule key.
        public override string Rule => "unknown-task-type";
        // Human message embedding the unknown id.
        public override string Message => $"Unknown task type {Id}.";
    }

    // Caller referenced a user id that doesn't exist. Surfaces on Create / ChangeStatus when an
    // assignment target can't be resolved.
    public sealed record UnknownUser(
        // The user id that was not found.
        int UserId) : WorkflowError
    {
        // Kebab-case rule key.
        public override string Rule => "unknown-user";
        // Human message embedding the unknown id.
        public override string Message => $"Unknown user {UserId}.";
    }
}
