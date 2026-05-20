using Microsoft.EntityFrameworkCore;
using TaskPlatform.Application.Workflow;
using TaskPlatform.Domain.Workflow;
using TaskPlatform.Data.Persistence;

namespace TaskPlatform.Data.Workflow;

// Singleton, in-memory cache of every TaskType + statuses + field specs. Loaded once at startup
// via EnsureLoadedAsync and NEVER refreshed — adding a task type requires an app restart.
// IDbContextFactory dependency lets this singleton load EF data without sharing a scoped context.
public sealed class TaskTypeRegistry(IDbContextFactory<AppDbContext> contextFactory) : ITaskTypeRegistry
{
    private readonly SemaphoreSlim _gate = new(1, 1);
    private Dictionary<int, TaskType>? _cache;

    public TaskType Get(int taskTypeId)
    {
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

    public bool TryGet(int taskTypeId, out TaskType? type)
    {
        type = null;
        var cache = _cache;
        if (cache is null) return false;
        return cache.TryGetValue(taskTypeId, out type);
    }

    public IReadOnlyCollection<TaskType> All =>
        _cache?.Values
        ?? throw new InvalidOperationException(
            "TaskTypeRegistry was not preloaded. Call EnsureLoadedAsync() before reading All.");

    public async ValueTask EnsureLoadedAsync(CancellationToken cancellationToken = default)
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

            await using var db = await contextFactory.CreateDbContextAsync(cancellationToken);

            // AsSplitQuery is REQUIRED: nested Include + AsNoTracking otherwise materialises
            // duplicate Fields rows, cascading into duplicate validation messages downstream.
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
