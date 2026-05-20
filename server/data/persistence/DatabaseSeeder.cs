using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using TaskPlatform.Domain.Entities;
using TaskPlatform.Domain.Workflow;

namespace TaskPlatform.Data.Persistence;

// Idempotent seeder run at startup after MigrateAsync. Each Seed* method is a no-op when its
// table is already populated. Pinned ids (ValueGeneratedNever) survive schema migrations.
// `includeMarketing` mounts a third task type purely from seed data — extensibility proof.
public sealed class DatabaseSeeder(AppDbContext db, ILogger<DatabaseSeeder> logger)
{

    private const int ProcurementId = 1;
    private const int DevelopmentId = 2;
    // Third task type, gated behind config: demonstrates "add a type without touching code".
    private const int MarketingId   = 3;

    private const int ProcStatus1Id = 1;
    private const int ProcStatus2Id = 2;
    private const int ProcStatus3Id = 3;
    private const int DevStatus1Id  = 4;
    private const int DevStatus2Id  = 5;
    private const int DevStatus3Id  = 6;
    private const int DevStatus4Id  = 7;
    private const int MktStatus1Id  = 8;
    private const int MktStatus2Id  = 9;
    private const int MktStatus3Id  = 10;

    private const int SpecPriceQuotesId   = 1;
    private const int SpecReceiptId       = 2;
    private const int SpecSpecificationId = 3;
    private const int SpecBranchNameId    = 4;
    private const int SpecVersionNumberId = 5;
    private const int SpecCampaignNameId  = 6;
    private const int SpecBudgetId        = 7;
    private const int SpecLaunchDateId    = 8;
    private const int SpecChannelsId      = 9;

    private static readonly string[] SeedUserNames =
    [
        "Alice Cooper",
        "Bob Newman",
        "Carol Reyes",
        "David Park",
        "Eve Larsen",
    ];

    private static readonly Dictionary<string, string[]> StringPools = new(StringComparer.Ordinal)
    {
        ["receipt"] = [
            "Receipt INV-2026-014 from VendorA ($1180)",
            "Receipt INV-2026-027 from VendorB ($1240)",
            "Receipt INV-2025-981 from VendorC ($1095)",
        ],
        ["specification"] = [
            "Add dark-mode toggle to user settings; remember preference across sessions.",
            "Wire up the new audit-log endpoint with cursor-based pagination.",
            "Build a metrics dashboard tile for weekly active users.",
        ],
        ["branchName"] = [
            "feat/dark-mode-toggle",
            "feat/audit-log-pagination",
            "feat/metrics-tile-wau",
        ],
        ["versionNumber"] = ["1.4.0", "1.5.0-rc.2", "2.0.0-beta.1"],
        ["campaignName"]  = ["Q3 Launch Awareness", "Summer Bundle Push", "Holiday Gift Refresh"],
        ["launchDate"]    = ["2026-06-15", "2026-07-30", "2026-12-01"],
    };

    private static readonly string[][] PriceQuotesPool =
    [
        ["$1200 from VendorA", "$1150 from VendorB"],
        ["$1340 from Acme Supplies", "$1295 from Globex Imports"],
        ["$980 from Initech", "$1050 from Hooli Procurement"],
    ];

    private static readonly string[][] ChannelsPool =
    [
        
        ["email", "social", "display"],
        ["email", "paid-search", "social"],
        ["organic", "paid-search", "affiliate"],
    ];

    public async Task SeedAsync(bool includeMarketing = false, CancellationToken ct = default)
    {
        await SeedFieldKindsAsync(ct);
        var seededUsers = await SeedUsersAsync(ct);
        var (seededTypes, typesById) = await SeedTaskTypesAsync(includeMarketing, ct);

        if (seededUsers + seededTypes > 0)
        {
            await db.SaveChangesAsync(ct);
        }

        var userIdByName = await db.Users
            .AsNoTracking()
            .ToDictionaryAsync(u => u.FullName, u => u.Id, ct);

        var seededTasks = await SeedDemoTasksAsync(typesById, userIdByName, includeMarketing, ct);

        if (seededTasks > 0)
        {
            await db.SaveChangesAsync(ct);
            logger.LogInformation(
                "Seeded {Users} users, {Types} task types, {Tasks} demo tasks.",
                seededUsers, seededTypes, seededTasks);
        }
        else if (seededUsers + seededTypes > 0)
        {
            logger.LogInformation(
                "Seeded {Users} users, {Types} task types.",
                seededUsers, seededTypes);
        }
    }

    private async Task SeedFieldKindsAsync(CancellationToken ct)
    {
        if (await db.StatusFieldKinds.AnyAsync(ct)) return;
        db.StatusFieldKinds.AddRange(
            StatusFieldKindRow.Seed((int)StatusFieldKind.String, "String"),
            StatusFieldKindRow.Seed((int)StatusFieldKind.Number, "Number"));
        await db.SaveChangesAsync(ct);
    }

    private async Task<int> SeedUsersAsync(CancellationToken ct)
    {
        if (await db.Users.AnyAsync(ct)) return 0;
        foreach (var name in SeedUserNames) db.Users.Add(User.Seed(name));
        return SeedUserNames.Length;
    }

    private async Task<(int count, IReadOnlyDictionary<int, TaskType> typesById)> SeedTaskTypesAsync(bool includeMarketing, CancellationToken ct)
    {
        if (await db.TaskTypes.AnyAsync(ct))
        {
            var existing = await db.TaskTypes
                .Include(t => t.Statuses.OrderBy(s => s.Position))
                    .ThenInclude(s => s.Fields.OrderBy(f => f.Position))
                .ToDictionaryAsync(t => t.Id, ct);
            return (0, existing);
        }

        var procurement = TaskType.Seed(
            ProcurementId,
            "Procurement",
            statuses:
            [
                StatusDefinition.Seed(ProcStatus1Id, ProcurementId, code: 1, "Created", position: 1, isFinal: false, fields: []),
                StatusDefinition.Seed(ProcStatus2Id, ProcurementId, code: 2, "Supplier offers received", position: 2, isFinal: false, fields:
                [
                    
                    StatusFieldSpec.Seed(SpecPriceQuotesId, "priceQuotes", StatusFieldKind.String, itemCount: 2, position: 1, min: 1, max: 150),
                ]),
                StatusDefinition.Seed(ProcStatus3Id, ProcurementId, code: 3, "Purchase completed", position: 3, isFinal: true, fields:
                [
                    StatusFieldSpec.Seed(SpecReceiptId, "receipt", StatusFieldKind.String, itemCount: 1, position: 1, min: 1, max: 150),
                ]),
            ]);

        var development = TaskType.Seed(
            DevelopmentId,
            "Development",
            statuses:
            [
                StatusDefinition.Seed(DevStatus1Id, DevelopmentId, code: 1, "Created", position: 1, isFinal: false, fields: []),
                StatusDefinition.Seed(DevStatus2Id, DevelopmentId, code: 2, "Specification completed", position: 2, isFinal: false, fields:
                [
                    StatusFieldSpec.Seed(SpecSpecificationId, "specification", StatusFieldKind.String, itemCount: 1, position: 1, min: 1, max: 150),
                ]),
                StatusDefinition.Seed(DevStatus3Id, DevelopmentId, code: 3, "Development completed", position: 3, isFinal: false, fields:
                [
                    StatusFieldSpec.Seed(SpecBranchNameId, "branchName", StatusFieldKind.String, itemCount: 1, position: 1, min: 1, max: 150),
                ]),
                StatusDefinition.Seed(DevStatus4Id, DevelopmentId, code: 4, "Distribution completed", position: 4, isFinal: true, fields:
                [
                    StatusFieldSpec.Seed(SpecVersionNumberId, "versionNumber", StatusFieldKind.String, itemCount: 1, position: 1, min: 1, max: 150),
                ]),
            ]);

        var types = new Dictionary<int, TaskType>
        {
            [ProcurementId] = procurement,
            [DevelopmentId] = development,
        };
        var addList = new List<TaskType> { procurement, development };

        if (includeMarketing)
        {
            var marketing = TaskType.Seed(
                MarketingId,
                "Marketing",
                statuses:
                [
                    StatusDefinition.Seed(MktStatus1Id, MarketingId, code: 1, "Brief created", position: 1, isFinal: false, fields: []),
                    StatusDefinition.Seed(MktStatus2Id, MarketingId, code: 2, "Campaign approved", position: 2, isFinal: false, fields:
                    [
                        StatusFieldSpec.Seed(SpecCampaignNameId, "campaignName", StatusFieldKind.String, itemCount: 1, position: 1, min: 1, max: 150),
                        StatusFieldSpec.Seed(SpecBudgetId,       "budget",       StatusFieldKind.Number, itemCount: 1, position: 2, min: 1, max: 10000),
                    ]),
                    StatusDefinition.Seed(MktStatus3Id, MarketingId, code: 3, "Campaign launched", position: 3, isFinal: true, fields:
                    [
                        StatusFieldSpec.Seed(SpecLaunchDateId, "launchDate", StatusFieldKind.String, itemCount: 1, position: 1, min: 1, max: 150),
                        
                        StatusFieldSpec.Seed(SpecChannelsId,   "channels",   StatusFieldKind.String, itemCount: 3, position: 2, min: 1, max: 150),
                    ]),
                ]);
            addList.Add(marketing);
            types[MarketingId] = marketing;
        }

        db.TaskTypes.AddRange(addList);
        return (addList.Count, types);
    }

    private async Task<int> SeedDemoTasksAsync(
        IReadOnlyDictionary<int, TaskType> typesById,
        IReadOnlyDictionary<string, int> userIdByName,
        bool includeMarketing,
        CancellationToken ct)
    {
        if (await db.Tasks.AnyAsync(ct)) return 0;

        var alice = userIdByName["Alice Cooper"];
        var bob   = userIdByName["Bob Newman"];
        var carol = userIdByName["Carol Reyes"];
        var david = userIdByName["David Park"];
        var eve   = userIdByName["Eve Larsen"];
        var allUserIds = new[] { alice, bob, carol, david, eve };

        var seedList = new List<(int TypeId, int Code, bool Closed, int Assignee)>
        {
            
            (ProcurementId, 1, false, alice),
            (ProcurementId, 1, false, bob),
            (ProcurementId, 2, false, carol),
            (ProcurementId, 2, false, david),
            (ProcurementId, 2, false, eve),
            (ProcurementId, 3, false, alice),
            (ProcurementId, 3, false, bob),
            (ProcurementId, 3, true,  carol),
            (ProcurementId, 3, true,  david),

            (DevelopmentId, 1, false, eve),
            (DevelopmentId, 1, false, alice),
            (DevelopmentId, 2, false, bob),
            (DevelopmentId, 2, false, carol),
            (DevelopmentId, 2, false, david),
            (DevelopmentId, 3, false, eve),
            (DevelopmentId, 3, false, alice),
            (DevelopmentId, 3, false, bob),
            (DevelopmentId, 4, false, carol),
            (DevelopmentId, 4, false, david),
            (DevelopmentId, 4, true,  eve),
        };

        if (includeMarketing)
        {
            
            seedList.Add((MarketingId, 1, false, alice));
            seedList.Add((MarketingId, 2, false, bob));
            seedList.Add((MarketingId, 3, true,  carol));
        }

        var seeds = seedList.ToArray();

        var stagedTasks = new List<(TaskItem Task, TaskType Type, StatusDefinition Status, int Assignee)>(seeds.Length);
        foreach (var s in seeds)
        {
            var type = typesById[s.TypeId];
            var statusDef = type.Statuses.Single(d => d.Code == s.Code);
            var created = RandomDateInLast(5);
            var updated = RandomBetween(created, DateTime.UtcNow);
            var task = TaskItem.SeedNew(type.Id, statusDef, s.Closed, s.Assignee, created, updated);
            db.Tasks.Add(task);
            stagedTasks.Add((task, type, statusDef, s.Assignee));
        }
        await db.SaveChangesAsync(ct);

        foreach (var (task, type, currentStatus, assignee) in stagedTasks)
        {
            foreach (var statusDef in type.Statuses.OrderBy(x => x.Position))
            {
                if (statusDef.Position > currentStatus.Position) break;

                var stageAssignee = statusDef.Id == currentStatus.Id
                    ? assignee
                    : PickPrior(assignee, allUserIds);
                task.SeedAddAssignment(
                    TaskAssignment.Capture(task.Id, statusDef.Id, stageAssignee, task.UpdatedAtUtc));

                foreach (var fieldSpec in statusDef.Fields)
                {
                    foreach (var value in SeedValuesFor(task.Id, fieldSpec))
                    {
                        task.SeedAddFieldValue(value);
                    }
                }
            }
        }

        return seeds.Length;
    }

    private static IEnumerable<TaskFieldValue> SeedValuesFor(int taskId, StatusFieldSpec spec)
    {
        return spec.Kind switch
        {
            StatusFieldKind.String when spec.ItemCount == 1 => Single(TaskFieldValue.ForString(taskId, spec, PickStringValue(spec.Name))),
            StatusFieldKind.String => PickStringArray(spec).Select((v, i) => TaskFieldValue.ForString(taskId, spec, v, itemIndex: i + 1)),
            StatusFieldKind.Number when spec.ItemCount == 1 => Single(TaskFieldValue.ForNumber(taskId, spec, Random.Shared.Next(1, 100))),
            StatusFieldKind.Number => Enumerable.Range(1, spec.ItemCount)
                .Select(i => TaskFieldValue.ForNumber(taskId, spec, Random.Shared.Next(1, 100), itemIndex: i)),
            _ => throw new InvalidOperationException($"Unknown StatusFieldKind: {spec.Kind}"),
        };
    }

    private static IEnumerable<T> Single<T>(T value) { yield return value; }

    private static string PickStringValue(string fieldName)
    {
        var pool = StringPools.GetValueOrDefault(fieldName) ?? ["sample value"];
        return PickRandom(pool);
    }

    private static IReadOnlyList<string> PickStringArray(StatusFieldSpec spec)
    {
        var pool = spec.Name switch
        {
            "priceQuotes" => PriceQuotesPool,
            "channels"    => ChannelsPool,
            _             => null,
        };
        if (pool is not null)
        {
            return PickRandom(pool);
        }
        
        return Enumerable.Range(1, spec.ItemCount)
            .Select(i => $"item-{i}")
            .ToArray();
    }

    private static DateTime RandomDateInLast(int maxDaysAgo)
    {
        var totalMinutes = maxDaysAgo * 24 * 60;
        return DateTime.UtcNow.AddMinutes(-Random.Shared.Next(60, totalMinutes));
    }

    private static DateTime RandomBetween(DateTime lower, DateTime upper)
    {
        if (upper <= lower) return upper;
        var spanMinutes = (int)(upper - lower).TotalMinutes;
        if (spanMinutes <= 0) return upper;
        return lower.AddMinutes(Random.Shared.Next(0, spanMinutes));
    }

    private static T PickRandom<T>(IReadOnlyList<T> pool) =>
        pool[Random.Shared.Next(pool.Count)];

    private static int PickPrior(int currentAssignee, IReadOnlyList<int> pool)
    {
        var others = pool.Where(u => u != currentAssignee).ToArray();
        return others[Random.Shared.Next(others.Length)];
    }
}
