using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TaskPlatform.Domain.Workflow;

namespace TaskPlatform.Data.Persistence.Configurations;

// Lookup backing the StatusFieldKind enum. Pinned ids match enum values (1=String, 2=Number);
// runtime code dispatches on the enum, never on this row.
public sealed class StatusFieldKindRowConfiguration : IEntityTypeConfiguration<StatusFieldKindRow>
{
    public void Configure(EntityTypeBuilder<StatusFieldKindRow> b)
    {
        b.ToTable("StatusFieldKinds");
        b.HasKey(k => k.Id);
        b.Property(k => k.Id).ValueGeneratedNever();
        b.Property(k => k.Kind).HasMaxLength(32).IsRequired();
        b.HasIndex(k => k.Kind).IsUnique();
    }
}
