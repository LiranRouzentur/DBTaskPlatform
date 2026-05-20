# Frontend Rules

> Rules for any change to `client/`. Cross-cutting rules in [project.md](project.md). Architecture in [.claude/architecture.md](../architecture.md). Styling: [client/STYLING.md](../../client/STYLING.md).

---

## 1. Components

- **OnPush + standalone** on every component, **no exceptions**.
- **`inject()`** for DI — no constructor parameters.
- Templates stay clean — heavy logic moves to the component class or to a presenter/controller helper.
- Container vs presenter split is encouraged where it adds clarity (see [change-status.facade.ts](../../client/src/app/features/tasks/change-status/change-status.facade.ts) + [change-status.presenter.ts](../../client/src/app/features/tasks/change-status/change-status.presenter.ts)).

---

## 2. Signals first

- `@ngrx/signals` `signalStore` for app state — single `TasksStore` providedIn: 'root'. New state lives there, not in component-local services.
- `toSignal(form.controls.X.valueChanges)` to bridge Reactive Forms into computed signals.
- `effect()` is rare and `untracked()`-guarded when reading other signals. Most reactivity is `computed()`.

---

## 3. HTTP

- **`HttpClient` is touched only in `core/api/`** (`TaskApi`, `TaskTypesApi`, `UsersApi`). Components / facades / stores call these services — never `HttpClient` directly.
- **`retryTransient`** wraps idempotent GETs only. Mutations (`create`, `changeStatus`, `close`, `updateStep`) are **never** retried — idempotency is not guaranteed.
- Interceptor order: `correlationId → logging → error` (innermost → outermost from request perspective).

---

## 4. Reactive Forms

- Typed via `NonNullableFormBuilder` for `String` controls. `Number` controls use raw `FormControl<number | null>` to preserve the empty-state semantics.
- Validators are **UX hints** — the server is authoritative. Mirror server rules in `WorkflowValidators` so toasts and submit gating align, but do not assume client-side validation prevents server errors.
- `TaskFormBuilder` is the single place that builds a `FormGroup` from `FieldSpecMetadata[]`:
  - `ItemCount == 1` → scalar `FormControl`.
  - `ItemCount > 1` → fixed-length `FormArray` (no add/remove UI).

---

## 5. Modals

- Modals are **child routes** of `/tasks`, mounted via `<router-outlet>`.
- **Both opening and closing** call `router.navigate(..., { skipLocationChange: true })`. Forgetting one breaks the URL-stable pattern (see [decisions.md ADR-10](../decisions.md)).
- Route param `id` flows into the modal component via `input(..., { transform: numberAttribute })` thanks to `withComponentInputBinding()` in [app.config.ts](../../client/src/app/app.config.ts).

---

## 6. Store rules

- Single `TasksStore` providedIn: 'root'. Mutations go through **`runMutation`** — never call `patchState` directly from a feature.
- 409 with `rule: concurrent-modification` → store auto-refetches the list + raises an "Out of sync" toast.
- 422 with `fieldErrors` → projected onto matching dynamic-form controls as `{ server: messages }`.
- `fetchListLatest` uses a monotonic **sequence-number guard** — any filter-driven refetch increments the counter; stale responses are dropped.
- `loadDetail(id)` is lazy + deduped — only one in-flight request per id.
- The store fires a refetch on `currentUserId` / `typeFilter` changes — but **not** on `stateFilter` changes (open/closed/all is a pure view concern; the tab counts must stay consistent).

---

## 7. Dynamic forms — extensibility law

Adding a new task type **must not require an Angular code change** (beyond optional richer form descriptors). `DynamicFormComponent` walks `FieldSpecMetadata[]` from `GET /api/task-types` and renders FormControl/FormArray inputs by `Kind` (capitalised string literals — `"String"` / `"Number"` mirror the C# enum).

If you find yourself writing `if (taskTypeId === X)` in a component, stop. That's the wrong layer.

---

## 8. Error handling

- Stores / components only ever see typed `ApiError`, never raw `HttpErrorResponse`.
- `GlobalErrorHandler` overrides Angular's default and unwraps `{ rejection }`. It does **not** double-toast `ApiError` (already surfaced by stores), but it does log them.
- `bindStoreErrorToast(store, titleFn, options, onError?)` is the shared helper. Three call sites today (task-list, create-task, change-status); add a fourth by reusing the helper, not by hand-rolling subscriptions.

---

## 9. Styling

See [client/STYLING.md](../../client/STYLING.md) for the full rules. Highlights:

- **No inline styles** in templates. Class-based only.
- Semantic class names — `.task-row`, not `.flex-row-1`.
- CSS variables for design tokens — defined in [styles.css](../../client/src/styles.css).
- Form fields use the `<tp-field>` pattern (label / hint / errors wrapper) — see [field.component.ts](../../client/src/app/core/ui/field/field.component.ts).

---

## 10. A11y

- Skip-link target is `#main-content` in `AppComponent`.
- Live announcements: `aria-live="polite"` on toast host; do not duplicate with per-toast `role="status"`.
- Focus trap via the `focus-trap` directive in modals — re-queries DOM per Tab so dynamic content works.
- Body scroll lock via the modal stack (first-on, last-off).

---

## 11. Type-safe sentinels

Picker filter sentinels use named constants, never magic numbers:

- `ALL_USERS_VALUE` for the "All Users" pseudo-id.
- `ALL_TYPES` for the "All Types" filter.

Never use `null` or `-1` directly in component / template code for these meanings.

---

## 12. When in doubt

Before changing anything in `change-status.facade.ts`, the dynamic-form pipeline, the modal-stack, or the popover pickers:

- [decisions.md ADR-10](../decisions.md) — modal pattern.
- [risks.md](../risks.md) §4 D-01 — the picker duplication is *deferred*, don't extract speculatively.
- [memory.md](../memory.md) §"Shared patterns — frontend" — non-obvious gotchas.
