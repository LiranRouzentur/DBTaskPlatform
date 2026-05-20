# Requirements — Derived Contract

> The *derived* contract: design rules, validation checklists, must-not-break invariants, and deliverables. Answers "does my change comply?". For the verbatim assignment see [assignment.md](assignment.md).

---

## 1. Backend expectations

- **Generic task handling.** No `switch (task.Type)` ladders or `if (type == "Procurement")` chains in services/controllers. Logic that varies by task type belongs **inside** a task-type abstraction (strategy / handler / registry pattern), not at call sites.
- **Workflow rules** ([assignment.md §3](assignment.md)) live in the generic core, not in any task-type-specific class.
- **Task-type-specific rules** (status definitions, required data per status, final status, validation of those fields) live entirely within that task type's module.
- **Separation of concerns**: controllers → application/service layer → domain → data access. No EF Core types leaking into controllers; no HTTP concerns in domain.
- **Thoughtful data access**. N+1s, over-fetching, and ad-hoc SQL are avoided. EF Core is used idiomatically (projections, `AsNoTracking` for reads, explicit includes).
- **DI** is used for all cross-class collaboration. No `new` of services or `DbContext` outside the composition root.
- **REST** endpoints, plural resources.
- **EF Core migrations** are checked in and produce a usable schema from a clean DB.
- **Seed data**: a few users inserted via migration / seeder so the app is usable immediately.

### Extensibility test (the grading bar)

> "How would you add a third task type without touching existing code?"

A reviewer should be able to:

1. Add one new class / file (or DB seed entry) describing the new type (its statuses, required data, final status, validators).
2. Register it (ideally via DI scanning or a single registration line — in this codebase, a DB row insert).
3. Have the API and DB handle it end-to-end — **no edits to controllers, generic services, or other task types**.

Anything that fails this thought experiment is a design defect.

---

## 2. Frontend expectations

- **Angular strict TS.** No `any` unless truly unavoidable.
- **Services** wrap HTTP; components do not call `HttpClient` directly.
- **Reactive patterns** (Observables / signals) for state and async; no manual subscription leaks.
- **Component architecture**:
  - Small, focused components.
  - Templates stay clean — heavy logic moves to the component class or service.
  - Container/presentational split where it adds clarity.
- **Forms**: type-safe reactive forms; type-specific data inputs are driven by the task type's metadata so a new task type does not require an Angular code edit beyond registration of its form descriptor (mirroring the backend extensibility model).
- **Minimal styling.** Clarity matters.
- **Required user flows**: create a task, advance/reverse status (providing type-specific data when required), close a task at final status, view the current user's tasks.

---

## 3. Database expectations

- **MSSQL** via EF Core.
- **EF Core Migrations** are the schema source of truth. Initial migration creates schema + seeds users.
- **Custom field storage is a deliberate design choice.** Options to consider:
  - JSON column on a single `Tasks` table.
  - Per-type tables.
  - Owned/Complex types or TPT/TPH inheritance.
  - Separate metadata-keyed table.
- Whatever storage is chosen must:
  - Preserve **immutability of closed tasks** at the DB / repository level (not just in UI).
  - Allow **history of status transitions** to be reconstructed if needed.
  - Permit efficient **"tasks assigned to user X"** queries.

The implementation choice for this repo is documented in [architecture.md §5](architecture.md) and decided in [decisions.md ADR-01 / ADR-02](decisions.md).

---

## 4. API expectations

- RESTful, JSON.
- Validation errors return HTTP 4xx with a clear error body — both general workflow violations (e.g. status skip, mutating a closed task) and type-specific data violations (e.g. missing receipt string when moving Procurement to status 3).
- 200/201 for success with the updated task representation.
- Endpoints accept **target status + payload** for transitions; the server, not the client, decides whether that move is forward/backward and validates accordingly.

---

## 5. Business / validation rules (consolidated)

### Generic (enforced for every task type)

- Reject status change on a **closed** task.
- Reject **forward skips** (target > current + 1).
- **Backward moves** to any status `≥ 1` are allowed while open.
- Status change request **must include the next assigned user**.
- A task **must always have exactly one assigned user**.
- **Close** is only valid when current status == task type's final status.

### Type-specific (supplied by the task type module, not hard-coded in the core)

- Procurement → status 2: require **two non-empty price-quote strings**.
- Procurement → status 3: require a **non-empty receipt string**.
- Development → status 2: require **non-empty specification text**.
- Development → status 3: require a **non-empty branch name**.
- Development → status 4: require a **non-empty version number**.

### Edge cases (must be handled coherently)

- Moving **backward** does not require re-supplying type-specific data (data already captured for prior statuses remains valid).
- Moving **forward again** after going backward must re-validate the type-specific data for the new target status.

---

## 6. Architecture constraints

- **No `switch (taskType)` / `if (type == ...)`** in generic code paths (controllers, generic services, workflow engine). Type-specific behavior must dispatch via polymorphism or a registry.
- **Workflow rules are not duplicated per task type.**
- **Closed tasks are immutable** — enforced in the domain, not only in the UI.
- **Strict TS on the client** stays on; no loosening to ship.
- **Built-in DI containers only** (ASP.NET Core DI on the server; Angular DI on the client). No third-party DI frameworks unless justified.

---

## 7. Coding conventions

- C# `PascalCase` for types/members; `camelCase` for locals/params; `_camelCase` for private fields.
- Async APIs are async all the way down; `Async` suffix on async methods.
- TypeScript `camelCase` for variables/methods, `PascalCase` for classes/interfaces/types.
- One feature per folder (server: feature folders or vertical slices encouraged; client: feature modules / lazy-loaded routes encouraged when justified).
- REST resource naming is plural (`/tasks`, `/users`).
- Errors returned as RFC 7807 ProblemDetails with a `rule` extension (kebab-case key).

---

## 8. Current working assumptions

These are inferences not explicitly stated in the assignment. Mark and revisit if they prove wrong.

- **History of transitions** should be retrievable, even if no endpoint exposes it yet.
- **Assignment** is just the user ID stored on the task; no notification system required.
- **Authentication / authorization** is **out of scope** (hard-coded user ID is explicitly accepted).
- **Multi-tenant / multi-organization** concerns are out of scope.
- **Backward move data semantics**: when stepping back then forward, the previously captured data for that status can be reused (no need to force re-entry), but moving forward to a status whose data has never been captured must require the data.
- **A "final status"** for a task type is well-defined and unique per type (the largest integer in its status list).

---

## 9. Must-Not-Break Behaviors

These behaviors are **load-bearing** and may not regress. Each one corresponds to at least one test under [server/tests/](../server/tests/) or [client/src/.../*.spec.ts](../client/src/) — see [review-checklist.md](review-checklist.md) for the test mapping.

1. Closed task → any write attempt → rejected.
2. Forward skip → rejected with a clear error.
3. Backward move on open task → allowed unconditionally.
4. Status change without `nextAssignedUser` → rejected.
5. Status change missing required type-specific data → rejected with a per-field error.
6. Close from non-final status → rejected.
7. A new task type can be added by **adding DB rows + restarting** (or one seed-data edit) — **no edits to controllers, the workflow engine, or other task types' modules**.
8. Strict-mode TypeScript compilation passes.
9. EF Core migrations run cleanly on an empty DB and seed users.
10. `GET /api/tasks?userId=X` returns only tasks currently assigned to user X.

---

## 10. Refactor safety constraints

When future changes are made, the following invariants protect the design:

- **Adding a task type** must remain a data-only change (or a single-folder code change). If a change to existing files is required to add a new type, the design has drifted and must be corrected, not papered over.
- **Workflow rule changes** (e.g. adding a new generic rule) should be a single edit in the generic core, not N edits across N task types.
- **Validation logic** for type-specific data must remain inside the task-type module (or in the metadata-driven `CustomDataParser` switch on `StatusFieldKind`) — never in the controller or in a shared validator that knows about all types by name.
- **DB schema for custom fields** can be migrated, but the chosen design should not require API breaking changes.
- **No untyped escape hatches** (`dynamic`, `object`, `any`, `JsonElement` floating across layers) sneaking in to "make extensibility easier" — extensibility comes from polymorphism + metadata, not from erasing types.
- **Tests** for the generic workflow engine must not reference specific task types; tests for a specific task type must not reach into the generic engine's internals.

---

## 11. Deliverables checklist

- [x] Backend source (.NET Web API + EF Core + MSSQL).
- [x] Frontend source (Angular, strict TS).
- [x] EF Core migrations with **seeded demo users**.
- [x] README with:
  - [x] Setup instructions for **server**.
  - [x] Setup instructions for **client**.
  - [x] Brief **extensibility explanation**: how a new task type is added.
- [x] All four required operations working end-to-end (create / change status / close / get user tasks).
- [x] Both example task types (Procurement, Development) implemented as data/strategy, not as hardcoded branches.
