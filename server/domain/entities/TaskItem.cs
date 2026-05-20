using TaskPlatform.Domain.Workflow;

namespace TaskPlatform.Domain.Entities;

// Aggregate root. Mutation methods are `internal` — only WorkflowEngine drives changes so the
// generic workflow rules can't be bypassed. Soft-delete on FieldValues.IsDeleted is nullable:
// null = live, true = retired; `false` is not a valid state.
public sealed class TaskItem
{
    // Surrogate primary key assigned by the database on INSERT. Private setter so the id can be
    // hydrated by EF but never mutated by application code post-creation.
    public int Id { get; private set; }
    // FK to TaskType — identifies which workflow shape this task follows. Immutable after creation;
    // changing a task's type would invalidate every captured field value.
    public int TaskTypeId { get; private set; }

    // FK to StatusDefinition — the task's currently-occupied status row. Updated by MoveTo only.
    public int CurrentStatusDefinitionId { get; private set; }

    // Navigation to the actual StatusDefinition row. Required for `Code` derivation and for the
    // workflow engine's symmetric rule evaluation (it never special-cases by task-type id).
    public StatusDefinition CurrentStatusDefinition { get; private set; } = default!;

    // Convenience accessor — the workflow code of the current status, or -1 when not yet hydrated.
    // -1 is a defensive default so a missing nav doesn't accidentally pass numeric comparisons.
    public int Code => CurrentStatusDefinition?.Code ?? -1;

    // True once the task has been closed at its final status. Closed tasks are immutable — every
    // write helper checks this and refuses to proceed (domain-level invariant).
    public bool IsClosed { get; private set; }
    // FK to the currently-responsible user. Mirrored in the latest TaskAssignment row for history.
    public int CurrentAssignedUserId { get; private set; }
    // SQL Server `rowversion` token — drives optimistic concurrency via EF's ConcurrencyCheck.
    public byte[] RowVersion { get; private set; } = default!;
    // UTC timestamp when the task was created. Never mutated after creation.
    public DateTime CreatedAtUtc { get; private set; }
    // UTC timestamp of the most recent mutation. Refreshed by every internal write helper.
    public DateTime UpdatedAtUtc { get; private set; }

    // Soft-delete flag — nullable on purpose. The partial unique index treats `null` as the live
    // row, allowing only one active record per logical key while keeping retired history queryable.
    public bool? IsDeleted { get; private set; }

    // Backing list for FieldValues. Mutation is gated through TaskItem methods so external callers
    // can't bypass the soft-delete bookkeeping the partial unique index relies on.
    private readonly List<TaskFieldValue> _fieldValues = [];
    // Read-only projection of captured custom-data values across every visited status.
    public IReadOnlyList<TaskFieldValue> FieldValues => _fieldValues;

    // Backing list for Assignments. Recorded once per (task, status) pair; backward moves prune
    // rows above the new target so re-entry on the forward path starts fresh.
    private readonly List<TaskAssignment> _assignments = [];
    // Read-only projection of historical per-status assignments.
    public IReadOnlyList<TaskAssignment> Assignments => _assignments;

    // Private parameterless constructor — exists solely for EF Core materialization. Application
    // code MUST go through Create() / SeedNew() so all invariants are established.
    private TaskItem() { }

    // Factory used by TaskService when a brand-new task is requested over the HTTP API. Places the
    // task at its first status (lowest Position) and records the initial assignment in history.
    public static TaskItem Create(
        // Workflow definition the new task will follow — supplies the ordered list of statuses.
        TaskType type,
        // User id that should own the task at its initial status.
        int initialAssignedUserId,
        // Clock value injected by the caller (typically TimeProvider.GetUtcNow()) — keeps the
        // domain testable by avoiding direct DateTime.UtcNow access.
        DateTime nowUtc)
    {
        // The first status in the workflow (lowest Position). This is where every new task begins.
        var initialStatus = type.Statuses.OrderBy(s => s.Position).First();
        // The freshly-constructed entity with all required fields populated.
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
        // Workflow definition — needed to locate the old status and to enumerate statuses above
        // the target for soft-delete bookkeeping.
        TaskType type,
        // The status this task is transitioning into. Already validated by the workflow engine.
        StatusDefinition target,
        // User id to own the task at the new status. Recorded in TaskAssignment history.
        int nextAssignedUserId,
        // New custom-data values captured for the target status. Upserted onto _fieldValues.
        IReadOnlyList<TaskFieldValue> newValues,
        // Clock for stamping UpdatedAtUtc and the new assignment row.
        DateTime nowUtc)
    {
        // Current StatusDefinition before the move — used to detect direction (forward/backward).
        var oldStatus = type.Statuses.First(s => s.Id == CurrentStatusDefinitionId);
        // Workflow code of the prior status; comparing target.Code to oldCode tells us direction.
        var oldCode = oldStatus.Code;

        CurrentStatusDefinitionId = target.Id;
        CurrentStatusDefinition = target;
        CurrentAssignedUserId = nextAssignedUserId;
        UpdatedAtUtc = nowUtc;

        if (target.Code < oldCode)
        {
            // Set of StatusDefinition ids strictly above the new target. Used to hard-delete
            // assignment rows that belong to statuses we're retreating from.
            var aboveTargetStatusIds = type.Statuses
                .Where(s => s.Code > target.Code)
                .Select(s => s.Id)
                .ToHashSet();
            // Set of StatusFieldSpec ids for every spec attached to a status above the target.
            // Used to soft-delete the matching captured FieldValues.
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

    // Updates captured data for a status without moving the task. Used by the /steps endpoint to
    // correct values entered earlier without forcing a backward/forward round-trip.
    internal void UpdateStep(
        // Status whose captured data is being rewritten — may be a prior status or the current one.
        StatusDefinition target,
        // User id to associate with this step's assignment row.
        int assignedUserId,
        // Replacement custom-data values for the step.
        IReadOnlyList<TaskFieldValue> newValues,
        // Clock for stamping UpdatedAtUtc and any new assignment row.
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
    private void UpsertFieldValues(
        // The new set of values for whatever specs the caller is touching. Anything missing from
        // this set (but in scope) is soft-deleted; anything present is created or updated.
        IReadOnlyList<TaskFieldValue> newValues)
    {

        // The (specId, itemIndex) tuples present in the incoming payload. Used to detect which
        // existing rows should be retired because they no longer appear.
        var newKeys = new HashSet<(int specId, int idx)>(
            newValues.Select(v => (v.StatusFieldSpecId, v.ItemIndex)));
        // The distinct StatusFieldSpec ids touched by this upsert — we only consider retiring
        // existing values that belong to specs the caller is rewriting.
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
            // Existing row matching this (spec, index) tuple, if any. When found we update in
            // place; when absent we append a new row.
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

    // Upsert one assignment row per (task, status) pair. If the row already exists, refresh its
    // user and timestamp; otherwise append a new row.
    private void UpsertAssignment(
        // The status the assignment belongs to.
        StatusDefinition status,
        // Currently-responsible user id for that status.
        int userId,
        // Clock for stamping AssignedAtUtc.
        DateTime nowUtc)
    {
        // Existing assignment row for this status, if any. Natural-keyed by (TaskId, StatusDefinitionId).
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

    // Final transition — closes the task at its final status. Subsequent writes are rejected
    // by the closed-immutable rule enforced in the engine.
    internal void MarkClosed(
        // Clock for stamping UpdatedAtUtc.
        DateTime nowUtc)
    {
        IsClosed = true;
        UpdatedAtUtc = nowUtc;
    }

    // Seed-only factory bypassing the Create() invariants. Used exclusively by DatabaseSeeder to
    // hydrate demo tasks at arbitrary statuses (including pre-closed ones).
    public static TaskItem SeedNew(
        // FK to the TaskType being seeded.
        int taskTypeId,
        // The StatusDefinition the seeded task should occupy.
        StatusDefinition currentStatus,
        // Whether the seeded task should already be closed (final-status demo tasks).
        bool isClosed,
        // Initial user id to own the seeded task.
        int assignedUserId,
        // CreatedAt timestamp to preserve for the seeded row.
        DateTime createdAtUtc,
        // UpdatedAt timestamp to preserve for the seeded row.
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

    // Seed-only helper letting DatabaseSeeder append a pre-built FieldValue without invoking the
    // upsert bookkeeping (seed data is already in a consistent shape).
    internal void SeedAddFieldValue(
        // Pre-built FieldValue to append directly to the backing list.
        TaskFieldValue value) => _fieldValues.Add(value);

    // Seed-only helper letting DatabaseSeeder append a pre-built Assignment row directly.
    internal void SeedAddAssignment(
        // Pre-built Assignment row to append directly to the backing list.
        TaskAssignment assignment) => _assignments.Add(assignment);
}
