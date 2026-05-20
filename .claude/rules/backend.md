# Backend Rules

> Rules for any change to `server/`. Cross-cutting rules in [project.md](project.md). Architecture in [.claude/architecture.md](../architecture.md). Decisions in [.claude/decisions.md](../decisions.md).

---

## 1. Layering

- **`domain/`** knows nothing of EF, HTTP, or Angular. Pure C#. Entities + value-objects + error types.
- **`application/`** owns the workflow engine, `IAppDbContext` (the DB seam), `ITaskTypeRegistry`, and `CustomDataParser`. Depends on `domain/` only.
- **`data/`** implements `AppDbContext`, EF configurations, the `TaskTypeRegistry` cache, and `DatabaseSeeder`. Depends on `application/` + `domain/`. (This is a small deliberate trade — see [decisions.md](../decisions.md).)
- **`api/`** is the HTTP boundary: controllers, request/response DTOs, exception handlers. Thin.

Do not move types across layers without a corresponding ADR entry.

---

## 2. Service boundaries

- **Controllers** are thin: parse DTO → call `TaskService` → `WorkflowOutcome` → `await this.ToActionResult(outcome, onSuccess)`.
- **`TaskService`** owns the transaction boundary — exactly one `SaveChangesAsync` per request (see [decisions.md ADR-04](../decisions.md)). No explicit transactions today.
- **`WorkflowEngine`** is pure — no DB access. Receives a tracked `TaskItem` + the registry + payload; returns a `WorkflowOutcome<TaskItem>`. Mutations happen on the entity in-memory; `TaskService` saves.
- **`CustomDataParser`** is the **only** place that validates per-status custom-data shape. Adding a new `StatusFieldKind` touches only this file + the enum + the lookup row.

---

## 3. WorkflowOutcome<T> Result type

Domain errors **do not throw**. They return `WorkflowOutcome.Fail(WorkflowError)`. The `WorkflowError` discriminated record union is converted to ProblemDetails by `WorkflowErrorMapper.Classify`. Adding a new error arm requires adding a `case` to `Classify` — the `_` arm throws to make missing arms loud.

Only **unexpected** exceptions hit the exception-handler chain.

---

## 4. EF Core rules

- **`AsNoTracking()`** on every read path.
- **`AsSplitQuery()`** when loading nested collections (e.g. the registry pattern: `TaskTypes` → `Statuses` → `Fields`). Without it, the JOIN is Cartesian and the materialized child collections contain duplicates.
- **`.TagWith("...")`** on every query — SQL Server's `dm_exec_query_stats` then attributes slow queries to the source.
- **Single `SaveChangesAsync` per request.** No explicit transactions. If one is added, wrap it in `IExecutionStrategy.Execute(...)` because `EnableRetryOnFailure` is on.
- **`IgnoreQueryFilters()`** is opt-in per query inside repository methods. Never leak it to controllers, never disable filters globally.
- **No raw SQL** in the request path. EF Core projections + LINQ only.

---

## 5. DI lifetimes

| Service | Lifetime |
| --- | --- |
| `IDbContextFactory<AppDbContext>` | Singleton |
| `AppDbContext` / `IAppDbContext` | Scoped (built from the factory) |
| `ITaskTypeRegistry`, `WorkflowEngine`, `TimeProvider` | Singleton |
| `TaskService`, `DatabaseSeeder` | Scoped |

The factory-then-scoped split lets the singleton registry share the same EF configuration without pinning request scope. Don't collapse it.

---

## 6. The `DetachStatusDefinitionNavigations` workaround is required

After `WorkflowEngine.ChangeStatus` assigns a registry-cached `StatusDefinition` (AsNoTracking) to a tracked `TaskItem`, EF would try to INSERT the parent. `TaskService` calls `DetachStatusDefinitionNavigations(task)` to mark the entry `Unchanged` so only the FK column updates.

**Do not remove the helper** without redesigning the engine's mutation contract. See [risks.md R-02](../risks.md).

---

## 7. No untyped escape hatches

`dynamic`, `object`, `JsonElement` floating across layers — forbidden. The single accepted exception is `JsonElement customData` flowing into `CustomDataParser.Parse`, which contains it. Don't pass `JsonElement` out of the parser.

---

## 8. Exception handler order (matters)

In [Program.cs](../../server/api/Program.cs):

1. `ConcurrencyExceptionHandler` (specific) — 409 on `DbUpdateConcurrencyException`.
2. `DbUpdateExceptionHandler` (specific) — 400 on `DbUpdateException`.
3. `GlobalExceptionHandler` (catch-all) — 500 with logged `traceId`.

New handlers must slot in by specificity. Catch-all is last.

---

## 9. ApiConventionMethod

Use `WorkflowApiConventions.WorkflowRead` / `WorkflowWrite` / `WorkflowCreate` ([WorkflowApiConventions.cs](../../server/api/contracts/WorkflowApiConventions.cs)) instead of repeating `[ProducesResponseType(...)]` declarations on every action. Keeps controllers terse and the contract consistent.

---

## 10. Migrations

- Migrations are the **schema source of truth**. Hand-edit DB schema = sin.
- Initial migration creates schema + seeds the `StatusFieldKinds` lookup. `DatabaseSeeder` (runtime, idempotent) handles users / task types / demo tasks.
- New migrations must run cleanly on an **empty** DB (don't assume prior migrations applied state outside their own scope).
- Surrogate ids for `StatusDefinitions` and `StatusFieldSpecs` are pinned (`ValueGeneratedNever`) — see [decisions.md ADR-07](../decisions.md). Don't switch them to IDENTITY.

---

## 11. Logging

- Use `ILogger<T>` injected via DI. No `Console.WriteLine`.
- Structured logging only — `_logger.LogInformation("Seeded {Users} users", count)`, not `"Seeded {count} users"`.
- Log levels: `Debug` for client-cancelled requests, `Information` for normal flow, `Warning` for recoverable issues, `Error` for unexpected exceptions.

---

## 12. When in doubt

Before changing anything in the workflow engine, `TaskService`, or the registry, read:

- [decisions.md](../decisions.md) — is it deliberate?
- [risks.md](../risks.md) — is it a sharp edge?
- [memory.md](../memory.md) §"Shared patterns — backend" — is there a non-obvious pattern at play?

If you can't find a deliberate reason and the change is non-trivial, append a new ADR before merging.
