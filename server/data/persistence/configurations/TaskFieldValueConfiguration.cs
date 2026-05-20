using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TaskPlatform.Domain.Entities;

namespace TaskPlatform.Data.Persistence.Configurations;

// One row per (task, spec, itemIndex); StringValue or NumberValue holds the payload by Kind.
// Filtered unique index on the triple WHERE IsDeleted IS NULL lets retired rows coexist with
// the live row so backward-then-forward moves can restore data without tripping the constraint.
public sealed class TaskFieldValueConfiguration : IEntityTypeConfiguration<TaskFieldValue>
{
    public void Configure(EntityTypeBuilder<TaskFieldValue> b)
    {
        b.ToTable("TaskFieldValues");
        
        b.HasKey(v => v.Id);
        b.Property(v => v.Id).ValueGeneratedOnAdd();
        b.Property(v => v.TaskId).IsRequired();
        b.Property(v => v.StatusFieldSpecId).IsRequired();
        b.Property(v => v.ItemIndex).IsRequired().HasDefaultValue(1);
        b.Property(v => v.StringValue);
        b.Property(v => v.NumberValue).HasPrecision(18, 2);

        b.Property(v => v.IsDeleted);
        b.HasQueryFilter(v => v.IsDeleted == null);

        b.HasIndex(v => new { v.TaskId, v.StatusFieldSpecId, v.ItemIndex })
            .IsUnique()
            .HasFilter("[IsDeleted] IS NULL");

        b.HasOne(v => v.Spec)
            .WithMany()
            .HasForeignKey(v => v.StatusFieldSpecId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
