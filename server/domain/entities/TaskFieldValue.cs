using TaskPlatform.Domain.Workflow;

namespace TaskPlatform.Domain.Entities;

// One value per (task, spec, itemIndex) triple, polymorphic on Kind (StringValue OR NumberValue).
// Mutation internal — only TaskItem.UpsertFieldValues may change. `Spec` nav is configured but
// intentionally NOT loaded; callers resolve spec metadata via the registry by FK.
public sealed class TaskFieldValue
{
    public int Id { get; private set; }
    public int TaskId { get; private set; }
    public int StatusFieldSpecId { get; private set; }

    public int ItemIndex { get; private set; } = 1;

    public StatusFieldSpec Spec { get; private set; } = default!;

    public string? StringValue { get; private set; }
    public decimal? NumberValue { get; private set; }

    public bool? IsDeleted { get; private set; }

    private TaskFieldValue() { }

    internal void MarkDeleted() => IsDeleted = true;

    internal void SetValues(string? stringValue, decimal? numberValue)
    {
        StringValue = stringValue;
        NumberValue = numberValue;
        IsDeleted = null;
    }

    public static TaskFieldValue ForString(int taskId, StatusFieldSpec spec, string value, int itemIndex = 1) => new()
    {
        TaskId = taskId,
        StatusFieldSpecId = spec.Id,
        ItemIndex = itemIndex,
        StringValue = value,
    };

    public static TaskFieldValue ForNumber(int taskId, StatusFieldSpec spec, decimal value, int itemIndex = 1) => new()
    {
        TaskId = taskId,
        StatusFieldSpecId = spec.Id,
        ItemIndex = itemIndex,
        NumberValue = value,
    };
}
