# Claude.md — Agent Operating Manual

This file is the **operating manual** for any AI agent working on DBTaskPlatform. The assignment, rules, architecture, and history all live in dedicated files under [.claude/](./) — this file tells you which one to read for what.

Source document for the assignment: [dotnet-angular-assignment.docx](../dotnet-angular-assignment.docx).

---

## File map — which file answers which question

| File | Read when |
| --- | --- |
| [assignment.md](assignment.md) | You need to confirm what was actually asked — what's in scope vs out of scope. |
| [requirements.md](requirements.md) | You're implementing or reviewing — derived contract, must-not-break invariants, deliverables. |
| [architecture.md](architecture.md) | Cold start; you need to know where X lives and how it collaborates with Y. |
| [decisions.md](decisions.md) | You're about to change something that looks "wrong" — check it's not a deliberate constraint (ADRs). |
| [risks.md](risks.md) | You're touching a sharp edge — registry, soft-delete index, `DetachStatusDefinitionNavigations`, etc. |
| [current-state.md](current-state.md) | Start of a new session — what's runnable, what's seeded, what URLs work right now. |
| [memory.md](memory.md) | You want the non-obvious patterns + gotchas other agents have hit. |
| [task-plan.md](task-plan.md) | You're picking the next thing to do, or assessing the backlog. |
| [review-checklist.md](review-checklist.md) | You're about to finish / hand off — walk every box. |
| [rules/project.md](rules/project.md) | **Always** — cross-cutting rules apply to every change. |
| [rules/backend.md](rules/backend.md) | You're touching anything under `server/`. |
| [rules/frontend.md](rules/frontend.md) | You're touching anything under `client/`. |
| [rules/testing.md](rules/testing.md) | You're writing or running tests. |
| [archive/](archive/) | Historical reference — the original client-refactor-audit, server-refactor-audit, and final-refactor-plan. Not load-bearing today; most items have been actioned. |

---

## Session protocol

A five-step recipe that applies to every non-trivial task:

1. **On any task** — read [requirements.md](requirements.md) (always) **plus** the matching `rules/*.md` for the layer you'll touch.
2. **Before changing existing code** — read [decisions.md](decisions.md) to check it's not a deliberate constraint, and [risks.md](risks.md) to check it's not a sharp edge.
3. **When you discover a new non-obvious pattern** — append it to [memory.md](memory.md) §1 / §2 / §3 so the next session picks it up.
4. **When you make a design choice** that future agents would otherwise re-litigate — append a new ADR entry to [decisions.md](decisions.md).
5. **Before declaring done** — walk [review-checklist.md](review-checklist.md). Run `./scripts/test.ps1` — non-zero exit blocks "done".

---

## Where this file is *not* the answer

- **Setup / running the app** → [README.md](../README.md).
- **Day-to-day code conventions** → [rules/project.md](rules/project.md).
- **What the assignment actually requires** → [assignment.md](assignment.md) (verbatim) and [requirements.md](requirements.md) (derived).

If you read this file and didn't find the answer you were looking for, the answer lives in one of the files above. Follow the table.
