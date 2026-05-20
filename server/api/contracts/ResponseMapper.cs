using TaskPlatform.Application.Mapping;
using TaskPlatform.Application.Workflow;
using TaskPlatform.Domain.Entities;
using TaskPlatform.Domain.Workflow;

namespace TaskPlatform.Api.Contracts;

// Sole mapping layer between domain entities and API DTOs. ToDetail computes RetiredStatuses
// from soft-deleted field-value rows so the UI can flag statuses needing re-entry.
internal static class ResponseMapper
{

    // Maps a TaskItem entity to the slim TaskListItem used by GET /api/tasks. No registry
    // lookup required — only fields already on the entity.
    public static TaskListItem ToListItem(
        // Tracked task entity returned by the service layer.
        this TaskItem task) => new(
        Id: task.Id,
        TaskTypeId: task.TaskTypeId,
        Status: task.Code,
        IsClosed: task.IsClosed,
        AssignedUserId: task.CurrentAssignedUserId,
        UpdatedAtUtc: task.UpdatedAtUtc);

    // Maps a TaskItem to the full TaskDetail used by GET /api/tasks/{id}. Walks the task type's
    // status + field metadata from the registry to convert raw FieldValue rows into typed
    // dictionaries keyed by status code.
    public static TaskDetail ToDetail(
        // Tracked task entity with FieldValues and Assignments populated (Include'd by TaskService).
        this TaskItem task,
        // Singleton metadata cache used to resolve TaskTypeId → status/field schema.
        ITaskTypeRegistry registry)
    {
        // Cached TaskType definition for this task — provides ordered statuses + field specs.
        var type = registry.Get(task.TaskTypeId);

        // Reverse lookup: StatusFieldSpec.Id → owning status's user-facing Code (status integer).
        var specIdToCode = new Dictionary<int, int>();
        // Reverse lookup: StatusFieldSpec.Id → the spec itself, so CustomDataWriter can read Kind/ItemCount.
        var specsById = new Dictionary<int, StatusFieldSpec>();
        foreach (var status in type.Statuses)
        {
            foreach (var spec in status.Fields)
            {
                specIdToCode[spec.Id] = status.Code;
                specsById[spec.Id] = spec;
            }
        }

        // Reverse lookup: StatusDefinition.Id (surrogate) → user-facing status Code (integer).
        var statusIdToCode = type.Statuses.ToDictionary(s => s.Id, s => s.Code);
        // The task's current status as the public Code value, derived from its FK to StatusDefinition.
        var currentCode = statusIdToCode[task.CurrentStatusDefinitionId];

        // Filters out soft-deleted FieldValue rows (IsDeleted != null marks retired data).
        var liveValues = task.FieldValues
            .Where(v => v.IsDeleted == null)
            .ToList();

        // Grouped/typed view: status code → { fieldName → value }. CustomDataWriter applies
        // per-Kind conversion (String/Number) using the spec dictionary.
        var byStatus = liveValues
            .GroupBy(v => specIdToCode[v.StatusFieldSpecId])
            .ToDictionary(
                g => g.Key,
                g => (IReadOnlyDictionary<string, object?>)CustomDataWriter.Write(g.ToList(), specsById));

        // Per-status assignee snapshots taken at the moment that status was completed.
        var assigneeByStatus = task.Assignments
            .ToDictionary(a => statusIdToCode[a.StatusDefinitionId], a => a.AssignedUserId);

        // Status codes that currently have live data — used to exclude them from RetiredStatuses.
        var liveStatuses = byStatus.Keys.ToHashSet();
        // Status codes whose data has been soft-deleted but never re-entered — the UI surfaces
        // these as "needs re-entry" badges after a backward status move.
        var retiredStatuses = task.FieldValues
            .Where(v => v.IsDeleted == true)
            .Select(v => specIdToCode[v.StatusFieldSpecId])
            .Where(c => !liveStatuses.Contains(c))
            .Distinct()
            .OrderBy(c => c)
            .ToList();

        return new TaskDetail(
            Id: task.Id,
            TaskTypeId: task.TaskTypeId,
            Status: currentCode,
            IsClosed: task.IsClosed,
            AssignedUserId: task.CurrentAssignedUserId,
            CustomDataByStatus: byStatus,
            AssigneeByStatus: assigneeByStatus,
            RetiredStatuses: retiredStatuses,
            UpdatedAtUtc: task.UpdatedAtUtc);
    }

    // Maps a User entity to its slim API projection.
    public static UserResponse ToResponse(
        // Tracked User entity from the seeded demo set.
        this User user) => new(user.Id, user.FullName);

    // Maps a registry TaskType (with eager-loaded Statuses + Fields) to the wire DTO consumed
    // by the Angular dynamic-form builder. Statuses + fields are emitted in Position order so
    // the form renders consistently across page loads.
    public static TaskTypeMetadataResponse ToResponse(
        // Cached TaskType from ITaskTypeRegistry — already includes ordered Statuses/Fields.
        this TaskType type) => new(
        Id: type.Id,
        Name: type.Name,
        FinalStatus: type.FinalStatusCode,
        Statuses: type.Statuses
            .OrderBy(s => s.Position)
            .Select(s => new StatusMetadataResponse(
                Status: s.Code,
                Name: s.Name,
                Fields: s.Fields
                    .OrderBy(f => f.Position)
                    .Select(f => new FieldSpecMetadataResponse(
                        Name: f.Name,
                        Kind: f.Kind.ToString(),
                        ItemCount: f.ItemCount,
                        Min: f.Min,
                        Max: f.Max))
                    .ToList()))
            .ToList());
}
