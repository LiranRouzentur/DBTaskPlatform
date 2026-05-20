# Review Checklist

> Walk this before declaring a change "done" — and walk it again before grading. The grading axes are explicit; the must-not-break invariants each map to a test that proves them.

---

## 1. Grading axes (the bar)

From [assignment.md](assignment.md) §5 — these are how the work will be evaluated.

### Server-side (primary weight)

- [ ] Clean architecture and idiomatic .NET/C#.
- [ ] **Generic task handling — no repetitive per-type conditionals.** No `switch (task.Type)` or `if (type == "Procurement")` chains anywhere in controllers / generic services / the workflow engine.
- [ ] Correct workflow enforcement (all 7 rules from [assignment.md §3](assignment.md)).
- [ ] Strong separation of concerns: controllers → application → domain → data; no EF Core leaks; no HTTP in domain.
- [ ] Thoughtful data-access and query design: `AsNoTracking` on reads, `AsSplitQuery` where needed, `.TagWith(...)`, no N+1, no over-fetch.
- [ ] **The "third task type" extensibility test passes trivially** — proof: flip `SeedExtraTypes=true` in [docker-compose.yml](../docker-compose.yml) → Marketing type appears end-to-end with zero code edits anywhere else.

### Client-side

- [ ] Proper use of Angular built-ins (DI, services, reactive patterns).
- [ ] Clean component architecture (OnPush, standalone, signals, single store).
- [ ] Organized, maintainable code (`core/` / `features/` / `state/` split honoured).
- [ ] Strict TS passes with no surface-level `any`.

### Deliverable hygiene

- [ ] README with setup instructions for both server and client → [README.md](../README.md).
- [ ] README explanation of the extensibility approach → [README §3](../README.md).
- [ ] EF Core migrations checked in.
- [ ] Seed users present and demo data populated on first run.

---

## 2. Must-Not-Break checklist

Each row maps to a regression test (or set of tests). If any row fails, the change is not ready.

| # | Invariant | Test(s) that prove it |
| --- | --- | --- |
| 1 | Closed task → any write attempt → rejected. | `WorkflowEngineTests.ChangeStatus_On_Closed_Task_Returns_ClosedImmutable`, `Close_Already_Closed_Returns_AlreadyClosed`, `UpdateStepData_On_Closed_Task_Returns_ClosedImmutable` |
| 2 | Forward skip → rejected with a clear error. | `WorkflowEngineTests.ChangeStatus_Forward_Skip_Returns_NoForwardSkip` |
| 3 | Backward move on open task → allowed unconditionally. | `WorkflowEngineTests.ChangeStatus_Backward_By_One_Succeeds`, `ChangeStatus_Backward_To_Status_1_From_FinalStatus_Succeeds` |
| 4 | Status change without `nextAssignedUser` → rejected. | `WorkflowEngineTests.ChangeStatus_With_Empty_NextUser_Returns_InvalidNextUser`, `UpdateStepData_Zero_AssignedUserId_Returns_InvalidNextUser` |
| 5 | Status change missing required type-specific data → rejected with a per-field error. | `WorkflowEngineTests.ChangeStatus_With_Missing_Required_Field_Returns_InvalidData`, `ChangeStatus_Procurement_Status2_With_Too_Few_Quotes_Returns_InvalidData`, full `CustomDataParserTests` suite |
| 6 | Close from non-final status → rejected. | `WorkflowEngineTests.Close_Before_FinalStatus_Returns_NotAtFinal`, `Close_At_FinalStatus_Succeeds` |
| 7 | A new task type can be added by adding DB rows + restarting; no code edits to existing modules. | Flip `SeedExtraTypes=true` → run `./scripts/run.ps1` → Marketing type appears end-to-end. `Engine_Has_No_TaskType_Conditionals_Verified_By_Working_With_Two_Types` covers the no-conditional invariant. |
| 8 | Strict-mode TypeScript compilation passes. | `npm run build` in `client/` (run by [scripts/run.ps1](../scripts/run.ps1) step 6). |
| 9 | EF Core migrations run cleanly on an empty DB and seed users. | `DatabaseSeederIntegrationTests.SeedAsync_On_Fresh_Database_Populates_Expected_Counts`, `SeedAsync_Is_Idempotent` |
| 10 | `GET /api/tasks?userId=X` returns only tasks currently assigned to user X. | `TaskServicePersistenceIntegrationTests.ListAsync_Filters_By_User_And_GetByIdAsync_Returns_Field_Values_With_Spec` |
| 11 | Forward re-entry after backward restores prior field data (no forced re-entry). | `WorkflowEngineTests.ChangeStatus_Forward_Retains_PriorStage_FieldValues_As_History`, `TaskServicePersistenceIntegrationTests.ChangeStatus_Retains_History_Of_Prior_Stage_Values`, `ReEntering_Previously_Retired_Status_Does_Not_Violate_Unique_Index` |
| 12 | Concurrent edit on same task → 409 + client auto-recovery. | `ConcurrencyIntegrationTests.RowVersion_Mismatch_Throws_DbUpdateConcurrencyException` + `TasksStore.runMutation` 409 path |

Run them all in one shot:

```powershell
./scripts/test.ps1
```

Expected: `Backend: 82 passed, 0 failed, 0 skipped` + `Frontend: 20 passed, 0 failed, 0 skipped`. Counts may drift slightly as tests are added; any **failure** blocks the checklist.

---

## 3. API contract stability checklist

Some fields and keys are load-bearing for the client. Changing them silently breaks the UI even if all tests pass on the server side.

- [ ] **422 response shape**: `fieldErrors` dictionary keyed by control name (`priceQuotes`, `receipt`, `specification`, `branchName`, `versionNumber`, `campaignName`, `budget`, `launchDate`, `channels`, etc.). Multi-item specs use the array-index suffix the client expects.
- [ ] **`rule` extension on ProblemDetails** (kebab-case): `closed-immutable`, `no-forward-skip`, `beyond-final`, `not-at-final`, `invalid-next-user`, `invalid-data`, `no-movement`, `invalid-status`, `concurrent-modification`. Adding a new arm requires updating the client `WorkflowRule` union in [workflow-validators.service.ts](../client/src/app/core/validators/workflow-validators.service.ts).
- [ ] **`TaskListItem` shape**: `id`, `taskTypeId`, `currentStatusCode`, `currentStatusName`, `currentAssignedUserId`, `isClosed`, `createdAtUtc`, `updatedAtUtc`. Adding fields is safe; renaming or removing is breaking.
- [ ] **`TaskDetail` shape**: above + `customDataByStatus`, `assigneeByStatus`, `retiredStatuses`.
- [ ] **FieldKind literals**: capitalised `"String"` / `"Number"` (mirror the C# enum names).
- [ ] **`customData` request format**: an object keyed by field name; multi-item values as arrays in field-spec order.
- [ ] **URL stability**: `/api/tasks`, `/api/tasks/{id}`, `/api/tasks/{id}/status`, `/api/tasks/{id}/steps`, `/api/tasks/{id}/close`, `/api/task-types`, `/api/users`, `/health*` — the client and the dev tooling all hard-code these.

---

## 4. Verification commands

In order — each step blocks the next.

```powershell
# 1. Spin up a fresh stack
./scripts/run.ps1

# 2. Confirm tests pass
./scripts/test.ps1

# 3. Browse the UI
#    http://localhost:4200  — create / advance / reverse / close a task end-to-end
#    Pick each seeded user; confirm GET /api/tasks?userId=X is honoured.

# 4. Browse the API docs
#    http://localhost:5028/scalar/v1  — exercise every endpoint at least once.

# 5. Optional: prove the extensibility claim
#    Edit docker-compose.yml: set SeedExtraTypes: "true"
#    Re-run ./scripts/run.ps1
#    Marketing type appears in the type picker, /api/task-types, the DB, and the UI — no code touched.
```

---

## 5. Documentation deliverables

- [ ] [README.md](../README.md) §1 (Prerequisites) — Docker Desktop, .NET 10 SDK, Node 20.11+/22+, PowerShell.
- [ ] [README.md](../README.md) §2 (Run it) — single command, 8 steps, what URLs you get.
- [ ] [README.md](../README.md) §3 (Extensibility) — SQL is the only source of truth; both paths to add a type; Marketing proof point.
- [ ] [Claude.md](../Claude.md) — agent operating manual (this directory structure is part of the deliverable).
- [ ] [.claude/assignment.md](assignment.md), [.claude/requirements.md](requirements.md), [.claude/architecture.md](architecture.md), [.claude/decisions.md](decisions.md), [.claude/risks.md](risks.md), [.claude/current-state.md](current-state.md), [.claude/memory.md](memory.md), [.claude/task-plan.md](task-plan.md), [.claude/review-checklist.md](review-checklist.md) — all present.
- [ ] [.claude/rules/](rules/) — project, backend, frontend, testing rules present.
- [ ] [.claude/archive/](archive/) — original audit + refactor plan preserved for history.
