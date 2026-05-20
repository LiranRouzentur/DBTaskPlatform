using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TaskPlatform.Domain.Workflow;

namespace TaskPlatform.Data.Persistence.Configurations;

// One row per per-status field; ItemCount > 1 means a fixed-length array. Pinned ids so child
// TaskFieldValue references survive renames and migrations. KindId FK guarantees DB-level
// integrity over the StatusFieldKind enum.
public sealed class StatusFieldSpecConfiguration : IEntityTypeConfiguration<StatusFieldSpec>
{
    public void Configure(EntityTypeBuilder<StatusFieldSpec> b)
    {
        b.ToTable("StatusFieldSpecs");

        b.HasKey(f => f.Id);
        b.Property(f => f.Id).ValueGeneratedNever();
        b.Property(f => f.StatusDefinitionId).IsRequired();
        b.Property(f => f.Name).HasMaxLength(64).IsRequired();
        b.Property(f => f.KindId).IsRequired();
        b.Property(f => f.ItemCount).IsRequired();
        b.Property(f => f.Position).IsRequired();
        b.Property(f => f.Min);
        b.Property(f => f.Max);

        b.HasOne<StatusFieldKindRow>()
            .WithMany()
            .HasForeignKey(f => f.KindId)
            .OnDelete(DeleteBehavior.Restrict);

        b.HasIndex(f => new { f.StatusDefinitionId, f.Name }).IsUnique();
        b.HasIndex(f => new { f.StatusDefinitionId, f.Position }).IsUnique();
    }
}
