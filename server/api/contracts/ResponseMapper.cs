using TaskPlatform.Application.Mapping;
using TaskPlatform.Application.Workflow;
using TaskPlatform.Domain.Entities;
using TaskPlatform.Domain.Workflow;

namespace TaskPlatform.Api.Contracts;

// Sole mapping layer between domain entities and API DTOs. ToDetail computes RetiredStatuses
// from soft-deleted field-value rows so the UI can flag statuses needing re-entry.
internal static class ResponseMapper
{
    
    public static TaskListItem ToListItem(this TaskItem task) => new(
        Id: task.Id,
        TaskTypeId: task.TaskTypeId,
        Status: task.Code,
        IsClosed: task.IsClosed,
        AssignedUserId: task.CurrentAssignedUserId,
        UpdatedAtUtc: task.UpdatedAtUtc);

    public static TaskDetail ToDetail(this TaskItem task, ITaskTypeRegistry registry)
    {
        var type = registry.Get(task.TaskTypeId);
        
        var specIdToCode = new Dictionary<int, int>();
        var specsById = new Dictionary<int, StatusFieldSpec>();
        foreach (var status in type.Statuses)
        {
            foreach (var spec in status.Fields)
            {
                specIdToCode[spec.Id] = status.Code;
                specsById[spec.Id] = spec;
            }
        }
        
        var statusIdToCode = type.Statuses.ToDictionary(s => s.Id, s => s.Code);
        var currentCode = statusIdToCode[task.CurrentStatusDefinitionId];

        var liveValues = task.FieldValues
            .Where(v => v.IsDeleted == null)
            .ToList();

        var byStatus = liveValues
            .GroupBy(v => specIdToCode[v.StatusFieldSpecId])
            .ToDictionary(
                g => g.Key,
                g => (IReadOnlyDictionary<string, object?>)CustomDataWriter.Write(g.ToList(), specsById));

        var assigneeByStatus = task.Assignments
            .ToDictionary(a => statusIdToCode[a.StatusDefinitionId], a => a.AssignedUserId);

        var liveStatuses = byStatus.Keys.ToHashSet();
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

    public static UserResponse ToResponse(this User user) => new(user.Id, user.FullName);

    public static TaskTypeMetadataResponse ToResponse(this TaskType type) => new(
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
