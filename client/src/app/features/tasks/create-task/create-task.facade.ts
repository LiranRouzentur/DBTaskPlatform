import { Injectable, computed, inject } from '@angular/core';
import { NonNullableFormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { ToastService } from '../../../core/services/toast.service';
import { DISCARD_CHANGES_COPY } from '../../../core/ui/confirm-modal/discard-changes.copy';
import { DialogState } from '../../../core/utils/dialog-state';
import { formSignal, formStatusSignal, setControl } from '../../../core/utils/form-helpers';
import { bindStoreErrorToast, defaultErrorTitle } from '../../../core/utils/store-error-toast';
import { TasksStore } from '../../../state/tasks.store';

/** Which confirm dialog is currently open inside the create-task modal. */
export type ActiveCreateTaskDialog = 'create' | 'cancel';

/**
 * Facade for the create-task modal. Owns the type/assignee form, the discard-changes guard, and the call to
 * `TasksStore.create`. On success it navigates straight to the change-status modal for the new task — both
 * navigations use `skipLocationChange: true` per frontend.md §5.
 */
@Injectable()
export class CreateTaskFacade {
  // ─── Dependencies ────────────────────────────────────────────────────────
  /** Shared signal-store — only `create()` is invoked here; 422 fieldErrors fall through to the toast/error pipeline. */
  private readonly store = inject(TasksStore);
  /** Typed form-builder for the non-nullable type/assignee selectors. */
  private readonly fb = inject(NonNullableFormBuilder);
  /** Drives modal open/close + the post-create redirect; both call `navigate(..., { skipLocationChange: true })`. */
  private readonly router = inject(Router);
  /** Surfaces transient success toasts on creation; error toasts are bound via `bindStoreErrorToast`. */
  private readonly toasts = inject(ToastService);

  // ─── Template constants ──────────────────────────────────────────────────
  /** Alias used by the template so it doesn't need a separate TasksStore injection. */
  readonly storeRef = this.store;
  /** Shared copy block for the discard-changes confirm dialog. */
  readonly discard = DISCARD_CHANGES_COPY;
  /** Tiny state machine — open/cancel dialog tracking lives here instead of two booleans. */
  readonly dialog = new DialogState<ActiveCreateTaskDialog>();

  // ─── Forms ───────────────────────────────────────────────────────────────
  /** Outer form — type picker + initial assignee. Defaults to the first type and the current-user filter when set. */
  readonly form = this.fb.group({
    taskTypeId: this.fb.control<number>(
      this.store.taskTypes()[0]?.id ?? 0,
      [Validators.required, Validators.min(1)],
    ),
    initialAssignedUserId: this.fb.control<number>(
      this.store.currentUserId() ?? this.store.users()[0]?.id ?? 0,
      [Validators.required, Validators.min(1)],
    ),
  });

  // ─── Observable → Signal Bridges ─────────────────────────────────────────
  /** Reactive view of the type-picker value — feeds the "selected type" computed below. */
  private readonly taskTypeIdValue = formSignal(this.form.controls.taskTypeId);
  /** Reactive view of the assignee-picker value — feeds the "selected assignee" computed below. */
  private readonly assigneeIdValue = formSignal(this.form.controls.initialAssignedUserId);
  /** Reactive form status (VALID/INVALID/PENDING) — drives the submit-enabled computed. */
  private readonly formStatus = formStatusSignal(this.form);

  // ─── Computed ────────────────────────────────────────────────────────────
  /** Convenience signal for templates to read the chosen task-type id. */
  readonly selectedTypeId = computed(() => this.taskTypeIdValue());
  /** Convenience signal for templates to read the chosen initial-assignee user id. */
  readonly selectedAssigneeId = computed(() => this.assigneeIdValue());

  /** Human label of the selected task type — empty string when metadata is missing (avoids template undefineds). */
  readonly selectedTypeName = computed(
    () => this.store.taskTypeById().get(this.selectedTypeId())?.name ?? '',
  );

  /** Display name of the selected assignee — empty string when user-by-id lookup misses. */
  readonly selectedAssigneeName = computed(
    () => this.store.userById().get(this.selectedAssigneeId())?.fullName ?? '',
  );

  /** Submit gating — both the form must be valid and the store must not be busy on a previous request. */
  readonly canSubmit = computed(
    () => this.formStatus() === 'VALID' && !this.store.loading(),
  );

  // ─── Lifecycle ───────────────────────────────────────────────────────────
  constructor() {
    // Subscribe once to surface non-422 errors. The store.create() path turns off auto-toasts for 422 so
    // field errors can be projected onto the form, but we still want generic failures toasted here.
    bindStoreErrorToast(this.store, defaultErrorTitle('We couldn’t create that task'));
  }

  // ─── Public API / UI Actions ─────────────────────────────────────────────
  /** Type-picker click handler — routed through `setControl` for typed safety + dirty tracking. */
  pickType(id: number): void {
    // Centralised setter handles markAsDirty + emit semantics so behavior stays consistent across pickers.
    setControl(this.form.controls.taskTypeId, id);
  }

  /** Assignee-picker click handler — same pattern as `pickType`. */
  pickAssignee(id: number): void {
    // Same helper — both pickers share the dirty-tracking contract.
    setControl(this.form.controls.initialAssignedUserId, id);
  }

  /** Submit click. Opens the "create?" confirm dialog when the form is valid, else marks-touched to show errors. */
  onSubmit(): void {
    // Gating uses canSubmit so loading state also blocks (double-click guard).
    if (!this.canSubmit()) {
      // Make errors visible if the user clicked submit on a pristine-invalid form.
      this.form.markAllAsTouched();
      return;
    }
    // Open the create-confirm; actual API call happens after the user confirms.
    this.dialog.open('create');
  }

  /** Cancel button — prompt for discard if dirty, otherwise route back immediately. */
  requestCancel(): void {
    // Prompt only when there's something to lose — keeps clean cancels frictionless.
    if (this.form.dirty) {
      this.dialog.open('cancel');
      return;
    }
    // No edits to lose — route back immediately.
    this.routeBack();
  }

  /** Confirm-dialog OK handler — dispatches based on which dialog was open. */
  async confirmDialog(): Promise<void> {
    // Capture intent BEFORE closing the dialog so the dispatch below knows which branch to take.
    const kind = this.dialog.active();
    // Close immediately so the dialog doesn't linger during the async create call.
    this.dialog.close();
    if (kind === 'create') {
      // Async path — drives the network call and post-success redirect.
      await this.executeCreate();
    } else if (kind === 'cancel') {
      // User confirmed discarding edits — route back without saving.
      this.routeBack();
    }
  }

  /** Confirm-dialog Cancel handler — close the dialog and keep state. */
  cancelDialog(): void {
    // No state change — preserve form values so the user can continue editing.
    this.dialog.close();
  }

  /** Closes the modal by routing back to `/tasks` — `skipLocationChange` keeps the URL stable (frontend.md §5). */
  routeBack(): void {
    // skipLocationChange — URL-stable modal pattern (frontend.md §5 / ADR-10).
    this.router.navigate(['/tasks'], { skipLocationChange: true });
  }

  // ─── Private methods ─────────────────────────────────────────────────────
  /** Actual creation + redirect. On success we deep-link straight into the change-status modal for the new id. */
  private async executeCreate(): Promise<void> {
    // Snapshot raw form values — includes disabled controls (defensive for future flows).
    const value = this.form.getRawValue();
    // Store handles list patching + detail cache; 422 fieldErrors flow back through bindStoreErrorToast's callback.
    const result = await this.store.create({
      taskTypeId: value.taskTypeId,
      initialAssignedUserId: value.initialAssignedUserId,
    });
    // Null result = error (already toasted) — keep modal open so the user can retry.
    if (!result) return;
    // Look up the user object so the toast can name them; fall back to a generic word if missing.
    const assigneeName =
      this.store.userById().get(value.initialAssignedUserId)?.fullName ?? 'assignee';
    this.toasts.success(`Created and assigned to ${assigneeName}.`, 'Task created');
    // Deep-link into the change-status modal for the freshly-created task; skipLocationChange keeps URL stable.
    this.router.navigate(['/tasks', result.id, 'change-status'], {
      skipLocationChange: true,
    });
  }
}
