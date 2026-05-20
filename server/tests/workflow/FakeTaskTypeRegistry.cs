using TaskPlatform.Application.Workflow;
using TaskPlatform.Domain.Workflow;

namespace TaskPlatform.Tests.Workflow;

internal sealed class FakeTaskTypeRegistry : ITaskTypeRegistry
{
    private readonly Dictionary<int, TaskType> _byId;

    public FakeTaskTypeRegistry(params TaskType[] types)
    {
        _byId = types.ToDictionary(t => t.Id);
    }

    public TaskType Get(int taskTypeId) =>
        _byId.TryGetValue(taskTypeId, out var t)
            ? t
            : throw new InvalidOperationException($"No fixture registered for id {taskTypeId}.");

    public bool TryGet(int taskTypeId, out TaskType? type)
    {
        var found = _byId.TryGetValue(taskTypeId, out var t);
        type = t;
        return found;
    }

    public IReadOnlyCollection<TaskType> All => _byId.Values;

    public ValueTask EnsureLoadedAsync(CancellationToken cancellationToken = default) =>
        ValueTask.CompletedTask;
}
