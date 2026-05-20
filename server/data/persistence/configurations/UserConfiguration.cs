using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TaskPlatform.Domain.Entities;

namespace TaskPlatform.Data.Persistence.Configurations;

// IDENTITY PK (the only one — metadata tables use pinned ids). FullName cap matches the seed.
public sealed class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> b)
    {
        b.ToTable("Users");
        b.HasKey(u => u.Id);

        b.Property(u => u.FullName).HasMaxLength(128).IsRequired();
    }
}
