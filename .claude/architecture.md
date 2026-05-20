# Architecture

> The canonical map of how the system is built — layers, components, data flow, persistence model, API surface. Answers "where does X live and how does it collaborate with Y?".

For *why* it is built this way, see [decisions.md](decisions.md). For non-obvious patterns and discoveries, see [memory.md](memory.md).

---

## 1. System overview

A **data-driven** task management platform that implements the assignment's "extensible task types" challenge **via the database, not via code branching**.

- **Server**: .NET 10 Web API (ASP.NET Core) split into 4 projects — `domain`, `application`, `data`, `api` — plus `tests`. Solution: [server/TaskPlatform.slnx](../server/TaskPlatform.slnx).
- **Client**: Angular 19 standalone components + `@ngrx/signals` signal store. Strict TS.
- **DB**: SQL Server 2022 via EF Core, with three migrations checked in.
- **Local infra**: [docker-compose.yml](../docker-compose.yml) brings up sqlserver + api + client; [scripts/run.ps1](../scripts/run.ps1) is the developer entrypoint.
- **Extensibility model**: a task type is *one row in `TaskTypes`* + N rows in `StatusDefinitions` + M rows in `StatusFieldSpecs`. **Adding a task type requires no code changes** — only seed-data / DB insertions. The "Marketing" type wired behind `SeedExtraTypes=true` proves this end-to-end.

---

## 2. Layering & dependency direction

```
api  →  application  →  domain
                ↓
              data  →  (EF Core, SQL Server)
```

- `domain` knows nothing about EF, HTTP, or Angular — pure C#.
- `application` defines `IAppDbContext` (the DB seam) and orchestrates domain + workflow.
- `data` implements `AppDbContext`, EF configurations, `TaskTypeRegistry`, and seeders.
- `api` is the HTTP boundary: controllers, ProblemDetails-shaped DTOs, exception handlers.

**Note (verified by `.csproj` inspection):** `Data` project references `Application` in addition to `Domain`. This is intentional because `Data` implements `IAppDbContext` and `ITaskTypeRegistry` (both defined in `Application`). Pure Clean Architecture would put those interfaces in `Domain`; the current placement is a small, deliberate trade-off — see [decisions.md](decisions.md).

---

## 3. Backend

### Projects

- **[server/domain/](../server/domain/)** — entities + workflow value-objects + error types.
  - `TaskItem` (aggregate root), `TaskFieldValue`, `TaskAssignment`, `User`.
  - `TaskType`, `StatusDefinition`, `StatusFieldSpec`, `StatusFieldKind` (enum + lookup row), `ValidationResult`.
  - `WorkflowError` (discriminated record hierarchy).
- **[server/application/](../server/application/)** — orchestration + workflow engine.
  - `IAppDbContext` (the DB seam; controllers/services depend on this, not `AppDbContext`).
  - `TaskService` (single application service for every operation).
  - `WorkflowEngine` (pure rule enforcement: forward sequential, backward unrestricted, close at final, validate data via parser).
  - `ITaskTypeRegistry` (in-memory cache of task types loaded at startup).
  - `CustomDataParser` / `CustomDataWriter` (JSON ↔ `TaskFieldValue` rows; the parser is the **single place** that validates type-specific field data).
  - `WorkflowOutcome<T>` (Result-style return — success value or `WorkflowError`).
- **[server/data/](../server/data/)** — persistence.
  - `AppDbContext` (implements `IAppDbContext`).
  - `DatabaseSeeder` (users + task types + demo tasks).
  - `TaskTypeRegistry` (concrete cache; uses `IDbContextFactory<AppDbContext>` to load lazily from DB).
  - `Configurations/*.cs` — one EF `IEntityTypeConfiguration<T>` per entity, applied via `ApplyConfigurationsFromAssembly`.
  - `Migrations/` — 3 migrations: Init, FilterTaskFieldValueUniqueIndexOnLiveRowsOnly, RedesignStatusFieldKindAsLookupAndDropJsonValue.
- **[server/api/](../server/api/)** — HTTP boundary.
  - `Program.cs` — DI, EF setup, exception handler chain, ProblemDetails, OpenAPI/Scalar.
  - `controllers/TasksController.cs`, `TaskTypesController.cs`, `UsersController.cs`.
  - `contracts/` — request/response DTOs + `ResponseMapper`.
  - `exceptionhandlers/` — `ConcurrencyExceptionHandler` (409), `DbUpdateExceptionHandler`, `GlobalExceptionHandler` (catch-all); `WorkflowErrorMapper` converts `WorkflowError` → RFC 7807 ProblemDetails. ProblemDetails `Type` URI constants live in `ProblemTypes`.
  - `health/DatabaseHealthCheck.cs` — readiness probe.

### Service boundaries

- **Controllers** are thin: parse DTO → call `TaskService` → `WorkflowOutcome` → `ToActionResult(...)` extension.
- **`TaskService`** owns transaction boundaries (single `SaveChangesAsync` per request — no explicit transactions exist). Calls `WorkflowEngine`, persists via `IAppDbContext`, checks user existence, logs.
- **`WorkflowEngine`** is pure (no DB) — receives a loaded `TaskItem` + registry + custom data and returns a `WorkflowOutcome<TaskItem>`. Mutations happen on the entity in-memory; `TaskService` saves.
- **`CustomDataParser`** is the *only* place that validates per-status data shape — adding a new spec kind would touch only this file plus the lookup row.

### DI lifetimes

| Service | Lifetime | Notes |
| --- | --- | --- |
| `IDbContextFactory<AppDbContext>` | Singleton | Consumed by `TaskTypeRegistry`. |
| `AppDbContext`, `IAppDbContext` | Scoped | Per-request, built from the singleton factory. |
| `ITaskTypeRegistry`, `WorkflowEngine` | Singleton | Cached metadata + pure engine. |
| `TimeProvider` | Singleton | `TimeProvider.System`. |
| `TaskService`, `DatabaseSeeder` | Scoped | Per-request. |

The factory-then-scoped split is intentional: it lets a singleton consumer share the same EF config without forcing scoped lifetime on the registry. See [decisions.md ADR-05](decisions.md).

### Startup

1. `WebApplicationBuilder` wires services.
2. `app.Build()`.
3. Inside an async scope: `db.Database.MigrateAsync()` then `seeder.SeedAsync(includeMarketing: SeedExtraTypes)`.
4. `registry.EnsureLoadedAsync()` preloads task-type cache.
5. Map exception handler middleware, status code pages, OpenAPI/Scalar, health checks, controllers.

---

## 4. Workflow engine flow (status change example)

A `POST /api/tasks/{id}/status` request flows through:

1. **[TasksController.cs](../server/api/controllers/TasksController.cs)** — ASP.NET Core model-binds `ChangeStatusRequest` (Range data-annotations trim invalid ints at the boundary).
2. **`TaskService.ChangeStatusAsync`** — `LoadTrackedAsync(taskId)` loads the task **with `IgnoreQueryFilters()`** so the engine sees retained (soft-deleted) field-value rows; the `IsDeleted == null` filter is re-applied at the task level so soft-deleted tasks return 404.
3. Verifies next user exists.
4. **`WorkflowEngine.ChangeStatus`** (pure, no DB):
   - rejects if closed,
   - resolves current code from `CurrentStatusDefinitionId` via registry,
   - rule checks (no-movement, invalid-status, no-forward-skip, beyond-final, invalid-next-user),
   - `CustomDataParser.Parse` validates the per-status data,
   - on success calls `TaskItem.MoveTo(...)` which mutates the entity in place (handles backward soft-deletes + assignment hard-deletes).
5. **`TaskService`** calls `DetachStatusDefinitionNavigations(task)` (see [memory.md](memory.md) for why) and `SaveChangesAsync`. `RowVersion` enforces optimistic concurrency.
6. **`ResponseMapper.ToDetail(task, registry)`** projects the entity to `TaskDetail`, computing `RetiredStatuses` from soft-deleted field values.
7. Response back to client.
8. **`TasksStore.runMutation`** patches the list + `detailById`.

---

## 5. Database

All tables live in the `dbo` schema. Configurations are in [server/data/persistence/configurations/](../server/data/persistence/configurations/).

### Tables

- **`Users`** — IDENTITY PK. Columns: `Id`, `FullName`. Seeded with 5 demo users (Alice/Bob/Carol/David/Eve).

- **`TaskTypes`** — PK `Id` (manually pinned, `ValueGeneratedNever`). Columns: `Id`, `Name` (unique). Seeded ids: 1=Procurement, 2=Development, 3=Marketing (when `SeedExtraTypes=true`).

- **`StatusDefinitions`** — PK `Id` (pinned). FK `TaskTypeId`. Columns: `Code`, `Name`, `Position`, `IsFinal`. Unique indexes on `(TaskTypeId, Code)` and `(TaskTypeId, Position)`. Seeded ids 1..10.

- **`StatusFieldKinds`** — lookup table, PK pinned. Rows: (1, "String"), (2, "Number"). FK target for `StatusFieldSpecs.KindId`.

- **`StatusFieldSpecs`** — PK `Id` (pinned). FK `StatusDefinitionId`, FK `KindId`. Columns: `Name`, `KindId`, `ItemCount` (≥1; 1 = scalar, >1 = fixed-length array), `Min`/`Max` (nullable; length bounds for String, value bounds for Number), `Position`. Unique on `(StatusDefinitionId, Name)` and `(StatusDefinitionId, Position)`. Every spec is required.

- **`TaskItems`** — IDENTITY PK + `RowVersion` (rowversion / optimistic concurrency). FKs: `TaskTypeId`, `CurrentStatusDefinitionId`, `CurrentAssignedUserId`. Columns: `IsClosed`, `CreatedAtUtc`, `UpdatedAtUtc`, `IsDeleted` (nullable bool, soft-delete marker; null = live). Indexes on `CurrentAssignedUserId`, `(CurrentAssignedUserId, IsClosed)`, `TaskTypeId`. Global query filter hides rows where `IsDeleted != null`.

- **`TaskFieldValues`** — IDENTITY PK. FK `TaskId` (cascade), FK `StatusFieldSpecId` (restrict). Columns: `ItemIndex` (1..ItemCount), `StringValue` (nullable), `NumberValue` (decimal(18,2), nullable), `IsDeleted` (nullable; soft-delete marker for backward-move retirement). **Filtered unique index** on `(TaskId, StatusFieldSpecId, ItemIndex) WHERE IsDeleted IS NULL` — guarantees at most one live row per spec+item per task; retired rows coexist. Global query filter on `IsDeleted == null`.

- **`TaskAssignments`** — composite PK `(TaskId, StatusDefinitionId)`. FK `AssignedUserId` (restrict), FK `StatusDefinitionId` (restrict). Columns: `AssignedAtUtc`. **No soft-delete column** — backward moves hard-delete rows above the new target; they get recreated on forward re-entry.

### Relationships

- `TaskItem 1 — * TaskFieldValue` (cascade), `TaskItem 1 — * TaskAssignment` (cascade).
- `StatusDefinition 1 — * StatusFieldSpec` (via owned navigation in domain, FK in DB).
- `TaskType 1 — * StatusDefinition` (restrict).
- `TaskItem → User` (current assignee), `TaskItem → StatusDefinition` (current status), `TaskAssignment → User`, `TaskAssignment → StatusDefinition` — all restrict-on-delete.

### Custom-field storage design (the graded decision)

**Chosen approach**: a separate `TaskFieldValues` table with a `StatusFieldSpecId` FK to a metadata-driven `StatusFieldSpecs` table, plus an `ItemIndex` discriminator for multi-value specs and a (`StringValue`, `NumberValue`) value-per-kind column pair.

Why not JSON / per-type tables / EAV:

- **JSON blob** is opaque to indexes, breaks type validation at write time.
- **Per-type tables** require code changes to add a new type — violates the assignment's primary axis.
- This approach is **purely data-driven** + keeps DB-level integrity (FK to spec, FK to kind, filtered unique index).

See [decisions.md ADR-01](decisions.md) for the full trade-off.

---

## 6. API surface

| Method | Route | Notes |
| --- | --- | --- |
| `GET` | `/api/tasks?userId&taskTypeId&isClosed` | List, slim `TaskListItem[]`. |
| `GET` | `/api/tasks/{id}` | Full `TaskDetail` with `customDataByStatus`, `assigneeByStatus`, `retiredStatuses`. |
| `POST` | `/api/tasks` | Create. Body: `{ taskTypeId, initialAssignedUserId }`. 201 + `TaskDetail`. |
| `POST` | `/api/tasks/{id}/status` | Change status. Body: `{ newStatus, nextAssignedUserId, customData }`. |
| `POST` | `/api/tasks/{id}/steps` | **Beyond the assignment scope**: in-place edit of the current or a prior status's data + assignee, without moving the task. Forward statuses rejected. |
| `POST` | `/api/tasks/{id}/close` | Close. Final-status-only. |
| `GET` | `/api/task-types` | All registered task types + statuses + field specs. |
| `GET` | `/api/users` | Seeded users, ordered by name. |
| `GET` | `/health`, `/health/live`, `/health/ready` | Liveness / readiness. |

Handlers: [TasksController.cs](../server/api/controllers/TasksController.cs), [TaskTypesController.cs](../server/api/controllers/TaskTypesController.cs), [UsersController.cs](../server/api/controllers/UsersController.cs).

### Error contract

- All workflow violations → RFC 7807 ProblemDetails with `rule` extension (kebab-case, mirrored on the client as `WorkflowRule`).
- 400: validation / invalid status / invalid next user / unknown task type / unknown user.
- 404: task not found.
- 409: closed-immutable, already-closed, no-forward-skip, beyond-final, not-at-final, concurrent-modification.
- 422: `invalid-data` with per-field `errors` dictionary.
- 500: unhandled (logged with `traceId` and `instance`).

---

## 7. Frontend

### Stack

- Angular 19 standalone components, **OnPush change detection everywhere**.
- `@ngrx/signals` (`signalStore`) for app state — single store `TasksStore` providedIn: 'root'.
- Reactive Forms (typed via `NonNullableFormBuilder`); strict TS, no `any` in surfaces.
- Routing: standalone routes with `withComponentInputBinding()`; modals are child routes mounted via `<router-outlet>` with `skipLocationChange: true`.
- Vitest for unit tests.

### Folder structure ([client/src/app/](../client/src/app/))

| Folder | Purpose |
| --- | --- |
| `core/api/` | HTTP service wrappers (`TaskApi`, `TaskTypesApi`, `UsersApi`). Only place `HttpClient` is touched. |
| `core/http/` | `retryTransient` operator for idempotent GETs. |
| `core/interceptors/` | `correlationId`, `logging`, `error`. Run in that order. |
| `core/logging/` | `FrontendLoggerService`. |
| `core/models/` | TypeScript shapes mirroring the API contracts. |
| `core/pipes/` | `HumanizeLabelPipe`. |
| `core/services/` | Cross-cutting: `ToastService`, `GlobalErrorHandler`, `UserPreferencesService`. |
| `core/ui/` | Reusable presentational components (badge, card, modal, status-stepper, type-picker, etc.). No store dependencies. |
| `core/utils/` | Pure helpers (deep-equal, relative-time, store-error-toast binding). |
| `core/validators/` | `FieldValidators`, `TaskFormBuilder`, `WorkflowValidators` (mirrors backend workflow rules for client UX). |
| `features/dynamic-form/` | The generic data-driven form: walks `FieldSpecMetadata[]` and renders inputs / FormArrays. |
| `features/shell/top-bar/` | App chrome. |
| `features/tasks/task-list/` | The main list page (table + filters + tabs). Hosts modal child routes via outlet. |
| `features/tasks/create-task/` | "New task" modal (child route `tasks/new`). |
| `features/tasks/change-status/` | Change-status modal (child route `tasks/:id/change-status`). |
| `state/` | `TasksStore` (signal store) + `BootstrapService`. |

### State management

- **Single `TasksStore`** holds: tasks list, taskTypes metadata, users, filter signals (currentUserId, typeFilter, stateFilter), detail cache (`detailById`), in-flight detail loaders (`detailLoadingIds`), `loading`, `error`.
- The store fires a filtered `GET /api/tasks` whenever `userId` or `taskTypeId` changes — but **NOT** for `stateFilter` (open/closed/all is a pure view concern).
- `fetchListLatest` uses a monotonic sequence number to drop stale responses when filters change rapidly.
- Mutations (`create`, `changeStatus`, `close`, `updateStep`) go through a single `runMutation` helper that patches both the list and `detailById`, with optional 409-recovery + toast on failure.
- `loadDetail(id)` is lazy + deduped — the change-status modal triggers it on mount.

### Bootstrap flow

1. `provideAppInitializer` runs `BootstrapService.bootstrapApp()`.
2. Loads `taskTypes` + `users` in parallel.
3. Resolves the initial `currentUserId` from `UserPreferencesService` (localStorage); defaults to "All Users".
4. Fires initial `GET /api/tasks`.

### Forms

`TaskFormBuilder` builds a `FormGroup` from `FieldSpecMetadata[]`:

- `ItemCount == 1` → scalar `FormControl`.
- `ItemCount > 1` → `FormArray` of N controls (fixed length; no add/remove UI).
- `Kind = String` → `FormControl<string>` with non-empty + min/max length validators.
- `Kind = Number` → `FormControl<number | null>` (nullable!) with finite + numeric min/max validators.

Client validators are **UX hints**; the server is authoritative.

---

## 8. Cross-cutting

### Exception handler chain (order matters)

1. **`ConcurrencyExceptionHandler`** — catches `DbUpdateConcurrencyException` (RowVersion conflicts), returns 409.
2. **`DbUpdateExceptionHandler`** — catches `DbUpdateException` (FK violations, constraint fails), returns 400.
3. **`GlobalExceptionHandler`** — catch-all; logs unhandled exceptions; treats `OperationCanceledException` from client abort as Debug.

### Error mapping

`WorkflowErrorMapper.Classify` is a `switch` over the `WorkflowError` discriminated union; the `_` arm throws to make missing arms loud when a new error type is added.

### ProblemDetails `Type` URIs

Centralized in `ProblemTypes` (`Workflow` / `Validation` / `NotFound` / `Internal`).

### Health check

[DatabaseHealthCheck](../server/api/health/DatabaseHealthCheck.cs) uses `IDbContextFactory` (safe from Singleton); tagged "ready" so `/health/ready` returns 503 when SQL is down.

### Correlation IDs

`X-Correlation-Id` flows from client → server logs via the correlation interceptor; surfaced back on `ApiError.correlationId` so users can hand a reference id to support.

### Error contract on the client

- `errorInterceptor` maps every `HttpErrorResponse` → typed `ApiError` (`kind`, `status`, `message`, optional `rule`, `fieldErrors`, `traceId`, `correlationId`).
- Stores / components only ever see `ApiError`, never `HttpErrorResponse`.
- 409 with `rule: concurrent-modification` triggers automatic list refetch and a "Out of sync" toast.
- 422 with `fieldErrors` is projected onto the matching dynamic-form controls as `{ server: messages }`.

---

## 9. Extensibility seam

**The three-table data contract**:

```
TaskTypes          (id, name)
StatusDefinitions  (id, taskTypeId, code, name, position, isFinal)
StatusFieldSpecs   (id, statusDefinitionId, name, kindId, itemCount, min, max, position)
```

These three tables, plus the `StatusFieldKinds` lookup, *are* the universe of task-type metadata. The generic core (`WorkflowEngine`, `CustomDataParser`, `TaskService`, controllers, the Angular `DynamicFormComponent`) reads from this metadata and does not know the name of any specific task type.

**Adding a new task type** requires:

1. Insert a `TaskType` row.
2. Insert `StatusDefinition` rows (ordered by `Position`, one with `IsFinal=true`).
3. Insert `StatusFieldSpec` rows per status (FK to a `StatusFieldKindRow`).
4. Restart the API (the registry preloads at startup and never refreshes — see [risks.md](risks.md)).

A working proof point ships in the repo: the **Marketing** type, gated behind the `SeedExtraTypes` environment variable in [docker-compose.yml](../docker-compose.yml). Flip it to `"true"`, re-run `./scripts/run.ps1`, and the new type appears end-to-end — DB, API, and UI — with no other change anywhere in the codebase.

The Angular client's `DynamicFormComponent` walks `FieldSpecMetadata[]` from `GET /api/task-types` and renders FormControl/FormArray inputs automatically — zero TS edit required for the new type.

If a new `StatusFieldKind` is needed (e.g., Date, Bool):

- Add an enum arm to `StatusFieldKind`.
- Add a `case StatusFieldKind.Date:` handler in `CustomDataParser`.
- Add a lookup row to `StatusFieldKinds`.
- Insert field specs with that kind.

That's the only code change. No controller / service / type module is touched.
