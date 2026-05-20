using TaskPlatform.Domain.Workflow;

namespace TaskPlatform.Application.Workflow;

// Read-only access to TaskType metadata. Implementations MUST cache-load once at startup via
// EnsureLoadedAsync; Get/All throw if called before the cache is populated.
public interface ITaskTypeRegistry
{
    // Returns the cached TaskType by id or throws if no such id is registered. Used in the
    // workflow engine where missing-type would indicate a bug, not user input.
    TaskType Get(
        // Surrogate id of the TaskType to fetch.
        int taskTypeId);

    // Non-throwing variant used by TaskService.CreateAsync so unknown ids become a 404
    // WorkflowError rather than a 500 from the registry.
    bool TryGet(
        // Surrogate id of the TaskType to look up.
        int taskTypeId,
        // When the method returns true, the cached TaskType; otherwise null.
        out TaskType? type);

    // Materialized collection of every registered TaskType — used by the /task-types endpoint
    // and by TaskService.GetTaskTypes() to skip a DB round-trip.
    IReadOnlyCollection<TaskType> All { get; }

    // Idempotent cache primer invoked once at application startup (and a guard in tests).
    // Implementations may skip the DB read if the cache is already populated.
    ValueTask EnsureLoadedAsync(
        // Aborts the prime if the host is shutting down mid-startup.
        CancellationToken cancellationToken = default);
}
