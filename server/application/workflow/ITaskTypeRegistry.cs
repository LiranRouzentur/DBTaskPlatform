using TaskPlatform.Domain.Workflow;

namespace TaskPlatform.Application.Workflow;

// Read-only access to TaskType metadata. Implementations MUST cache-load once at startup via
// EnsureLoadedAsync; Get/All throw if called before the cache is populated.
public interface ITaskTypeRegistry
{
    
    TaskType Get(int taskTypeId);

    bool TryGet(int taskTypeId, out TaskType? type);

    IReadOnlyCollection<TaskType> All { get; }

    ValueTask EnsureLoadedAsync(CancellationToken cancellationToken = default);
}
