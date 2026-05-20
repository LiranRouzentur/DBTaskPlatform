using TaskPlatform.Domain.Workflow;

namespace TaskPlatform.Domain.Entities;

// Aggregate root. Mutation methods are `internal` — only WorkflowEngine drives changes so the
// generic workflow rules can't be bypassed. Soft-delete on FieldValues.IsDeleted is nullable:
// null = live, true = retired; `false` is not a valid state.
public sealed class TaskItem
{
    public int Id { get; private set; }
    public int TaskTypeId { get; private set; }

    public int CurrentStatusDefinitionId { get; private set; }

    public StatusDefinition CurrentStatusDefinition { get; private set; } = default!;

    public int Code => CurrentStatusDefinition?.Code ?? -1;

    public bool IsClosed { get; private set; }
    public int CurrentAssignedUserId { get; private set; }
    public byte[] RowVersion { get; private set; } = default!;
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }

    public bool? IsDeleted { get; private set; }

    private readonly List<TaskFieldValue> _fieldValues = [];
    public IReadOnlyList<TaskFieldValue> FieldValues => _fieldValues;

    private readonly List<TaskAssignment> _assignments = [];
    public IReadOnlyList<TaskAssignment> Assignments => _assignments;

    private TaskItem() { }

    public static TaskItem Create(TaskType type, int initialAssignedUserId, DateTime nowUtc)
    {
        var initialStatus = type.Statuses.OrderBy(s => s.Position).First();
        var task = new TaskItem
        {
            TaskTypeId = type.Id,
            CurrentStatusDefinitionId = initialStatus.Id,
            CurrentStatusDefinition = initialStatus,
            IsClosed = false,
            CurrentAssignedUserId = initialAssignedUserId,
            CreatedAtUtc = nowUtc,
            UpdatedAtUtc = nowUtc,
        };
        task._assignments.Add(
            TaskAssignment.Capture(taskId: 0, initialStatus.Id, initialAssignedUserId, nowUtc));
        return task;
    }

    // Backward moves are asymmetric: FieldValues above the new target are SOFT-deleted (so
    // forward re-entry can restore them); Assignments are HARD-deleted (natural-keyed, will be
    // recreated on forward re-entry — smaller table, observably equivalent).
    internal void MoveTo(
        TaskType type,
        StatusDefinition target,
        int nextAssignedUserId,
        IReadOnlyList<TaskFieldValue> newValues,
        DateTime nowUtc)
    {
        var oldStatus = type.Statuses.First(s => s.Id == CurrentStatusDefinitionId);
        var oldCode = oldStatus.Code;

        CurrentStatusDefinitionId = target.Id;
        CurrentStatusDefinition = target;
        CurrentAssignedUserId = nextAssignedUserId;
        UpdatedAtUtc = nowUtc;

        if (target.Code < oldCode)
        {
            var aboveTargetStatusIds = type.Statuses
                .Where(s => s.Code > target.Code)
                .Select(s => s.Id)
                .ToHashSet();
            var aboveTargetSpecIds = type.Statuses
                .Where(s => s.Code > target.Code)
                .SelectMany(s => s.Fields.Select(f => f.Id))
                .ToHashSet();

            foreach (var v in _fieldValues)
            {
                if (v.IsDeleted is null && aboveTargetSpecIds.Contains(v.StatusFieldSpecId))
                {
                    v.MarkDeleted();
                }
            }
            _assignments.RemoveAll(a => aboveTargetStatusIds.Contains(a.StatusDefinitionId));
        }

        UpsertFieldValues(newValues);
        UpsertAssignment(target, nextAssignedUserId, nowUtc);
    }

    internal void UpdateStep(
        StatusDefinition target,
        int assignedUserId,
        IReadOnlyList<TaskFieldValue> newValues,
        DateTime nowUtc)
    {
        UpdatedAtUtc = nowUtc;
        if (target.Id == CurrentStatusDefinitionId)
        {
            CurrentAssignedUserId = assignedUserId;
        }

        UpsertFieldValues(newValues);
        UpsertAssignment(target, assignedUserId, nowUtc);
    }

    // Upsert (not DELETE+INSERT): the filtered unique index would briefly see two live rows
    // during a DELETE+INSERT pair. Updating in place avoids that window.
    private void UpsertFieldValues(IReadOnlyList<TaskFieldValue> newValues)
    {

        var newKeys = new HashSet<(int specId, int idx)>(
            newValues.Select(v => (v.StatusFieldSpecId, v.ItemIndex)));
        var touchedSpecIds = new HashSet<int>(newValues.Select(v => v.StatusFieldSpecId));
        foreach (var existing in _fieldValues)
        {
            if (existing.IsDeleted is not null) continue;
            if (!touchedSpecIds.Contains(existing.StatusFieldSpecId)) continue;
            if (!newKeys.Contains((existing.StatusFieldSpecId, existing.ItemIndex)))
            {
                existing.MarkDeleted();
            }
        }

        foreach (var nv in newValues)
        {
            var existing = _fieldValues.FirstOrDefault(
                v => v.StatusFieldSpecId == nv.StatusFieldSpecId && v.ItemIndex == nv.ItemIndex);
            if (existing is null)
            {
                _fieldValues.Add(nv);
            }
            else
            {
                existing.SetValues(nv.StringValue, nv.NumberValue);
            }
        }
    }

    private void UpsertAssignment(StatusDefinition status, int userId, DateTime nowUtc)
    {
        var existing = _assignments.FirstOrDefault(a => a.StatusDefinitionId == status.Id);
        if (existing is null)
        {
            _assignments.Add(TaskAssignment.Capture(Id, status.Id, userId, nowUtc));
        }
        else
        {
            existing.Update(userId, nowUtc);
        }
    }

    internal void MarkClosed(DateTime nowUtc)
    {
        IsClosed = true;
        UpdatedAtUtc = nowUtc;
    }

    public static TaskItem SeedNew(
        int taskTypeId,
        StatusDefinition currentStatus,
        bool isClosed,
        int assignedUserId,
        DateTime createdAtUtc,
        DateTime updatedAtUtc) => new()
    {
        TaskTypeId = taskTypeId,
        CurrentStatusDefinitionId = currentStatus.Id,
        CurrentStatusDefinition = currentStatus,
        IsClosed = isClosed,
        CurrentAssignedUserId = assignedUserId,
        CreatedAtUtc = createdAtUtc,
        UpdatedAtUtc = updatedAtUtc,
    };

    internal void SeedAddFieldValue(TaskFieldValue value) => _fieldValues.Add(value);

    internal void SeedAddAssignment(TaskAssignment assignment) => _assignments.Add(assignment);
}
