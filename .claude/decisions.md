# Architectural Decisions (ADRs)

> *Why* the code is the way it is. Read this before refactoring something that looks "wrong" — chances are it's deliberate.

Each entry: **Decision · Context · Consequences · Alternatives considered**.

---

## ADR-01: Data-driven extensibility over polymorphism

**Decision.** A new task type is a set of DB rows, not new C# classes. The single dispatch point for field data is `StatusFieldKind` (`String` / `Number`) in `CustomDataParser`.

**Context.** The assignment's primary grading axis is "add a third task type without modifying existing code". The two obvious paths are (a) one C# class per task type, registered via a strategy/registry, or (b) a metadata table that all generic code reads from. Path (a) still requires editing controllers/services on every new type unless the registry scanning is automatic; path (b) reduces the change to data only.

**Consequences.**
- Adding a task type = `INSERT` into `TaskTypes` + `StatusDefinitions` + `StatusFieldSpecs` + API restart. No code touched.
- The generic core knows the *shape* of a task type but never its *name*.
- The Angular client mirrors this: `DynamicFormComponent` walks `FieldSpecMetadata[]` from the metadata endpoint. Zero TS edit for a new type.
- Proof point: the **Marketing** type lives entirely as a seeded data variant behind `SeedExtraTypes=true` in [docker-compose.yml](../docker-compose.yml).

**Alternatives considered.** Per-type C# classes (rejected — still required registration-line edits, and made per-type validators a "shared validator that knows about all types" anti-pattern). Per-type DB tables (rejected — required schema migration per type).

---

## ADR-02: Per-status field history preservation (soft-delete on backward moves)

**Decision.** When a task moves backward, its `TaskFieldValue` rows for statuses above the new target are **soft-deleted** (`IsDeleted = true`). Forward re-entry can **restore** them by clearing `IsDeleted`.

**Context.** Rule 5 (backward moves are unrestricted) combined with rule 7a (type-specific data must be satisfied on forward moves) creates a question: when you go 3→2→3, do you have to re-enter the status-3 data? Hard-deleting would force re-entry; soft-deleting lets the prior data come back.

**Consequences.**
- A **filtered unique index** on `(TaskId, StatusFieldSpecId, ItemIndex) WHERE IsDeleted IS NULL` is required — guarantees one live row per spec+item per task while letting retired rows coexist.
- `IsDeleted` is a *nullable* bool (`null` = live, `true` = retired) — `false` is not a valid state.
- The `TaskDetail` response surfaces `retiredStatuses` so the client can show "previously captured" hints.

**Alternatives considered.** Hard-delete + force re-entry (rejected — bad UX). Append-only ledger with a `current` flag (rejected — more complex than necessary; the soft-delete + filtered index gives equivalent guarantees).

---

## ADR-03: Hard-delete assignments on backward moves

**Decision.** `TaskAssignment` rows above the new target status are **hard-deleted** on backward moves, recreated on forward re-entry.

**Context.** End-state for any observable behaviour matches the soft-delete variant — the user only ever sees the current assignee. Assignments are per `(task, status)` natural-keyed via a composite PK.

**Consequences.** Simpler than soft-delete for this entity; keeps the table small; no filtered index needed.

**Alternatives considered.** Soft-delete to mirror `TaskFieldValue` (rejected — added complexity with no observable benefit).

---

## ADR-04: Single `SaveChangesAsync` per request — no explicit transactions

**Decision.** Every operation (`Create`, `ChangeStatus`, `UpdateStep`, `Close`) issues exactly one `SaveChangesAsync` at the end of `TaskService`. Domain mutations happen in memory on the tracked entity; persistence is the single boundary.

**Context.** The aggregate root (`TaskItem`) owns all writable state for an operation. EF Core's change tracker batches the writes into a single transaction implicitly when only one `SaveChangesAsync` is involved.

**Consequences.**
- Safe to use `EnableRetryOnFailure` — no partial commits, no nested-transaction races.
- The `WorkflowEngine` can mutate freely without thinking about transactions.
- **Constraint**: any future explicit transaction must wrap calls in `IExecutionStrategy.Execute(...)` because retry-on-failure is on. Currently zero explicit transactions exist.

**Alternatives considered.** Explicit transactions around each operation (rejected — unnecessary given the single-aggregate write boundary, and incompatible with `EnableRetryOnFailure` without `IExecutionStrategy`).

---

## ADR-05: Singleton `ITaskTypeRegistry` preloaded at startup, never refreshed

**Decision.** `TaskTypeRegistry` is registered as a Singleton, populated once via `EnsureLoadedAsync()` in `Program.cs` after migrations + seed, and never refreshed thereafter.

**Context.** Task-type metadata is read on every request (workflow validation, mapper, `/api/task-types`). Loading it per request would force a JOIN-heavy query every time; caching it once is trivially correct given that adding a task type requires deliberate human action.

**Consequences.**
- Zero DB cost for task-type lookups during normal operation.
- **Adding a new task type requires an app restart** to pick up the new rows — documented in [risks.md](risks.md).
- The factory-then-scoped split for `AppDbContext` (Singleton factory + Scoped adapter) lets the singleton registry instantiate a context for the one-time load without pinning the lifetime.

**Alternatives considered.** Scoped registry with per-request load (rejected — excessive DB chatter). Scoped registry with caching (rejected — cache invalidation is the harder problem, and we don't have a runtime mutation path anyway). `IMemoryCache` with TTL (rejected — same complexity for no measurable benefit).

---

## ADR-06: `StatusFieldKind` as enum + DB lookup table

**Decision.** `StatusFieldKind` is a C# enum (`String=1`, `Number=2`) and *also* has a `StatusFieldKindRow` lookup table in SQL with the same ids. `StatusFieldSpecs.KindId` is FK'd to it.

**Context.** Code dispatch needs an enum (the `switch` in `CustomDataParser`). DB integrity needs a constraint that prevents `KindId = 99` from being inserted. A lookup table provides both — without an EF nav property on the spec side (it would force unnecessary joins).

**Consequences.**
- Adding a new kind = add enum arm + add `case` to `CustomDataParser.ProcessSingle` + insert lookup row + write a migration.
- The previous `StringArray` kind was retired in favour of `Kind = String|Number + ItemCount = N`.
- `StatusFieldKindRow` exists purely for FK integrity — there is no nav property from `StatusFieldSpec` back to it.

**Alternatives considered.** Pure enum without lookup table (rejected — no DB-level integrity). Lookup table only (rejected — code dispatch needs a typed enum).

---

## ADR-07: Surrogate ids for `StatusDefinitions` / `StatusFieldSpecs` with `ValueGeneratedNever`

**Decision.** Both tables use pinned (manually set, never auto-generated) integer ids that are referenced by seed data and migrations.

**Context.** `TaskFieldValue.StatusFieldSpecId` is a foreign key. If a spec id changed when a name was edited, every historical value would orphan. Stable ids = safe renames.

**Consequences.**
- Seed code pins ids explicitly (see [DatabaseSeeder.cs](../server/data/persistence/DatabaseSeeder.cs)).
- Migrations can reference ids without lookups.
- Names can be edited freely without breaking value references.

**Alternatives considered.** IDENTITY ids with a lookup by `(TypeId, Code)` (rejected — joins on every value query). Composite natural keys (rejected — more complex, no benefit).

---

## ADR-08: Optimistic concurrency via `TaskItem.RowVersion`

**Decision.** `TaskItem` carries a `RowVersion` column (SQL `rowversion`) used by EF Core as a concurrency token. A conflicting write throws `DbUpdateConcurrencyException`, caught by `ConcurrencyExceptionHandler` and returned as 409 `concurrent-modification`.

**Context.** Two users editing the same task simultaneously must not silently overwrite each other.

**Consequences.**
- The Angular `TasksStore` catches 409 with `rule: concurrent-modification`, auto-refetches the list, and surfaces a "Out of sync" toast — the user can retry from fresh state.
- The conflict window is the request lifetime — narrow.

**Alternatives considered.** Pessimistic locking (rejected — scales badly). No concurrency control (rejected — silent data loss).

---

## ADR-09: Two read paths in `TaskService` + a third tracked path

**Decision.** Three distinct read methods:

- `ListAsync(filters)` — slim, no field values, `AsNoTracking`.
- `GetByIdAsync(id)` — full detail, `AsNoTracking`, `IgnoreQueryFilters` so retired rows are visible to the mapper.
- `LoadTrackedAsync(id)` — tracked path for write operations; also bypasses filters.

**Context.** Different read shapes have different performance + correctness requirements. The slim list path must scale; the detail path must show history; the write path must see retired rows so the engine can decide what to restore on a forward move.

**Consequences.**
- Three methods is more code, but each one is shaped exactly for its caller.
- `IgnoreQueryFilters` is opt-in per query — never globally disabled.

**Alternatives considered.** Single read method with optional includes (rejected — leaks responsibility, hurts perf on the hot list path).

---

## ADR-10: Modal-as-child-route + `skipLocationChange`

**Decision.** The create-task and change-status modals are child routes of `/tasks`, mounted via `<router-outlet>`. Opening and closing both use `router.navigate(..., { skipLocationChange: true })`.

**Context.** A naïve modal-as-overlay loses deep-linkability; a naïve modal-as-route changes the URL bar mid-list, breaking the back button experience for a transient overlay.

**Consequences.**
- URL stays at `/tasks` while the modal renders.
- Component-input-binding (`withComponentInputBinding()`) provides the route-param id to the modal component.
- **Must stay in sync**: both opening (`navigate(['/tasks', id, 'change-status'])`) and closing (`navigate(['/tasks'])`) calls must pass `skipLocationChange: true`. Forgetting one breaks the pattern.

**Alternatives considered.** Pure overlay (rejected — no deep-link via copy/paste). Pure routed modal (rejected — URL noise + back-button confusion).

---

## ADR-11: OpenAPI / Scalar gated to Development only

**Decision.** `MapOpenApi()` and `MapScalarApiReference()` are called unconditionally in `Program.cs` today, but the upstream intent is to gate them to `Development`-only environments.

**Context.** Public OpenAPI exposes the full endpoint surface and accepted shapes — convenient in dev, recon-friendly in prod.

**Consequences.** In a real deployment the gating would move them behind `if (app.Environment.IsDevelopment())`. The repo currently runs only in Docker development mode, so the call sites are unconditional but the intent is clear.

**Alternatives considered.** Always on (rejected for hypothetical prod). Always off (rejected — Scalar is one of the strongest dev-UX wins).
