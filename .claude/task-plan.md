# Task Plan

> Forward-looking task list. Answers "what should I work on?". For *why* things are the way they are, see [decisions.md](decisions.md). For *what's already running*, see [current-state.md](current-state.md).

---

## Status snapshot

**Feature-complete per the assignment** plus the extras (`/api/tasks/{id}/steps` in-place edit, the Marketing third-type flag, retired-statuses surface). No open TODOs in source comments other than the `audit §N` markers, which point at an earlier remediation review whose items are already landed.

Remaining work is **documentation polish + optional refactors**. Nothing is blocking grade-readiness.

---

## Open / planned tasks

| ID | Title | Size | Rationale | Links |
| --- | --- | --- | --- | --- |
| — | (none currently) | — | The platform meets all must-not-break behaviors and deliverables. | [review-checklist.md](review-checklist.md) |

How to add a task:

1. Append a row above with a stable `T-NN` id.
2. Link to the relevant [decisions.md](decisions.md) ADR or [risks.md](risks.md) entry that motivates it.
3. Keep the table sortable by id; do not renumber on completion (move to a "Completed" section below if you want history).

---

## Candidate refactor opportunities (not committed work)

These are *options* surfaced from the architectural memory + audit history. None are scheduled; pick one up only if it solves a current pain.

| ID | Opportunity | Touches | Motivated by |
| --- | --- | --- | --- |
| C-01 | Promote `TaskFieldValue` value-column polymorphism (StringValue/NumberValue) into a JSON or `sql_variant` column **if** a third kind (date, bool) is added. | [server/domain/entities/TaskFieldValue.cs](../server/domain/entities/TaskFieldValue.cs) + migration | Adding kinds today means an extra nullable column. |
| C-02 | Move `TaskTypeRegistry.EnsureLoadedAsync` to an `IHostedService` so startup ordering is explicit. | [server/api/Program.cs](../server/api/Program.cs) | Currently invoked imperatively after migrate + seed. |
| C-03 | Extract a `CustomDataParser` interface if/when field-kind dispatch grows beyond String/Number — would let new kinds register as DI-discovered strategies, mirroring the extensibility axis at the parser level. | [server/application/](../server/application/) | Mirrors the assignment's "no edits to existing code" axis. |
| C-04 | Replace `DetachStatusDefinitionNavigations` workaround by stopping the engine from assigning a registry-cached `StatusDefinition` to the tracked entity — set only the FK column. | [server/application/workflow/](../server/application/workflow/), [server/application/services/TaskService.cs](../server/application/services/TaskService.cs) | See [risks.md R-02](risks.md). Risky; deferred. |
| C-05 | Split `TaskService` into `TaskCommandService` + `TaskQueryService` if more read shapes are added. | [server/application/services/](../server/application/services/) | Currently the same class carries both, cleanly. |
| C-06 | Centralize `skipLocationChange: true` modal navigation behind a small `ModalRouter` helper. | [client/src/app/features/tasks/](../client/src/app/features/tasks/) | See [decisions.md ADR-10](decisions.md). |
| C-07 | Collapse `change-status` 5 `signal<boolean>` confirm flags into one discriminated-union signal + one `@switch` block. | [client/src/app/features/tasks/change-status/](../client/src/app/features/tasks/change-status/) | Biggest reader-friendliness win in the client per [archive/client-refactor-audit.md §6.1](archive/client-refactor-audit.md). |
| C-08 | Add keyboard handler + `tabindex="0"` + `role="button"` to task-list rows. | [client/src/app/features/tasks/task-list/](../client/src/app/features/tasks/task-list/) | Only material a11y gap per [archive/client-refactor-audit.md §7 A1](archive/client-refactor-audit.md). |
| C-09 | Delete `auth.interceptor.ts`, `TaskFormBuilder.createArrayItem`, `UserPreferencesService.readCurrentUserId`. | [client/src/app/core/](../client/src/app/core/) | Dead code per [risks.md §3](risks.md). |
| C-10 | Move the marketing-type seed payload from `DatabaseSeeder` into a JSON file or DB-only path so it's not in code at all. | [server/data/persistence/DatabaseSeeder.cs](../server/data/persistence/DatabaseSeeder.cs) | The Marketing type is currently a code-level proof of extensibility; moving it to data fully closes the loop. |

---

## Audit-derived backlog (residual)

Items from [archive/final-refactor-plan.md](archive/final-refactor-plan.md) not yet actioned. The "quick wins" (Q1–Q10) and "medium refactors" (M1–M9) are mostly merged; what remains is captured in **C-01..C-10** above. Items explicitly **not** recommended live in [risks.md §4](risks.md).

---

## How to add a task

1. Append a row to the **Open / planned tasks** table.
2. Use the next free `T-NN` id (or `C-NN` for "candidate, not scheduled").
3. Cite a motivation — an ADR, a risk, an audit finding, or a user request.
4. When you start it, change the row's status (mark in PR description).
5. When done, either delete the row or move it to a "Completed" section with the merge commit hash.
