using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TaskPlatform.Domain.Entities;

namespace TaskPlatform.Data.Persistence.Configurations;

// One row per (task, spec, itemIndex); StringValue or NumberValue holds the payload by Kind.
// Filtered unique index on the triple WHERE IsDeleted IS NULL lets retired rows coexist with
// the live row so backward-then-forward moves can restore data without tripping the constraint.

// EF Core configuration for TaskFieldValue — the per-(task, spec, item-index) value row that holds
// either a String or Number payload depending on the spec's Kind.
public sealed class TaskFieldValueConfiguration : IEntityTypeConfiguration<TaskFieldValue>
{
    // Wires up table, key, soft-delete filter, and the partial unique index that allows retired
    // rows to coexist with the live row for the same (task, spec, itemIndex).
    public void Configure(
        // EF's per-entity fluent builder for TaskFieldValue.
        EntityTypeBuilder<TaskFieldValue> b)
    {
        b.ToTable("TaskFieldValues");

        b.HasKey(v => v.Id);
        b.Property(v => v.Id).ValueGeneratedOnAdd();
        b.Property(v => v.TaskId).IsRequired();
        b.Property(v => v.StatusFieldSpecId).IsRequired();
        b.Property(v => v.ItemIndex).IsRequired().HasDefaultValue(1);
        b.Property(v => v.StringValue);
        // Money-ish precision is fine for the values captured today (qty, price, etc.). Bump
        // precision in a migration if a new field type needs more digits.
        b.Property(v => v.NumberValue).HasPrecision(18, 2);

        // Soft-delete marker. Nullable bool: null = live, true = retired. Matches the TaskItem
        // soft-delete convention so backward moves don't lose data.
        b.Property(v => v.IsDeleted);
        b.HasQueryFilter(v => v.IsDeleted == null);

        // Filtered unique index — see R-01. Without the WHERE IsDeleted IS NULL clause a forward
        // re-entry after a backward move would collide with the retired row on the same triple.
        b.HasIndex(v => new { v.TaskId, v.StatusFieldSpecId, v.ItemIndex })
            .IsUnique()
            .HasFilter("[IsDeleted] IS NULL");

        b.HasOne(v => v.Spec)
            .WithMany()
            .HasForeignKey(v => v.StatusFieldSpecId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
