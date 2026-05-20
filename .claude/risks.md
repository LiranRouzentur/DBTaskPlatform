# Risks & Sharp Edges

> Known constraints + open risks + tech debt + explicitly-deferred refactors. Read this **before** touching a risky area. For *why* the design landed here, see [decisions.md](decisions.md).

---

## 1. Known constraints (intentional limits — not bugs)

- **`TaskTypeRegistry` never refreshes.** Adding a new task type requires an app restart to repopulate the cache. See [decisions.md ADR-05](decisions.md).
- **EF Core `EnableRetryOnFailure` is on.** Any future explicit transaction **must** use `IExecutionStrategy.Execute(...)`. Currently zero explicit transactions exist; adding one without the wrapper is a runtime exception.
- **`StatusFieldSpec.ItemCount` is fixed per spec.** Multi-value specs render a fixed FormArray of length N — no add/remove items in the UI.
- **Hard-coded user ID is acceptable per the assignment.** The client actually exposes a user picker (with "All Users") and persists the selection in localStorage — but there is no real auth.
- **Soft-deleted tasks are inaccessible.** Global filter hides them; write paths also re-apply `IsDeleted == null` to surface 404 instead of accidental writes. There is no "undelete" path.
- **No real-time updates.** No SignalR / WebSockets. 409 concurrent-modification recovery is the only sync mechanism between concurrent users.

---

## 2. Active risks (touch with care)

### R-01 Cache staleness on the singleton registry

If a future feature adds task types at runtime (admin UI?), the singleton registry must be re-loaded or refactored to invalidate. Today there is no invalidation path — adding a row + not restarting → workflow engine doesn't see it → requests for the new type fail.

**Mitigation today:** none beyond the restart requirement. If runtime mutation is added, refactor the registry to support `InvalidateAsync()` or move to `IMemoryCache` with TTL.

### R-02 `DetachStatusDefinitionNavigations` is a known foot-gun

After `WorkflowEngine.ChangeStatus` sets `CurrentStatusDefinition` to a registry-cached (AsNoTracking) instance, EF would try to INSERT the parent. `TaskService` marks the entry `Unchanged` so only the FK column on `TaskItems` is updated.

**Why it's risky:** removing this helper without re-thinking the pattern will cause spurious INSERTs of `StatusDefinition` rows on every status change. The need for the hint is documented in source.

**Mitigation today:** the helper is called in `TaskService` and there's an integration test covering the flow. **Don't delete the helper** without also detaching registry entities at load time.

### R-03 `CustomDataParser` allocation pattern

Per-call allocation: a dictionary, a list per status, plus per-field outputs. Fine at the current request scale; would warrant object pooling if hot-path throughput became a concern.

**Mitigation today:** none needed. Flagged for future load.

### R-04 Soft-delete + filtered unique index is correct but subtle

Any future code that bulk-deletes / inserts `TaskFieldValue` rows must respect two invariants:

1. **Update existing rows in place** rather than DELETE+INSERT. UPSERT (see `TaskItem.UpsertFieldValues`) avoids the brief two-live-row window that DELETE+INSERT can introduce.
2. **`IsDeleted` is a nullable bool**: `null` = live, `true` = retired. `false` is **not** a valid state.

Violating either invariant will produce filtered-index violations or silently lose history.

### R-05 Single source of truth for "current status" is the FK `CurrentStatusDefinitionId`

`TaskItem.Code` is a derived property that reads off the loaded `CurrentStatusDefinition` navigation. After a mutation, callers that read `task.Code` must either reload the navigation or resolve via the registry by id.

**Mitigation today:** mapper and service code do this correctly, but it's a sharp edge — easy to write a new helper that prints `task.Code` and gets a stale value.

---

## 3. Technical debt (acknowledged, not urgent)

- **`DatabaseSeeder.SeedValuesFor`** uses random pools — fine for demo data but makes the seed non-deterministic across runs (clean-DB only on first boot). Acceptable.
- **`humanize-label.pipe.ts`** + `task-form-builder.service.ts` carry a residual `STRING_MAX_LENGTH = 150` default fallback even though every seeded spec sets an explicit `Max`. Could be tightened once we're confident every spec sets it.
- **`Domain.Errors.WorkflowError.InvalidNextUser`** uses a fixed message ("Next assigned user is missing.") even when the value is non-positive but present. Minor wording polish.
- **`auth.interceptor.ts`** on the client is a passthrough — no auth in scope. Cosmetic dead code.
- **`TaskFormBuilder.createArrayItem`** marked "legacy" with no callers. Safely removable.
- **`UserPreferencesService.readCurrentUserId`** marked "back-compat passthrough" with no callers. Safely removable.

---

## 4. Deferred refactors (NOT recommended)

These are changes that *look* tempting from a code-quality lens but are explicitly **not** worth doing. Sourced from [archive/final-refactor-plan.md §5](archive/final-refactor-plan.md).

### D-01 Extract `PopoverPickerHost` base directive for user-picker + type-picker

~200 lines of structural duplication between the two pickers. **Why deferred**: both pickers are heavily-tested, the duplication is mechanical not behavioural, and the extraction risks regressing keyboard / focus / outside-click behaviour that has no automated coverage at the directive level. Wait for a third picker before factoring out.

### D-02 Remove the `DetachStatusDefinitionNavigations` workaround

The "right" fix is to never assign a registry-cached `StatusDefinition` instance to a tracked entity in the first place — set only the FK column. **Why deferred**: the engine's mutation API is shared with tests; changing the contract risks subtle bugs across the integration suite. The workaround is well-documented, costs one method call per status change, and works.

### D-03 Replace `JsonElement` flowing through the change-status pipeline with a typed DTO

The current pipeline accepts raw `JsonElement customData`, which `CustomDataParser` traverses. A typed DTO with explicit field shapes would be cleaner — but **why deferred**: the whole point of the architecture is that the server doesn't know the shape of `customData` at compile time. Typing it would require either generic DTOs (defeats the purpose) or per-type DTOs (defeats the extensibility axis). The `JsonElement` is *the* untyped escape hatch we accept — but it is contained to a single parser, not floating across layers.

### D-04 Self-host fonts / lazy-load child route components

UX polish items. **Why deferred**: not load-bearing for the assignment; would add bundling complexity for marginal TTI wins.

---

## 5. Risk summary for refactor planning

| If you are about to… | Read first | Risk level |
| --- | --- | --- |
| Add a workflow rule | [requirements.md §5](requirements.md), [decisions.md ADR-04](decisions.md) | Low |
| Add a `StatusFieldKind` | [architecture.md §9](architecture.md), [decisions.md ADR-06](decisions.md) | Low |
| Touch the registry | R-01 | Medium |
| Touch `TaskService.ChangeStatusAsync` or the engine's `MoveTo` | R-02, R-04, R-05 | High |
| Touch `TaskFieldValue` write code | R-04 | High |
| Rename a `StatusFieldSpec.Name` | [decisions.md ADR-07](decisions.md) (safe — ids stable) | Low |
| Add a new endpoint | [architecture.md §6](architecture.md), [requirements.md §4](requirements.md) | Low |
| Change the error envelope | [requirements.md §7](requirements.md), [review-checklist.md §3](review-checklist.md) | Medium |
| Lift/move modal logic | [decisions.md ADR-10](decisions.md) | Medium |
