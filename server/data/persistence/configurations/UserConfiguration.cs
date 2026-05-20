using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TaskPlatform.Domain.Entities;

namespace TaskPlatform.Data.Persistence.Configurations;

// IDENTITY PK (the only one — metadata tables use pinned ids). FullName cap matches the seed.

// EF Core configuration for User — the application's only IDENTITY-keyed entity (workflow
// metadata tables all use pinned ids).
public sealed class UserConfiguration : IEntityTypeConfiguration<User>
{
    // Maps User to the Users table, declares the PK, and caps FullName length to match the seed
    // data so existing rows can never overflow the column.
    public void Configure(
        // EF's per-entity fluent builder for User.
        EntityTypeBuilder<User> b)
    {
        b.ToTable("Users");
        b.HasKey(u => u.Id);

        b.Property(u => u.FullName).HasMaxLength(128).IsRequired();
    }
}
