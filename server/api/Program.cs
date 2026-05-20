using System.Diagnostics;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Scalar.AspNetCore;
using TaskPlatform.Api.ExceptionHandlers;
using TaskPlatform.Api.Health;
using TaskPlatform.Application.Services;
using TaskPlatform.Application.Workflow;
using TaskPlatform.Data.Persistence;
using TaskPlatform.Data.Workflow;

// Composition root. Singletons: IDbContextFactory, TaskTypeRegistry, WorkflowEngine, TimeProvider.
// Scoped: AppDbContext/IAppDbContext (built from the factory), TaskService, DatabaseSeeder.
// Exception handler chain order matters: Concurrency → DbUpdate → Global (most-specific first).

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddOpenApi();

builder.Services.AddProblemDetails(opt =>
{
    opt.CustomizeProblemDetails = ctx =>
    {
        ctx.ProblemDetails.Extensions["traceId"] =
            Activity.Current?.Id ?? ctx.HttpContext.TraceIdentifier;
        ctx.ProblemDetails.Extensions.TryAdd(
            "instance",
            $"{ctx.HttpContext.Request.Method} {ctx.HttpContext.Request.Path}");
    };
});

builder.Services.AddExceptionHandler<ConcurrencyExceptionHandler>();
builder.Services.AddExceptionHandler<DbUpdateExceptionHandler>();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();

// EnableRetryOnFailure is safe only because every write ends in a single SaveChangesAsync.
// Any future explicit transaction MUST be wrapped in IExecutionStrategy.Execute(...).
builder.Services.AddDbContextFactory<AppDbContext>(
    opt => opt.UseSqlServer(
        builder.Configuration.GetConnectionString("Default"),

        sqlOpt => sqlOpt.EnableRetryOnFailure(
            maxRetryCount: 5,
            maxRetryDelay: TimeSpan.FromSeconds(10),
            errorNumbersToAdd: null)),
    lifetime: ServiceLifetime.Singleton);
builder.Services.AddScoped<AppDbContext>(sp =>
    sp.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContext());
builder.Services.AddScoped<IAppDbContext>(sp => sp.GetRequiredService<AppDbContext>());

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddScoped<DatabaseSeeder>();
builder.Services.AddSingleton<ITaskTypeRegistry, TaskTypeRegistry>();
builder.Services.AddSingleton<WorkflowEngine>();
builder.Services.AddScoped<TaskService>();

builder.Services.AddHealthChecks()
    .AddCheck<DatabaseHealthCheck>("database", tags: ["ready"]);

var app = builder.Build();

// Startup order: migrate → seed → preload registry. Registry never refreshes, so adding a task
// type at runtime requires a restart. SeedExtraTypes=true mounts Marketing as the proof.
await using (var scope = app.Services.CreateAsyncScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.MigrateAsync();

    var seeder = scope.ServiceProvider.GetRequiredService<DatabaseSeeder>();
    await seeder.SeedAsync(
        includeMarketing: builder.Configuration.GetValue<bool>("SeedExtraTypes"));
}

await app.Services.GetRequiredService<ITaskTypeRegistry>().EnsureLoadedAsync();

app.UseExceptionHandler();
app.UseStatusCodePages();


    app.MapOpenApi();
    app.MapScalarApiReference(options =>
    {
        options.WithTitle("Task Platform API")
               .WithTheme(ScalarTheme.BluePlanet);
    });


app.MapHealthChecks("/health", new HealthCheckOptions { Predicate = _ => false });
app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = _ => false });
app.MapHealthChecks("/health/ready", new HealthCheckOptions { Predicate = r => r.Tags.Contains("ready") });

app.MapControllers();

app.Run();
