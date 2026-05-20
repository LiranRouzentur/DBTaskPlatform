# Project Rules

> Cross-cutting rules an agent must follow regardless of which side of the stack they're editing. Layer-specific rules live in [backend.md](backend.md) and [frontend.md](frontend.md). Test rules in [testing.md](testing.md).

---

## 1. Naming

- **C#**: `PascalCase` for types/members; `camelCase` for locals/params; `_camelCase` for private fields.
- **TypeScript**: `camelCase` for variables/methods; `PascalCase` for classes/interfaces/types.
- **REST resources**: plural (`/api/tasks`, `/api/users`, `/api/task-types`).
- **ProblemDetails `rule` extension**: kebab-case (`closed-immutable`, `no-forward-skip`, `invalid-data`, etc.).
- **Test method names**: snake-underscored PascalCase (`ChangeStatus_Forward_By_One_With_Valid_Data_Succeeds`) — the test runner derives a human-readable "purpose" line from this.

---

## 2. Error envelope

- All workflow / validation errors return **RFC 7807 ProblemDetails**.
- ProblemDetails `Type` URIs are centralized in **`ProblemTypes`** ([server/api/exceptionhandlers/ProblemTypes.cs](../../server/api/exceptionhandlers/ProblemTypes.cs)). Do not hard-code URI strings elsewhere.
- The `rule` extension (kebab-case) is the contract surface that the client `WorkflowRule` union mirrors. Adding a new rule on the server **requires** updating [workflow-validators.service.ts](../../client/src/app/core/validators/workflow-validators.service.ts).
- Status codes are deterministic — see [requirements.md §7](../requirements.md). 400 / 404 / 409 / 422 / 500 carry specific meanings; don't reach for new codes.

---

## 3. Extensibility law

> **No `switch (taskType)` / `if (type == "X")` anywhere in generic code paths.**

This applies to controllers, the workflow engine, generic services, the response mapper, the Angular store, and any UI component above the dynamic-form layer. New task types are **data** — DB rows in `TaskTypes` / `StatusDefinitions` / `StatusFieldSpecs`. If a change to existing code is required to add a new type, the design has drifted and the change is in the wrong place. See [requirements.md §6](../requirements.md) and [architecture.md §9](../architecture.md).

The single deliberate `switch` in the workflow path is `CustomDataParser.ProcessSingle`'s dispatch on `StatusFieldKind` (String / Number). That switch is symmetric across all task types and is the right place to add a new *kind*.

---

## 4. Closed-task immutability

Enforced **in the domain**, not only in the UI. `TaskItem.MoveTo` and any future write helper must reject a closed task. The Angular client also gates the submit button — that's defence-in-depth, not the source of truth.

---

## 5. Async everywhere

- C# async APIs are async all the way down. `Async` suffix on async methods.
- No `.Result` / `.GetAwaiter().GetResult()` outside the composition root.
- TypeScript async work uses Observables (preferred for HTTP) or `async/await` for one-shots — never bare callback hell.

---

## 6. Strict TypeScript

- `"strict": true` stays on across all `tsconfig.*.json` files.
- No `any` in component / service / store / model surface code.
- `as` narrowing is allowed only at well-defined boundaries (error classification, JSON parsing).
- New TS files must compile cleanly under `--strict` before being committed.

---

## 7. Dependency injection

- Server: ASP.NET Core's built-in DI container only. No Autofac, no Lamar, etc.
- Client: Angular's built-in DI (`inject()` everywhere — no constructor params for DI).
- No `new`-up of services or `DbContext` outside the composition root.

---

## 8. Folder layout

- **Server**: vertical slices under `server/api/`, `server/application/`, `server/data/`, `server/domain/`. Each subfolder owns one concern (e.g. `controllers/`, `services/`, `workflow/`, `exceptionhandlers/`).
- **Client**: `core/` vs `features/` vs `state/` — strict separation. `core/` has no upward imports into `features/` or `state/`.

---

## 9. No untyped escape hatches

`dynamic`, floating `JsonElement` across layers, untyped `object`, or `any` "to make extensibility easier" are forbidden. Extensibility comes from polymorphism + metadata, not from erasing types. The one accepted exception is `JsonElement customData` flowing into the single `CustomDataParser` — contained, documented, justified.

---

## 10. Commits & PRs

- One concern per commit / PR. Refactors and behavior changes do not ride together.
- Run `./scripts/test.ps1` locally before pushing — it's the same suite CI runs.
- For any rule / contract change, update [.claude/decisions.md](../decisions.md) **in the same PR**, not after.
