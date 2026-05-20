using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using TaskPlatform.Data.Persistence;
using TaskPlatform.Data.Workflow;

namespace TaskPlatform.Tests.Integration;

[Trait("Category", "Integration")]
public sealed class TaskTypeRegistryIntegrationTests : IClassFixture<DatabaseFixture>, IAsyncLifetime
{
    private readonly DatabaseFixture _fixture;
    private ServiceProvider? _services;

    public TaskTypeRegistryIntegrationTests(DatabaseFixture fixture)
    {
        _fixture = fixture;
    }

    public async Task InitializeAsync()
    {
        await using var db = _fixture.CreateContext();
        await new DatabaseSeeder(db, NullLogger<DatabaseSeeder>.Instance).SeedAsync();

        var services = new ServiceCollection();
        services.AddDbContextFactory<AppDbContext>(
            opt => opt.UseSqlServer(_fixture.ConnectionString),
            lifetime: ServiceLifetime.Singleton);
        _services = services.BuildServiceProvider();
    }

    public Task DisposeAsync()
    {
        _services?.Dispose();
        return Task.CompletedTask;
    }

    [Fact]
    public async Task EnsureLoadedAsync_Loads_Both_Task_Types_With_Statuses_And_Fields()
    {
        var registry = new TaskTypeRegistry(GetFactory());

        await registry.EnsureLoadedAsync();

        Assert.Equal(2, registry.All.Count);
        var procurement = registry.Get(1);
        Assert.Equal("Procurement", procurement.Name);
        Assert.Equal(3, procurement.FinalStatusCode);
        Assert.Equal(3, procurement.Statuses.Count);
        var status2 = procurement.Statuses.First(s => s.Code == 2);
        var priceQuotes = Assert.Single(status2.Fields);
        Assert.Equal("priceQuotes", priceQuotes.Name);
        
        Assert.Equal(TaskPlatform.Domain.Workflow.StatusFieldKind.String, priceQuotes.Kind);
        Assert.Equal(2, priceQuotes.ItemCount);
        Assert.Equal(1, priceQuotes.Min);
        Assert.Equal(150, priceQuotes.Max);
    }

    [Fact]
    public async Task Get_Before_EnsureLoadedAsync_Throws_With_Clear_Message()
    {
        var registry = new TaskTypeRegistry(GetFactory());

        var ex = Assert.Throws<InvalidOperationException>(() => registry.Get(1));
        Assert.Contains("preloaded", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Get_With_Unknown_Key_Throws()
    {
        var registry = new TaskTypeRegistry(GetFactory());
        await registry.EnsureLoadedAsync();

        Assert.Throws<InvalidOperationException>(() => registry.Get(999));
    }

    [Fact]
    public async Task EnsureLoadedAsync_Called_Concurrently_Loads_Once()
    {
        var registry = new TaskTypeRegistry(GetFactory());

        await Task.WhenAll(
            registry.EnsureLoadedAsync().AsTask(),
            registry.EnsureLoadedAsync().AsTask(),
            registry.EnsureLoadedAsync().AsTask());

        Assert.Equal(2, registry.All.Count);
    }

    private IDbContextFactory<AppDbContext> GetFactory() =>
        _services!.GetRequiredService<IDbContextFactory<AppDbContext>>();
}
