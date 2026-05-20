using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TaskPlatform.Domain.Workflow;

namespace TaskPlatform.Data.Persistence.Configurations;

// Unique Name + pinned Id. Restrict delete — types can't be removed while tasks reference them.
// FinalStatus* are derived getters, not columns (Ignored).

// EF Core configuration for TaskType — the top-level metadata aggregate that owns the ordered
// chain of StatusDefinitions making up a workflow.
public sealed class TaskTypeConfiguration : IEntityTypeConfiguration<TaskType>
{
    // Pins surrogate ids, enforces a unique Name, configures the cascading-restrict relationship
    // to StatusDefinitions, and ignores the derived FinalStatus* convenience properties.
    public void Configure(
        // EF's per-entity fluent builder for TaskType.
        EntityTypeBuilder<TaskType> b)
    {
        b.ToTable("TaskTypes");
        b.HasKey(t => t.Id);
        // ValueGeneratedNever: ids come from the migration/seed. TaskItem.TaskTypeId and the
        // TaskTypeRegistry cache key both depend on these staying stable.
        b.Property(t => t.Id).ValueGeneratedNever();
        b.Property(t => t.Name).HasMaxLength(64).IsRequired();
        b.HasIndex(t => t.Name).IsUnique();

        b.HasMany(t => t.Statuses)
            .WithOne()
            .HasForeignKey(s => s.TaskTypeId)
            .OnDelete(DeleteBehavior.Restrict);

        // Field-backed access: EF mutates the private _statuses list directly. The public
        // navigation exposes a read-only view; mutations only happen through the aggregate.
        b.Navigation(t => t.Statuses).Metadata.SetField("_statuses");
        b.Navigation(t => t.Statuses).UsePropertyAccessMode(PropertyAccessMode.Field);

        // Derived getters computed from the Statuses collection — not persisted columns.
        b.Ignore(t => t.FinalStatusCode);
        b.Ignore(t => t.FinalStatus);
    }
}
