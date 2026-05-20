using Microsoft.EntityFrameworkCore;
using TaskPlatform.Application.Workflow;
using TaskPlatform.Domain.Workflow;
using TaskPlatform.Data.Persistence;

namespace TaskPlatform.Data.Workflow;

// Singleton, in-memory cache of every TaskType + statuses + field specs. Loaded once at startup
// via EnsureLoadedAsync and NEVER refreshed — adding a task type requires an app restart.
// IDbContextFactory dependency lets this singleton load EF data without sharing a scoped context.

// In-memory registry of TaskType definitions plus their nested StatusDefinitions and StatusFieldSpecs.
// Registered as a singleton: every request reads from the same immutable dictionary, sidestepping
// per-request DB hits on the workflow hot path. Because singletons cannot depend on the scoped
// AppDbContext directly, this class injects IDbContextFactory and constructs a short-lived context
// on demand inside EnsureLoadedAsync.
public sealed class TaskTypeRegistry(
    // EF factory used to materialize a fresh AppDbContext inside the one-time load.
    // The factory-then-scoped split (factory = singleton, AppDbContext = scoped) lets this singleton
    // share EF configuration without pinning a request scope.
    IDbContextFactory<AppDbContext> contextFactory) : ITaskTypeRegistry
{
    // Guards the lazy-load critical section. Without it, two concurrent EnsureLoadedAsync calls
    // on a cold start could both run the EF query — wasteful and racy when assigning _cache.
    private readonly SemaphoreSlim _gate = new(1, 1);
    // Backing cache. Null until EnsureLoadedAsync completes; thereafter immutable for the process
    // lifetime. Reads are lock-free — safe because publishing a fully-initialised dictionary
    // reference is atomic on .NET, and the dictionary itself is never mutated post-load.
    private Dictionary<int, TaskType>? _cache;

    // Resolves a TaskType by id from the in-memory cache. Throws if the registry hasn't been
    // preloaded or if no matching type exists — both are programmer errors, not workflow errors.
    public TaskType Get(
        // Surrogate key of the task type to fetch.
        int taskTypeId)
    {
        // Snapshot the field once so a concurrent load can't race with the null-check below.
        var cache = _cache
            ?? throw new InvalidOperationException(
                "TaskTypeRegistry was not preloaded. Call EnsureLoadedAsync() before resolving task types.");

        if (!cache.TryGetValue(taskTypeId, out var def))
        {
            throw new InvalidOperationException(
                $"No task type registered with id '{taskTypeId}'.");
        }
        return def;
    }

    // Non-throwing variant of Get used by callers (e.g. response mappers) that prefer to skip
    // unknown ids gracefully rather than crash the request.
    public bool TryGet(
        // Surrogate key of the task type to fetch.
        int taskTypeId,
        // Resolved TaskType when found, otherwise null. Declared as nullable on the out so
        // consumers can pattern-match without extra casts.
        out TaskType? type)
    {
        type = null;
        // Local snapshot so a concurrent load doesn't flip _cache between the null-check and the lookup.
        var cache = _cache;
        if (cache is null) return false;
        return cache.TryGetValue(taskTypeId, out type);
    }

    // Enumerates every cached TaskType. Used by the metadata endpoint that exposes the registry
    // to the Angular client so dynamic forms can be built without a per-type lookup.
    public IReadOnlyCollection<TaskType> All =>
        _cache?.Values
        ?? throw new InvalidOperationException(
            "TaskTypeRegistry was not preloaded. Call EnsureLoadedAsync() before reading All.");

    // One-time, idempotent loader called from Program.cs during startup. Double-checked locking
    // pattern: cheap is-null check first, then take the semaphore and re-check inside.
    public async ValueTask EnsureLoadedAsync(
        // Cooperative cancellation forwarded into the semaphore wait and the EF query so shutdown
        // doesn't block on a stalled DB.
        CancellationToken cancellationToken = default)
    {
        if (_cache is not null)
        {
            return;
        }

        await _gate.WaitAsync(cancellationToken);
        try
        {
            if (_cache is not null)
            {
                return;
            }

            // Short-lived DbContext created from the factory. await using ensures disposal even if
            // the query throws; the singleton itself owns no DbContext outside this method.
            await using var db = await contextFactory.CreateDbContextAsync(cancellationToken);

            // AsSplitQuery is REQUIRED: nested Include + AsNoTracking otherwise materialises
            // duplicate Fields rows, cascading into duplicate validation messages downstream.

            // Eagerly loaded TaskType graph: types → ordered statuses → ordered fields.
            // AsNoTracking because the registry never writes; TagWith makes slow queries
            // attributable in dm_exec_query_stats; AsSplitQuery prevents Cartesian-explosion
            // duplicates from the nested collection includes.
            var types = await db.TaskTypes
                .TagWith("TaskTypeRegistry.EnsureLoadedAsync")
                .AsNoTracking()
                .AsSplitQuery()
                .Include(t => t.Statuses.OrderBy(s => s.Position))
                    .ThenInclude(s => s.Fields.OrderBy(f => f.Position))
                .OrderBy(t => t.Id)
                .ToListAsync(cancellationToken);

            _cache = types.ToDictionary(d => d.Id);
        }
        finally
        {
            _gate.Release();
        }
    }
}
