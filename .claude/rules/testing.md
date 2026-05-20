# Testing Rules

> Rules for tests on both sides of the stack. Test results map onto the must-not-break checklist in [.claude/review-checklist.md](../review-checklist.md).

---

## 1. Runner of record

```powershell
./scripts/test.ps1
```

Runs both suites end-to-end and prints a single console report. Backend (xUnit + real SQL Server integration) and frontend (Vitest + jsdom). Non-zero exit on any failure.

Do **not** add a second runner. Do **not** introduce a watch-mode runner that contributors must remember to invoke — the one-shot script is the source of truth.

---

## 2. Backend test layout

Under [server/tests/](../../server/tests/):

- **`workflow/`** — pure engine tests. No DB. `WorkflowEngineTests`, `CustomDataParserTests`, `FakeTaskTypeRegistry`, `TestTaskTypes`.
- **`integration/`** — EF + SQL-backed tests. Hit a real SQL Server. `TaskServicePersistenceIntegrationTests`, `DatabaseSeederIntegrationTests`, `TaskTypeRegistryIntegrationTests`, `ConcurrencyIntegrationTests`.

**No mocking of EF Core or `AppDbContext` in integration tests** — we got burned in audits where mocked stubs masked real query behaviour. Integration tests use a real SQL instance.

---

## 3. Test naming

Method names use snake-underscored PascalCase. The runner ([scripts/test.ps1](../../scripts/test.ps1)) parses these into human-readable "purpose" lines via `Convert-ToPurpose`:

```
ChangeStatus_Forward_By_One_With_Valid_Data_Succeeds
→ Purpose: Change Status - Forward - By - One - With - Valid - Data - Succeeds
```

A good name reads as a sentence. Match this convention so the console report stays readable.

---

## 4. Generic-engine tests must not name specific task types

From [requirements.md §10](../requirements.md): tests for the generic `WorkflowEngine` must not reference Procurement or Development by name. They use synthetic test types from [TestTaskTypes.cs](../../server/tests/workflow/TestTaskTypes.cs) registered through `FakeTaskTypeRegistry`.

Conversely, tests for a specific task type must not reach into the engine's internals — they exercise behaviour through the public service surface.

`WorkflowEngineTests.Engine_Has_No_TaskType_Conditionals_Verified_By_Working_With_Two_Types` is the meta-test that proves the engine is type-agnostic. Don't delete it.

---

## 5. Frontend tests

- Live next to the unit being tested (`*.spec.ts`). Examples: [workflow-validators.spec.ts](../../client/src/app/core/validators/workflow-validators.spec.ts), [retry-transient.spec.ts](../../client/src/app/core/http/retry-transient.spec.ts), [tasks.store.spec.ts](../../client/src/app/state/tasks.store.spec.ts).
- jsdom env (configured in [vitest.config.mts](../../client/vitest.config.mts)).
- **No real HTTP** — use the Vitest test harness with mocked observables for store / interceptor tests.
- Setup runs through [test-setup.ts](../../client/src/test-setup.ts) — bootstraps Analog's Vitest-Angular plugin.

---

## 6. Console encoding (gotcha)

Vitest emits UTF-8 glyphs (`✓` / `×` / `↓`). Windows PowerShell defaults to OEM/CP1252 for child-process stdout, which would otherwise turn `✓` into `Γ£ô` and the per-test parser would count zero passes.

[scripts/test.ps1](../../scripts/test.ps1) sets:

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding           = [System.Text.Encoding]::UTF8
```

at the top. **Don't remove those two lines.** Without them the frontend totals report `0 passed` even when all tests actually pass.

---

## 7. What to test

Add tests for:

- **Every new workflow rule** in the engine. Pair the rule with a `WorkflowEngineTests.*` case that *fails* before the rule exists and passes after.
- **Every new `StatusFieldKind`** handler. Add `CustomDataParserTests` cases for the success path + each per-kind validation failure mode.
- **Every new API endpoint**. Integration test against a real SQL Server.
- **Every must-not-break invariant** in [review-checklist.md §2](../review-checklist.md). The mapping table there is load-bearing — keep it accurate as tests are renamed.
- **Regressions** — when a bug is fixed, write a test that *would have caught it* and assert it now passes.

---

## 8. What NOT to test

- Don't test the framework. `AsNoTracking` works. `OnPush` works. Trust the platform.
- Don't test getters / setters / pure pass-through DTO mappers — `ResponseMapper` extension methods are exercised by the integration tests that consume them.
- Don't test private implementation details that the public surface already covers. If a refactor needs to change a private helper, the test should still pass.

---

## 9. Coverage target

**No enforced threshold.** Passing the must-not-break checklist ([review-checklist.md §2](../review-checklist.md)) is the bar. Coverage as a number is easy to game; the checklist is anchored in behaviour.

That said — if a public method on `TaskService` / `WorkflowEngine` / `CustomDataParser` / `TasksStore` has zero direct test coverage, that's a red flag worth fixing before adding more features.

---

## 10. Concurrency tests

`ConcurrencyIntegrationTests.RowVersion_Mismatch_Throws_DbUpdateConcurrencyException` is the canonical example. Any new optimistic-concurrency surface (a new entity with `RowVersion`) needs an equivalent test before it's considered done.

---

## 11. Seed tests are tests of the contract

`DatabaseSeederIntegrationTests.SeedAsync_On_Fresh_Database_Populates_Expected_Counts` and friends assert exact row counts and shapes. They guard the "fresh DB has demo data" deliverable from [assignment.md §5](../assignment.md). When you change the seeder, update these tests — don't bypass them.
