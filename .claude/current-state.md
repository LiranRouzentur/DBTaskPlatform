# Current State

> What's runnable, what's seeded, what's working today. Read this at the start of a new session before assuming anything about the environment.

---

## 1. Build & run

The single entry point is [scripts/run.ps1](../scripts/run.ps1). On a clean machine with Docker Desktop, .NET 10 SDK, and Node 20.11+/22+ installed, running it produces a fully-working stack in under a few minutes. See the [README §2](../README.md) for the step-by-step.

**Containers running after a successful spin-up** (`docker compose -p taskplatform ps` confirms):

| Container | Image | Port |
| --- | --- | --- |
| `taskplatform-sqlserver` | `mcr.microsoft.com/mssql/server:2022-latest` | 1433 |
| `taskplatform-api` | locally built from [server/api/Dockerfile](../server/api/Dockerfile) | 5028 → 8080 |
| `taskplatform-client` | locally built from [client/Dockerfile](../client/Dockerfile) (Nginx + production Angular bundle) | 4200 → 80 |

**Live URLs:**

| URL | What it serves |
| --- | --- |
| `http://localhost:4200` | Angular SPA |
| `http://localhost:5028` | API root |
| `http://localhost:5028/health` | Liveness probe (200 = ready) |
| `http://localhost:5028/health/ready` | Readiness probe (503 if SQL is down) |
| `http://localhost:5028/scalar/v1` | Scalar interactive API docs |
| `http://localhost:5028/openapi/v1.json` | Raw OpenAPI document |
| `localhost:1433` | SQL Server — creds in committed [.env](../.env) |

---

## 2. Seed data on a fresh DB

`DatabaseSeeder.SeedAsync` runs after `db.Database.MigrateAsync()` on every API startup and is idempotent.

**5 demo users** (with stable seeded ids):

| Id | Name |
| --- | --- |
| 1 | Alice Cooper |
| 2 | Bob Newman |
| 3 | Carol Reyes |
| 4 | David Park |
| 5 | Eve Larsen |

**Task types** (default — `SeedExtraTypes=false`):

- `1 = Procurement` with statuses Created → Supplier offers received → Purchase completed (final).
- `2 = Development` with statuses Created → Specification completed → Development completed → Distribution completed (final).

**With `SeedExtraTypes=true`** (toggle in [docker-compose.yml](../docker-compose.yml)):

- `3 = Marketing` with statuses Brief created → Campaign approved → Campaign launched (final), demonstrating multi-value String specs + a Number kind for `budget`.

**Demo tasks**: a fixed distribution across statuses (e.g. 9 Procurement tasks spread across statuses 1/2/3 with 2 closed, 11 Development tasks across statuses 1/2/3/4 with 1 closed, plus 3 Marketing tasks when the flag is on). The set is small enough to see every workflow state on first load and large enough to exercise the filters.

---

## 3. Test status

Single entry point: [scripts/test.ps1](../scripts/test.ps1). Console-only output; non-zero exit on any failure.

| Suite | Runner | Count (last known) | Location |
| --- | --- | --- | --- |
| Backend | xUnit + real LocalDB-style integration (no mocking of EF/SQL) | 82 passed | [server/tests/](../server/tests/) |
| Frontend | Vitest + jsdom | 20 passed | [client/src/](../client/src/) under `**/*.spec.ts` |

**Encoding note**: vitest emits UTF-8 glyphs (`✓` / `×`) that PowerShell would otherwise read as legacy OEM (`Γ£ô`). [scripts/test.ps1](../scripts/test.ps1) sets `[Console]::OutputEncoding = UTF8` at the top so the per-test parser matches correctly. Don't remove those two lines.

---

## 4. Feature completeness

| Capability | Status | Implemented at |
| --- | --- | --- |
| Create Task | ✅ | `POST /api/tasks` + create-task modal |
| Change Status (forward / backward) | ✅ | `POST /api/tasks/{id}/status` + change-status modal |
| Close Task (final-status only) | ✅ | `POST /api/tasks/{id}/close` + close confirm dialog |
| Get User Tasks | ✅ | `GET /api/tasks?userId=X` + user picker |
| Custom data per status (type-specific) | ✅ | `CustomDataParser` + `DynamicFormComponent` |
| Closed-task immutability (domain-enforced) | ✅ | `WorkflowEngine` rejects mutations; covered by tests |
| Forward-skip rejection | ✅ | `WorkflowEngine.ChangeStatus`; client gates too |
| Per-status assignment history | ✅ | `TaskAssignments` table + `assigneeByStatus` in TaskDetail |
| Field-value history with restore-on-forward | ✅ | Soft-delete + filtered unique index (ADR-02) |
| **Extras beyond the brief**: | | |
| `/api/tasks/{id}/steps` in-place edit | ✅ | Edits one status's data + assignee without moving the task |
| Marketing type via `SeedExtraTypes=true` flag | ✅ | Proves data-driven extensibility end-to-end |
| Retired-statuses surface | ✅ | `retiredStatuses` in TaskDetail; client renders "previously captured" |
| 409 concurrent-modification auto-recovery | ✅ | RowVersion + `TasksStore.runMutation` refetch path |

The four required operations work end-to-end through the UI without reading code, per [assignment.md §2.1](assignment.md).

---

## 5. Known runtime quirks

- **Registry never refreshes.** A new task type inserted while the API is running won't be visible until the next restart. See [risks.md R-01](risks.md).
- **No real auth.** The user picker persists a selection in localStorage; if localStorage is disabled the picker silently no-ops and the list defaults to "All Users".
- **No real-time updates.** Two concurrent users editing the same task hit 409 on save; the loser auto-refetches and gets a toast. Otherwise list views are not pushed.
- **OpenAPI/Scalar always on.** Today there's no production environment, so both are reachable without gating. See [decisions.md ADR-11](decisions.md).

---

## 6. Stopping & cleaning up

```powershell
# Stop containers, keep the DB volume:
docker compose -p taskplatform down

# Stop and wipe the DB volume (next run.ps1 reseeds from scratch):
docker compose -p taskplatform down -v
```

`run.ps1` itself starts with a `down -v --rmi local --remove-orphans` and a `bin/obj/dist/.angular` wipe — re-running it always gives a fresh environment.
