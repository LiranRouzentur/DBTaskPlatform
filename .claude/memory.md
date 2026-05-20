# Persistent AI Memory — DBTaskPlatform

> Curated, deduplicated index of *non-obvious patterns* and *load-bearing discoveries* — things an agent would otherwise re-learn the hard way. Most architecture / decisions / risks / state content lives in dedicated files now.

## Where each topic lives now

| Topic | File |
| --- | --- |
| Verbatim assignment | [assignment.md](assignment.md) |
| Derived requirements + must-not-break | [requirements.md](requirements.md) |
| System architecture / layers / data flow | [architecture.md](architecture.md) |
| Why the code is the way it is (ADRs) | [decisions.md](decisions.md) |
| Sharp edges + constraints + tech debt | [risks.md](risks.md) |
| What's runnable + seeded right now | [current-state.md](current-state.md) |
| Forward-looking work | [task-plan.md](task-plan.md) |
| Pre-PR / grading checklist | [review-checklist.md](review-checklist.md) |
| Cross-cutting + per-layer rules | [rules/](rules/) |
| Historical audits + refactor plan | [archive/](archive/) |

This file holds only what doesn't fit cleanly in any of the above: patterns that emerged through use, and discoveries that aren't obvious from reading the code.

---

## 1. Shared patterns — backend

- **`WorkflowOutcome<T>` Result type** everywhere instead of throwing for domain errors. Controllers convert via `await this.ToActionResult(outcome, onSuccess)`. Only unexpected exceptions hit the exception-handler chain.
- **`WorkflowError` is a sealed record hierarchy** (discriminated union). New errors must add an arm in `WorkflowErrorMapper.Classify` — the `_` arm throws to make missing arms loud.
- **`ApiConventionMethod`** drives `[ProducesResponseType]` declarations (`WorkflowApiConventions.WorkflowRead/Write/Create`) — keeps controllers terse.
- **`.TagWith("...")`** is on every EF query so SQL Server's `dm_exec_query_stats` can attribute slow queries.
- **`AsNoTracking()` + `AsSplitQuery()`** on the registry load — without `AsSplitQuery` the JOIN becomes Cartesian and child collections materialize with duplicates, which cascade into duplicate validation messages in `CustomDataParser`.
- **`DetachStatusDefinitionNavigations`** workaround: after `engine.ChangeStatus` sets `CurrentStatusDefinition` to a registry-cached (AsNoTracking) instance, EF would try to INSERT the parent. Service marks the entry `Unchanged` so only the FK column on `TaskItems` is updated. `TaskFieldValue.Spec` no longer needs equivalent treatment — production code looks up spec metadata via the registry by FK, not via the navigation.
- **`X-Correlation-Id`** flows from client → server logs via the correlation interceptor; surfaced back on `ApiError.correlationId` so users can hand a reference id to support.

---

## 2. Shared patterns — frontend

- **OnPush + signals everywhere.** When a Reactive Form's `touched`/`invalid` state changes the FormGroup reference is stable, so `DynamicFormComponent` runs a `tick` signal bumped on `statusChanges + valueChanges` to keep templates subscribed.
- **`toSignal(form.controls.X.valueChanges)`** bridges Reactive Forms into signal-driven `computed`s.
- **`bindStoreErrorToast(store, titleFn, options, onError?)`** is the shared helper that turns `store.error()` changes into toasts (+ optional side-effects like projecting 422 field errors onto a dynamic form).
- **`fetchListLatest` cancellation token** pattern — every filter-driven refetch increments a sequence number; stale responses are dropped.
- **Modal routes use `skipLocationChange: true`** consistently in both `navigate(['/tasks', id, 'change-status'])` and `navigate(['/tasks'])` from inside the modal — must stay in sync.
- **Type-safe filter sentinels** (`ALL_USERS_VALUE`, `ALL_TYPES`) instead of `null` magic numbers in pickers.

---

## 3. Non-obvious discoveries

- **Audit references (`audit §N`)** in source comments point at an earlier remediation review (now in [archive/](archive/)); each comment documents a fix that's already landed. Treat them as load-bearing — they explain *why* a particular pattern is the way it is.
- **`/api/tasks/{id}/steps` is beyond the assignment scope.** It lets the user edit one status's data without moving the task. Removing it would not violate the assignment but would degrade UX.
- **The `Marketing` task type lives entirely in code in `DatabaseSeeder` behind `SeedExtraTypes`** — not via a separate file or registration call. This is intentional: it proves the "no code touched to add a type" claim by being just a few lines of seed data even though it shares the file with the canonical Procurement/Development seed. A future iteration could move the seed payload into a JSON file or DB-only path (see [task-plan.md C-10](task-plan.md)).
- **`StatusFieldKindRow` exists purely for DB-level FK integrity** — there is no nav property from `StatusFieldSpec` back to it; code dispatch always goes through the `StatusFieldKind` enum.
- **`TaskFieldValue.Spec` navigation is intentionally not loaded** in `LoadTrackedAsync` / `GetByIdAsync`. Production code resolves spec metadata via the registry by FK; loading the navigation would trigger relationship fixup that pollutes the registry's in-memory caches.
- **`AsSplitQuery` on the registry load is required, not optional** — without it, EF emits a single Cartesian query and the materialized `Status.Fields` collection contains duplicates (because of the AsNoTracking + nested Include combination), which would cascade into duplicate validation messages in `CustomDataParser`.
- **The frontend mirrors the backend's `WorkflowError.Rule` keys** as a `WorkflowRule` union type. When a new error arm is added on the backend, the client union should grow in parallel so the `bindStoreErrorToast` title function can name the rule.
- **PowerShell + UTF-8**: Vitest emits `✓` / `×` / `↓` glyphs in UTF-8; Windows PowerShell defaults to OEM/CP1252 for child-process stdout and turns them into mojibake (`Γ£ô`). [scripts/test.ps1](../scripts/test.ps1) sets `[Console]::OutputEncoding = UTF8` at the top so the per-test regex actually matches.

---

## When to update this file

Append a new bullet to §1 / §2 / §3 when you discover:

- A non-obvious workaround that exists for a documented reason (so a future agent doesn't "clean it up").
- A pattern that recurs in three or more places and would be tempting to re-derive.
- A gotcha you wasted real time on.

Don't append:

- Anything that belongs in [architecture.md](architecture.md), [decisions.md](decisions.md), [risks.md](risks.md), or [current-state.md](current-state.md). Put it in its proper home.
- Routine progress updates ("today I changed X"). Use git log for that.
- Anything obvious from reading the file in question. Comments belong in code; non-obvious cross-file relationships belong here.
