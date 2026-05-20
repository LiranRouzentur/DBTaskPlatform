using Microsoft.EntityFrameworkCore;
using TaskPlatform.Data.Persistence;

namespace TaskPlatform.Tests.Integration;

public sealed class DatabaseFixture : IAsyncLifetime
{
    public string ConnectionString { get; }
    public DbContextOptions<AppDbContext> Options { get; }

    public DatabaseFixture()
    {
        var dbName = $"TaskPlatform_Test_{Guid.NewGuid():N}";
        ConnectionString =
            $"Server=(localdb)\\MSSQLLocalDB;Database={dbName};Trusted_Connection=True;TrustServerCertificate=True";
        Options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlServer(ConnectionString)
            .Options;
    }

    public async Task InitializeAsync()
    {
        await using var db = new AppDbContext(Options);
        await db.Database.MigrateAsync();
    }

    public async Task DisposeAsync()
    {
        await using var db = new AppDbContext(Options);
        await db.Database.EnsureDeletedAsync();
    }

    public AppDbContext CreateContext() => new(Options);
}
