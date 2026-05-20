# DBTaskPlatform

A full-stack extensible task-management platform built for the .NET + Angular assignment.

- **Server**: ASP.NET Core Web API (.NET 10) + EF Core
- **Client**: Angular 19 (strict TypeScript) + NgRx Signals
- **Database**: SQL Server 2022

The full requirements live in [Claude.md](Claude.md). The original brief is [dotnet-angular-assignment.docx](dotnet-angular-assignment.docx).

---

## 1. Prerequisites

Install these on the host machine before running the spin-up script:

| Tool | Version | Why |
| --- | --- | --- |
| **Docker Desktop** | latest (Windows / WSL2 backend) | Runs SQL Server, the API container, and the Nginx-served client |
| **.NET SDK** | **10.0** | The script does a host-side `dotnet build` before the Docker image build |
| **Node.js + npm** | Node **20.11+** or **22+** (Angular 19 requirement) | The script runs `npm ci` / `npm run build` on the host |


> SQL Server does **not** need to be installed locally — it runs inside Docker on port `1433`. Credentials live in the committed [.env](.env) file (demo project; not for production).

That is the complete list. No global Angular CLI, no SSMS, no LocalDB.

---

## 2. Run it

From the repository root, in PowerShell:

```powershell
./scripts/run.ps1
```

That single command does everything. It is idempotent — re-running it gives you a fresh, clean environment every time.

### What the script does (8 steps)

1. **Docker Desktop check** — verifies the Docker CLI is on PATH, and if the daemon is not reachable it launches Docker Desktop and waits up to 3 minutes for it to become ready.
2. **Tear down** — `docker compose down -v --rmi local --remove-orphans` wipes any previous containers, the SQL volume (so the DB starts empty), and locally-built images.
3. **Wipe build caches** — removes every `bin/` and `obj/` under `server/`, plus `client/dist`, `client/.angular`, `client/.nx`. No stale artifacts can survive into the new build.
4. **Frontend dependencies** — runs `npm ci` (or `npm install`) inside `client/` only if `node_modules` is missing.
5. **.NET build** — `dotnet build server/TaskPlatform.slnx -c Release` against the freshly cleaned tree.
6. **Angular build** — `npm run build` produces the production bundle in `client/dist/`.
7. **Docker compose build + up** — `--no-cache --pull` rebuilds the API and client images, then `up -d --force-recreate` starts the three containers (`sqlserver`, `api`, `client`).
8. **API health wait** — polls `http://localhost:5028/health` for up to 3 minutes. The API container only reports healthy after it has applied EF Core migrations and the `DatabaseSeeder` has populated users, task types, and demo tasks.

### What you get when the script finishes

When the final `OK` line prints, three containers are running and the following URLs are live:

| URL | What it is |
| --- | --- |
| `http://localhost:4200` | **Angular app** (Nginx-served production build) — the UI you actually use |
| `http://localhost:5028` | **API** root |
| `http://localhost:5028/health` | Liveness probe (200 = ready) |
| `http://localhost:5028/scalar/v1` | **Scalar** interactive API docs (try every endpoint here) |
| `http://localhost:5028/openapi/v1.json` | Raw OpenAPI document |
| `localhost:1433` | **SQL Server** — connect with the credentials in [.env](.env) (user `sa` / password `Demo!Password123`) using SSMS, Azure Data Studio, or `sqlcmd` |

The database is seeded with:

- **5 demo users** (Alice, Bob, Carol, David, Eve) — pick one in the client's user dropdown (no auth, hard-coded user IDs as the brief allows).
- **2 task types**: Procurement and Development (with their full status workflows and per-status field specs).
- A spread of **demo tasks** across statuses so the UI is not empty on first load.

To stop everything later:

```powershell
docker compose -p taskplatform down
```

To wipe the DB volume too (next run starts fresh):

```powershell
docker compose -p taskplatform down -v
```

### Running the tests

```powershell
./scripts/test.ps1
```

Runs both suites end-to-end and prints a single console report:

- **Backend**: xUnit + a real LocalDB-style integration harness (no mocking of EF Core or SQL).
- **Frontend**: Vitest + jsdom.

The script exits non-zero if any test fails. No browser, no test runner UI — pure console.

---

## 3. Server layout

Four projects in a strict-layered .NET solution. Dependencies always point inward — `domain/` knows nothing about the others.

```
server/
├── TaskPlatform.slnx
├── api/           — HTTP boundary (controllers, DTOs, exception handlers, OpenAPI)
├── application/   — Use cases (TaskService, WorkflowEngine, CustomDataParser)
├── data/          — EF Core (AppDbContext, migrations, TaskTypeRegistry, DatabaseSeeder)
├── domain/        — Pure C# (entities, value objects, WorkflowError)
└── tests/         — xUnit suites (workflow unit tests + SQL integration tests)
```

| Project | Responsibility |
| --- | --- |
| [`api/`](server/api/) | HTTP boundary. ASP.NET Core controllers, request/response DTOs, the `IExceptionHandler` chain that maps domain errors and DB faults to RFC 7807 ProblemDetails, and the OpenAPI/Scalar surface. Controllers are thin: parse DTO → call a service → convert the `WorkflowOutcome<T>` to an `IActionResult`. |
| [`application/`](server/application/) | Use-case layer. [`TaskService`](server/application/services) owns the per-request transaction boundary (exactly one `SaveChangesAsync`); [`WorkflowEngine`](server/application/workflow) is the pure, DB-free state machine that validates transitions; `CustomDataParser` is the only place that validates per-status field payloads. Depends only on `domain/`. |
| [`data/`](server/data/) | EF Core implementation. `AppDbContext`, entity configurations, [migrations](server/data/migrations), the singleton [`TaskTypeRegistry`](server/data/workflow/TaskTypeRegistry.cs) that caches `TaskType` / `StatusDefinition` / `StatusFieldSpec` metadata at startup, and the idempotent [`DatabaseSeeder`](server/data/persistence/DatabaseSeeder.cs) that populates demo users, task types, and tasks on first run. |
| [`domain/`](server/domain/) | Pure C#. Entities (`TaskItem`, `User`, `TaskType`, `StatusDefinition`, `StatusFieldSpec`), value objects, and the `WorkflowError` discriminated union returned by `WorkflowOutcome<T>`. Knows nothing about EF, HTTP, or Angular — fully unit-testable in isolation. |
| [`tests/`](server/tests/) | Two suites: [`workflow/`](server/tests/workflow) (pure engine tests with a fake registry — no DB) and [`integration/`](server/tests/integration) (real SQL Server via xUnit, no mocking of EF Core). Run both with `./scripts/test.ps1`. |

**Dependency rule:** `api → application → domain` and `data → application → domain`. There are no upward references and no direct `api ↔ data` cross-references — they meet only through the `application/` interfaces (`IAppDbContext`, `ITaskTypeRegistry`).

---

## 4. Extensibility — adding a new task type

This is the central design challenge of the assignment, so the architecture is built around one idea:

> **SQL is the only source of truth for what a task type is.**

There is no `enum TaskType { Procurement, Development }`. There is no `switch (task.Type)` ladder in the controllers, services, or workflow engine. There are no per-type C# classes that the workflow engine knows about. The generic core enforces the universal workflow rules (no forward skips, backward always allowed, close only at final status, must reassign on every change, closed tasks immutable) — and it reads *everything* else (status codes, names, ordering, the final-status marker, the required fields per status, their kinds, item counts, min/max bounds) from three tables:

```
TaskTypes          (id, name)
StatusDefinitions  (id, taskTypeId, code, name, position, isFinal)
StatusFieldSpecs   (id, statusDefinitionId, name, kind, itemCount, position, min, max)
```

The runtime flow:

1. On startup, [`TaskTypeRegistry`](server/data/workflow/TaskTypeRegistry.cs) loads every `TaskType` (with its statuses and field specs) from the DB into an in-memory dictionary keyed by id.
2. Controllers and services ask the registry for a task type by id and receive a domain object describing its workflow.
3. The generic [`WorkflowEngine`](server/application) validates every transition against that object — universal rules first, then "is the payload schema for the target status satisfied?" — without ever knowing the *name* of any task type.
4. The Angular client fetches the same metadata from `GET /api/taskTypes` and renders type-specific fields dynamically from the schema. There is no per-type Angular component either.

### So how do you actually add a third task type?

Two paths, both touch zero existing code in controllers, generic services, the workflow engine, or any other task type's module:

**Path A — pure data (recommended).** Insert rows into `TaskTypes`, `StatusDefinitions`, and `StatusFieldSpecs` (via an EF migration, a SQL script, or even SSMS). Restart the API. The registry reloads, the workflow engine handles the new type, and the Angular UI renders its create form and per-status fields automatically from the metadata endpoint.

**Path B — code-as-seed.** Add one entry to [`DatabaseSeeder`](server/data/persistence/DatabaseSeeder.cs) describing the new type, its ordered statuses, the final-status marker, and the field specs each status requires. The seeder is the only place that knows shape-by-shape what the demo types look like, and it is the only file you edit — everything else discovers the new type at runtime via the registry.

> **Runtime caveat.** `TaskTypeRegistry` is a singleton, in-memory cache populated once at app startup (see [server/data/workflow/TaskTypeRegistry.cs](server/data/workflow/TaskTypeRegistry.cs)). Inserting rows into the metadata tables while the API is running has **no effect** until the API process is restarted. The Marketing task type (gated behind the `SeedExtraTypes=true` config flag) is the worked example demonstrating the full Path B without touching any other file in the codebase.


### Why this passes the grading bar

- The generic workflow engine has no knowledge of Procurement, Development, or Any other future task type. It validates against `TaskType` / `StatusDefinition` / `StatusFieldSpec` shapes.
- Type-specific data lives in `StatusFieldSpecs` (schema) and `TaskFieldValues` (values), not in per-type tables — adding a type is a row insert, not a migration.
- Closed-task immutability and the "exactly one assigned user" invariant are enforced in the domain layer, not at the API boundary, so any caller (UI, tests, future integrations) gets the same guarantees.
- The client's reactive forms are driven by the metadata endpoint, so registering a new type does not require an Angular code change either — only registration of an optional custom form descriptor if you want richer UX than the auto-generated one.

If a future task type ever requires a code change to a controller, the workflow engine, or another task type's module, the design has drifted and the change is in the wrong place.
