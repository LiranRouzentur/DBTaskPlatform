import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { ApiError } from '../../../core/models/api-error.model';
import { ToastService } from '../../../core/services/toast.service';
import { DISCARD_CHANGES_COPY } from '../../../core/ui/confirm-modal/discard-changes.copy';
import { DialogState } from '../../../core/utils/dialog-state';
import { formSignal, formStatusSignal, setControl } from '../../../core/utils/form-helpers';
import { formatAbsolute, formatRelativeTime } from '../../../core/utils/relative-time';
import { shortenTaskId } from '../../../core/utils/shorten-id';
import { bindStoreErrorToast } from '../../../core/utils/store-error-toast';
import { WorkflowValidators } from '../../../core/validators/workflow-validators.service';
import { TasksStore } from '../../../state/tasks.store';

import { ChangeStatusPresenter, StatusOptionView } from './change-status.presenter';
import { CustomDataFormController } from './custom-data-form.controller';

/** Discriminator for which confirm dialog is currently open inside the change-status modal. */
export type ActiveConfirmDialog =
  | 'close'
  | 'cancel'
  | 'backward'
  | 'forward'
  | 'in-place';

/**
 * Facade owning all UX orchestration for the change-status modal: detail fetch, status option building,
 * per-status form lifecycle, dirty-guard, and submit dispatch. Pure derivations (status pill shape, history
 * prefill) live in `ChangeStatusPresenter`; the dynamic form lifecycle lives in `CustomDataFormController`.
 */
@Injectable()
export class ChangeStatusFacade {
  // ─── Dependencies ────────────────────────────────────────────────────────
  /** Shared signal-store — owns the cached detail and is the single dispatcher for all mutations. */
  private readonly store = inject(TasksStore);
  /** Typed form-builder for the non-nullable outer form (target status + next assignee). */
  private readonly fb = inject(NonNullableFormBuilder);
  /** Used for both opening and closing the modal — both go through `skipLocationChange` navigation (frontend.md §5). */
  private readonly router = inject(Router);
  /** Surfaces transient success/info toasts; error toasts are handled by `bindStoreErrorToast`. */
  private readonly toasts = inject(ToastService);
  /** Pure presenter for status pill shapes and history prefill — no signals, no DI of stateful services. */
  private readonly presenter = inject(ChangeStatusPresenter);
  /** Owns the per-status `FormGroup` rebuilt on every target change; exposed so templates can read its signals. */
  readonly cdf = inject(CustomDataFormController);

  // ─── Template constants ──────────────────────────────────────────────────
  /** Alias used by templates so they don't need a separate inject of TasksStore. */
  readonly storeRef = this.store;
  /** Shared copy block for the "discard changes?" dialog — kept in one place to keep wording consistent. */
  readonly discard = DISCARD_CHANGES_COPY;
  /** Tiny state-machine for "which confirm dialog is open" — avoids 5 separate booleans. */
  readonly dialog = new DialogState<ActiveConfirmDialog>();

  // ─── Forms ───────────────────────────────────────────────────────────────
  /** Outer form holds inputs that aren't per-status custom-data: the chosen target status + chosen next assignee. */
  readonly outerForm = this.fb.group({
    targetStatus: this.fb.control<number | null>(null),
    nextAssignedUserId: this.fb.control<number>(0, [Validators.required, Validators.min(1)]),
  });

  // ─── Writable Signals ────────────────────────────────────────────────────
  /** Source of truth for the currently-bound task id; set from the route param via the container's effect. */
  readonly taskId = signal(0);
  /** Mirror of `outerForm.controls.targetStatus.value`; null = the user is editing the current status in-place. */
  readonly targetStatus = signal<number | null>(null);
  /** Option the user clicked while the form was dirty — held until they confirm/cancel the discard prompt. */
  readonly pendingStatusSwitch = signal<StatusOptionView | null>(null);

  // ─── Observable → Signal Bridges ─────────────────────────────────────────
  /** Reactive view of the assignee control's value — used to compute `nextAssigneeId`. */
  private readonly nextAssigneeValue = formSignal(this.outerForm.controls.nextAssignedUserId);
  /** Reactive view of the assignee control's VALID/INVALID/PENDING status — drives the assignee error message. */
  private readonly nextAssigneeStatusSignal = formStatusSignal(
    this.outerForm.controls.nextAssignedUserId,
  );

  // ─── Computed ────────────────────────────────────────────────────────────
  /** The currently-bound TaskDetail (from the store cache) or null while loading / when id is unset. */
  readonly task = computed(() => this.store.detailById()[this.taskId()] ?? null);
  /** True while the store is fetching this id — drives the modal's skeleton spinner. */
  readonly detailLoading = computed(() => this.store.detailLoadingIds().has(this.taskId()));

  /** Task-type metadata for the current task — drives status options, custom-data fields, and labels. */
  readonly taskType = computed(() => {
    // Pull the bound task from the cache via the task() computed.
    const t = this.task();
    // No task yet → metadata is irrelevant; return null so downstream computeds short-circuit.
    return t ? this.store.taskTypeById().get(t.taskTypeId) ?? null : null;
  });

  /** Resolved assignee user object — drives the avatar + name in the modal header. */
  readonly assignee = computed(() => {
    // Mirror of the same task() guard pattern — header avatar can't render without an assigned user.
    const t = this.task();
    return t ? this.store.userById().get(t.assignedUserId) ?? null : null;
  });

  /** Short display id (last 4 chars or similar) shown in the modal header — full id is too noisy. */
  readonly shortId = computed(() => {
    // Re-read task() so the computed re-evaluates when detail arrives.
    const t = this.task();
    return t ? shortenTaskId(t.id) : '';
  });

  /** Humanised "5 minutes ago" string for the updatedAt timestamp. */
  readonly updatedRelative = computed(() => {
    // Reactive read so the label refreshes when a mutation updates the detail.
    const t = this.task();
    return t ? formatRelativeTime(t.updatedAtUtc) : '';
  });

  /** Absolute ISO-like timestamp used as the `title` tooltip on the relative-time label. */
  readonly updatedAbsolute = computed(() => {
    // Shares the same task() dependency so tooltip stays in sync with the relative-time label.
    const t = this.task();
    return t ? formatAbsolute(t.updatedAtUtc) : '';
  });

  /** Human name of the task's current status (e.g. "In review"). Falls back to "Status N" if metadata is missing. */
  readonly currentStatusName = computed(() =>
    // Presenter handles the null/missing fallbacks centrally — we just pass the current values through.
    this.presenter.statusName(this.task()?.status ?? null, this.taskType()),
  );

  /** Human name of the user-selected target status — used in the toast and confirm-dialog body. */
  readonly targetStatusName = computed(() =>
    // Same presenter resolution, applied to the in-modal selection rather than the persisted state.
    this.presenter.statusName(this.targetStatus(), this.taskType()),
  );

  /** True when the user is moving the task to an earlier status — triggers the "backward" confirm dialog variant. */
  readonly targetIsBackward = computed(() => {
    // Selected target status (null = in-place edit).
    const target = this.targetStatus();
    // Persisted task — needed to compare against.
    const task = this.task();
    // Both must exist AND the target must be strictly earlier than current — equals would be in-place.
    return target !== null && task !== null && target < task.status;
  });

  /** Status pills the user can click — direction/disabled state derived by the presenter from `WorkflowValidators`. */
  readonly statusOptions = computed<readonly StatusOptionView[]>(() => {
    // Both task + type required to enumerate statuses with validator gating; empty pills until both load.
    const task = this.task();
    const type = this.taskType();
    return task && type ? this.presenter.buildStatusOptions(task, type) : [];
  });

  /** Client-side mirror of the server's workflow rules — used to gate submit, not as the source of truth. */
  readonly workflowCheck = computed(() => {
    // Reactive reads — recomputes when task, type, or target changes.
    const task = this.task();
    const type = this.taskType();
    const target = this.targetStatus();
    // Insufficient state → treat as ok so submit isn't blocked prematurely; server gives the final word.
    if (!task || !type || target == null) return { ok: true } as const;
    return WorkflowValidators.canChangeStatus(task, target, type);
  });

  /** True iff the close-task button should be enabled — server is authoritative; this is defence-in-depth. */
  readonly canCloseTask = computed(() => {
    // Need both pieces to decide; either missing means "not yet" (button stays disabled).
    const task = this.task();
    const type = this.taskType();
    return !!task && !!type && WorkflowValidators.canClose(task, type).ok;
  });

  /** Currently-selected next-assignee id, or null when the placeholder "0" is still selected. */
  readonly nextAssigneeId = computed<number | null>(() => {
    // Reactive read of the assignee control's value (bridged via formSignal above).
    const v = this.nextAssigneeValue();
    // Sentinel `0` (the form default) means "no assignee picked" — surface as null for downstream consumers.
    return typeof v === 'number' && v > 0 ? v : null;
  });

  /** Single canonical error message for the assignee field — touched + invalid is the only failure surface. */
  readonly assigneeErrors = computed<readonly string[]>(() => {
    void this.nextAssigneeStatusSignal(); // subscribe so OnPush recomputes when control status flips
    // Direct control reference — keeps the message tied to the exact control we validate.
    const ctrl = this.outerForm.controls.nextAssignedUserId;
    // Mirror the dynamic-form rule: don't show errors until the user has interacted.
    if (!ctrl.touched || !ctrl.invalid) return [];
    return ['Pick an assignee.'];
  });

  // ─── Effects ─────────────────────────────────────────────────────────────
  /** Load detail lazily when a task id is set and not yet cached. */
  private readonly _loadDetailOnTaskId = effect(() => {
    // Reactive read — this effect re-runs whenever the route id changes.
    const id = this.taskId();
    // 0 is the "no id" placeholder; skip the fetch.
    if (!id) return;
    // untracked() — we only want to react to id changes, not to detailById changes (those would loop after we fetch).
    const cached = untracked(() => this.store.detailById()[id]);
    // Only fetch if the cache miss — store.loadDetail is also deduped, but this avoids an extra microtask.
    if (!cached) void this.store.loadDetail(id);
  });

  /** Seed the custom-data form once task + type become available. */
  private readonly _seedCustomDataForm = effect(() => {
    // Reactive reads — fires once detail arrives and again if either reference identity changes.
    const task = this.task();
    const type = this.taskType();
    if (!task || !type) return;
    // Only seed when the user hasn't picked a target yet AND we don't already have a form built (first-load path).
    if (this.targetStatus() === null && this.cdf.form() === null) {
      this.rebuildCustomDataForm(task.status);
    }
  });

  // ─── Lifecycle ───────────────────────────────────────────────────────────
  constructor() {
    // Subscribe to target-status changes here (not in an effect) because we need both the new value and side-effects.
    this.outerForm.controls.targetStatus.valueChanges
      // takeUntilDestroyed ties the subscription to the injection context — Angular cleans up at destroy.
      .pipe(takeUntilDestroyed())
      .subscribe((value) => {
        // Mirror the form control's value into a signal so other computeds see it reactively.
        this.targetStatus.set(value);
        // Rebuild the per-status form to match the newly-selected target (or revert to current when null).
        this.rebuildCustomDataForm(value);
      });

    // 422 field errors are projected onto the custom-data form by the 4th-arg callback;
    // 409 recovery is already handled inside `TasksStore.runMutation` — we don't re-handle it here.
    bindStoreErrorToast(this.store, errorTitle, undefined, (err) =>
      this.cdf.applyServerFieldErrors(err),
    );
  }

  // ─── Public API / UI Actions ─────────────────────────────────────────────
  /** Setter called by the container's effect when the `:id` route segment changes. */
  setTaskId(id: number): void {
    this.taskId.set(id);
  }

  /** Status pill click handler. Asks the user to discard before switching targets when the form is dirty. */
  pickStatus(option: StatusOptionView): void {
    // Disabled options have a workflow-rule reason — ignore clicks (the tooltip explains why).
    if (option.disabled) return;

    // "Current" pill = revert to in-place edit; tracked so we know to set targetStatus back to null below.
    const wantsCurrent = option.direction === 'current';
    // Clicking the already-active target is a no-op — avoid clobbering form state needlessly.
    const sameAsCurrent = option.status === this.targetStatus();
    if (!wantsCurrent && sameAsCurrent) return;

    // Dirty + already on a target → guard the user from losing edits with a discard prompt.
    if (this.targetStatus() !== null && this.isDirty()) {
      // Hold the click — the discard-changes prompt will resolve to commit or cancel.
      this.pendingStatusSwitch.set(option);
      return;
    }
    // Otherwise commit immediately — null target for "current" pill, numeric status otherwise.
    this.commitTarget(wantsCurrent ? null : option.status);
  }

  /** Updates the next-assignee control from the user-picker; routed through `setControl` for typed safety. */
  pickAssignee(id: number): void {
    // setControl handles markAsDirty + emit semantics centrally so we don't drift across call sites.
    setControl(this.outerForm.controls.nextAssignedUserId, id);
  }

  /** User said "yes, discard" in the discard-changes prompt — commit the held target. */
  confirmStatusSwitch(): void {
    // Retrieve the option we held while the discard prompt was open.
    const pending = this.pendingStatusSwitch();
    if (!pending) return;
    // Clear the pending slot first so re-entrant prompts can't double-fire.
    this.pendingStatusSwitch.set(null);
    // Same null-vs-numeric mapping as pickStatus.
    this.commitTarget(pending.direction === 'current' ? null : pending.status);
  }

  /** User cancelled the discard prompt — drop the held option and keep the current form state. */
  cancelStatusSwitch(): void {
    // Simply drop the held option; current target + form state remain untouched.
    this.pendingStatusSwitch.set(null);
  }

  /** Opens the "close task?" confirm dialog. Final close happens in `confirmDialog`. */
  requestClose(): void {
    // Open the close-confirm; actual close call happens after the user confirms.
    this.dialog.open('close');
  }

  /** Cancel button: prompt if dirty, otherwise route back immediately. */
  requestCancel(): void {
    // Prompt only when there's something to lose — keeps the no-op cancel path quick.
    if (this.isDirty()) {
      this.dialog.open('cancel');
      return;
    }
    // Nothing dirty — route back without bothering the user.
    this.routeBack();
  }

  /** Submit click. Decides which confirm dialog to show: in-place / forward / backward — or no-ops when nothing changed. */
  onSubmitRequest(): void {
    // Mark touched so any latent validation errors light up in the UI before we early-return.
    this.outerForm.markAllAsTouched();
    this.cdf.markAllAsTouched();

    // Need a bound task to submit against; otherwise the route is mis-wired.
    const task = this.task();
    if (!task) return;

    // Snapshot all the values that drive the dispatch decision below.
    const target = this.targetStatus();
    const customData = this.cdf.normalize();
    const nextUserId = this.outerForm.controls.nextAssignedUserId.value;
    // `null` target means in-place — for the change-detection check we treat that as "current status".
    const intentTarget = target ?? task.status;
    // Deep-compare via the controller — detects status, assignee, or customData drift.
    const dataChanged = this.cdf.hasChanges(task, intentTarget, customData, nextUserId);
    // In-place when user selected "current" pill OR explicitly picked the same numeric status.
    const isInPlace = target === null || target === task.status;

    // No-op short circuit: in-place with no actual changes → friendly toast, no dialog.
    if (isInPlace && !dataChanged) {
      this.toasts.info('No changes to save.', 'Nothing to update');
      return;
    }
    // Assignee is required — bail early if invalid (touched call above lights up the error).
    if (this.outerForm.controls.nextAssignedUserId.invalid) return;
    // Custom-data form must pass client-side validators before we surface a confirm.
    if (this.cdf.isInvalid()) return;
    // In-place path uses a distinct confirm wording.
    if (isInPlace) {
      this.dialog.open('in-place');
      return;
    }
    // Final client-side workflow check — server still has final word, but no point surfacing a dialog if obviously invalid.
    if (!this.workflowCheck().ok) return;
    // Direction picks the dialog variant: backward needs stronger confirm copy.
    this.dialog.open(this.targetIsBackward() ? 'backward' : 'forward');
  }

  /** Confirm-dialog OK handler — dispatches to the right submit/close path based on which dialog was open. */
  async confirmDialog(): Promise<void> {
    // Which dialog was active — captured BEFORE closing so the switch knows the intent.
    const kind = this.dialog.active();
    if (!kind) return;
    // Close immediately so the dialog doesn't linger during the async submit.
    this.dialog.close();
    switch (kind) {
      case 'forward':
      case 'backward':
        // Both directions hit the same status-change endpoint; engine treats direction internally.
        await this.submit();
        return;
      case 'in-place':
        // Separate endpoint so audit history can record an in-place edit distinct from a status change.
        await this.submitInPlace();
        return;
      case 'close':
        // Close endpoint — server enforces closed-task immutability afterwards.
        await this.closeTask();
        return;
      case 'cancel':
        // User confirmed discarding edits; route back without saving.
        this.routeBack();
        return;
    }
  }

  /** Confirm-dialog Cancel handler — simply closes the dialog and keeps current form state intact. */
  cancelDialog(): void {
    // No state change — we deliberately preserve dirty form values for the user to keep editing.
    this.dialog.close();
  }

  /** Closes the modal by routing back to `/tasks` — `skipLocationChange` keeps the URL stable (frontend.md §5). */
  routeBack(): void {
    // skipLocationChange — URL-stable modal pattern (frontend.md §5 / ADR-10).
    this.router.navigate(['/tasks'], { skipLocationChange: true });
  }

  // ─── Private methods ─────────────────────────────────────────────────────
  /** Clears the per-status form then commits the new target — rebuilding the form is triggered by valueChanges. */
  private commitTarget(status: number | null): void {
    // Clear first so the brief "no form" state lets the rebuild effect run cleanly.
    this.cdf.clear();
    // Set the target control — valueChanges subscription rebuilds the custom-data form via rebuildCustomDataForm.
    this.outerForm.controls.targetStatus.setValue(status);
  }

  /** Asks the controller to rebuild the form; if history carries an assignee preference, pre-fill the outer control. */
  private rebuildCustomDataForm(target: number | null): void {
    // Returns the recommended next assignee (history-driven) or null when no suggestion is available.
    const assigneeFromHistory = this.cdf.rebuild(this.task(), this.taskType(), target);
    if (assigneeFromHistory) {
      // Prefill the assignee control so the user can submit without re-picking.
      this.outerForm.controls.nextAssignedUserId.setValue(assigneeFromHistory);
      // Pristine so the dirty-check above doesn't see this prefill as a user edit.
      this.outerForm.controls.nextAssignedUserId.markAsPristine();
    }
  }

  /** Performs the forward/backward status change via the store; on success toasts and resets the local form. */
  private async submit(): Promise<void> {
    // Need a bound task to operate against.
    const task = this.task();
    if (!task) return;
    // Snapshot raw form values (getRawValue includes disabled controls too — defensive choice).
    const { targetStatus, nextAssignedUserId } = this.outerForm.getRawValue();
    // Store handles list/detail patching + concurrent-modification recovery.
    const result = await this.store.changeStatus(task.id, {
      newStatus: targetStatus as number,
      nextAssignedUserId,
      customData: this.cdf.normalize(),
    });
    // Null result = error (already toasted by the store) — keep the modal open so user can retry.
    if (!result) return;
    // Use the human status name from the presenter for a friendlier toast title.
    const targetName = this.targetStatusName();
    this.toasts.success(
      `Moved to status ${result.status}${targetName ? ' · ' + targetName : ''}.`,
      'Status updated',
    );
    // Reset target back to "current" so the form rebinds to the new persisted status.
    this.targetStatus.set(null);
    // Rebuild against the now-current status so users can keep editing in-place if they want.
    this.rebuildCustomDataForm(null);
  }

  /** In-place save (same status, different assignee or custom-data). Distinct API call so audit history is preserved. */
  private async submitInPlace(): Promise<void> {
    // Same guard as submit() — no bound task means nothing to update.
    const task = this.task();
    if (!task) return;
    // updateStep keeps the status unchanged and records an in-place audit event.
    const result = await this.store.updateStep(task.id, {
      status: task.status,
      assignedUserId: this.outerForm.controls.nextAssignedUserId.value,
      customData: this.cdf.normalize(),
    });
    if (!result) return;
    this.toasts.success('Step data updated.', 'Saved');
    // Same reset pattern as submit() — keeps the modal coherent post-save.
    this.targetStatus.set(null);
    this.rebuildCustomDataForm(null);
  }

  /** Closes the task — server enforces closed-task immutability; we just toast on success. */
  private async closeTask(): Promise<void> {
    // Bound task required to identify which row to close.
    const task = this.task();
    if (!task) return;
    // Close mutation — store updates list + detail cache; we don't reset form because the modal usually closes after.
    const result = await this.store.close(task.id);
    if (result) this.toasts.success('Task marked as closed.', 'Task closed');
  }

  /** Aggregate dirty check across the outer assignee control + the inner per-status form. */
  private isDirty(): boolean {
    // Either side dirty counts — short-circuit on the first match.
    if (this.outerForm.controls.nextAssignedUserId.dirty) return true;
    return this.cdf.isDirty();
  }
}

/** Per-kind toast title: workflow-rule conflicts get their rule name, validation errors get the generic title. */
function errorTitle(err: ApiError): string {
  // 409 path — name the workflow rule when we have one, otherwise treat as concurrency drift.
  if (err.kind === 'conflict') {
    return err.rule && err.rule !== 'concurrent-modification'
      ? `Workflow rule: ${err.rule}`
      : 'Out of sync';
  }
  // Non-conflict errors get domain-specific titles so the toast feels intentional rather than generic.
  return err.kind === 'validation'
    ? 'Some fields need attention'
    : err.kind === 'network'
      ? 'Connection problem'
      : 'We couldn’t update this task';
}
