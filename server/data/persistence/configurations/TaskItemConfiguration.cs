using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TaskPlatform.Domain.Entities;
using TaskPlatform.Domain.Workflow;

namespace TaskPlatform.Data.Persistence.Configurations;

// Aggregate-root config. RowVersion drives optimistic concurrency (→409); global filter on
// IsDeleted hides soft-deleted tasks; (CurrentAssignedUserId, IsClosed) index backs the
// per-user open-tasks query.
public sealed class TaskItemConfiguration : IEntityTypeConfiguration<TaskItem>
{
    public void Configure(EntityTypeBuilder<TaskItem> b)
    {
        b.ToTable("TaskItems");
        b.HasKey(t => t.Id);

        b.Property(t => t.TaskTypeId).IsRequired();
        b.Property(t => t.CurrentStatusDefinitionId).IsRequired();
        b.Property(t => t.IsClosed).IsRequired();
        b.Property(t => t.CurrentAssignedUserId).IsRequired();
        b.Property(t => t.RowVersion).IsRowVersion();
        b.Property(t => t.CreatedAtUtc).IsRequired();
        b.Property(t => t.UpdatedAtUtc).IsRequired();
        // Soft-delete marker. Nullable bool: null = live, true = retired. `false` is not a valid state.
        b.Property(t => t.IsDeleted);

        b.HasQueryFilter(t => t.IsDeleted == null);

        b.HasIndex(t => t.CurrentAssignedUserId);
        b.HasIndex(t => new { t.CurrentAssignedUserId, t.IsClosed });
        b.HasIndex(t => t.TaskTypeId);

        b.HasOne<User>()
            .WithMany()
            .HasForeignKey(t => t.CurrentAssignedUserId)
            .OnDelete(DeleteBehavior.Restrict);

        b.HasOne<TaskType>()
            .WithMany()
            .HasForeignKey(t => t.TaskTypeId)
            .OnDelete(DeleteBehavior.Restrict);

        b.HasOne(t => t.CurrentStatusDefinition)
            .WithMany()
            .HasForeignKey(t => t.CurrentStatusDefinitionId)
            .OnDelete(DeleteBehavior.Restrict);

        b.HasMany(t => t.FieldValues)
            .WithOne()
            .HasForeignKey(v => v.TaskId)
            .OnDelete(DeleteBehavior.Cascade);

        b.Navigation(t => t.FieldValues).Metadata.SetField("_fieldValues");
        b.Navigation(t => t.FieldValues).UsePropertyAccessMode(PropertyAccessMode.Field);

        b.HasMany(t => t.Assignments)
            .WithOne()
            .HasForeignKey(a => a.TaskId)
            .OnDelete(DeleteBehavior.Cascade);

        b.Navigation(t => t.Assignments).Metadata.SetField("_assignments");
        b.Navigation(t => t.Assignments).UsePropertyAccessMode(PropertyAccessMode.Field);

        b.Ignore(t => t.Code);
    }
}
