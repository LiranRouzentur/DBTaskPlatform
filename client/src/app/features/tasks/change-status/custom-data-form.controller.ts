import { Injectable, inject, signal, untracked } from '@angular/core';
import { FormGroup } from '@angular/forms';

import { ApiError } from '../../../core/models/api-error.model';
import {
  FieldSpecMetadata,
  TaskTypeMetadata,
} from '../../../core/models/task-type-metadata.model';
import { TaskDetail } from '../../../core/models/task.model';
import { deepEqual } from '../../../core/utils/deep-equal';
import { TaskFormBuilder } from '../../../core/validators/task-form-builder.service';

import { ChangeStatusPresenter } from './change-status.presenter';

/**
 * Stateful controller owning the per-status `FormGroup` for the change-status modal. Pure logic unit — the facade
 * delegates here so the FormGroup lifecycle (build / clear / prefill / 422-projection) lives in one place.
 */
@Injectable()
export class CustomDataFormController {
  // ─── Dependencies ────────────────────────────────────────────────────────
  /** Builds a `FormGroup` from `FieldSpecMetadata[]` — scalar for ItemCount=1, fixed-length FormArray for >1. */
  private readonly formBuilder = inject(TaskFormBuilder);
  /** Pure helper for history prefill + normalisation — reused so we don't duplicate the merge logic. */
  private readonly presenter = inject(ChangeStatusPresenter);

  // ─── Writable Signals ────────────────────────────────────────────────────
  /** Field descriptors for the currently-built form; mirrored as a signal so templates re-render on rebuild. */
  readonly fields = signal<readonly FieldSpecMetadata[]>([]);
  /** The currently-bound FormGroup, or null when no status is selected (initial render, after clear). */
  readonly form = signal<FormGroup | null>(null);

  // ─── Public API ──────────────────────────────────────────────────────────
  /**
   * Rebuilds the per-status form for the given target (or current status if target is null). Prefills from history
   * unless the status is retired. Returns the assignee suggestion taken from history (null when none).
   */
  rebuild(
    task: TaskDetail | null,
    type: TaskTypeMetadata | null,
    target: number | null,
  ): number | null {
    // Missing either input → nothing to render; reset to the empty state so the modal shows the skeleton.
    if (!type || !task) {
      this.clear();
      return null;
    }

    // `null` target means "edit current status in place" — same prefill path otherwise.
    const status = target ?? task.status;
    // Look up the StatusDefinition for the chosen status; `fields` will be empty for unknown statuses (defensive).
    const statusDef = type.statuses.find((s) => s.status === status);
    const fields = statusDef?.fields ?? [];
    // Mirror field descriptors into a signal so DynamicFormComponent re-renders the right inputs.
    this.fields.set(fields);

    // Build a FormGroup whose shape matches FieldSpecMetadata[] (scalars + fixed-length FormArrays).
    const form = this.formBuilder.buildCustomDataForm(fields);
    // Retired statuses must NOT be prefilled — the historical data may reference fields no longer in the spec.
    const retired = task.retiredStatuses?.includes(status) ?? false;
    if (!retired) {
      // Prior submission for this status, if any — keyed by status number.
      const history = task.customDataByStatus[status];
      if (history) this.presenter.applyHistoryValues(form, fields, history);
    }
    // Pristine post-prefill so the dirty-check ignores history values as "user edits".
    form.markAsPristine();
    // Publish the new form so the template re-binds to it.
    this.form.set(form);

    // Assignee suggestion: history pick for non-retired statuses, otherwise fall back to the current assignee.
    const assigneeFromHistory =
      (retired ? undefined : task.assigneeByStatus[status]) ?? task.assignedUserId;
    return assigneeFromHistory ?? null;
  }

  /** Resets the controller to "no form bound" — called before installing a freshly-built FormGroup. */
  clear(): void {
    // Drop descriptors so the dynamic-form template renders nothing during the rebuild window.
    this.fields.set([]);
    // Null form signal so isInvalid/isDirty getters short-circuit safely.
    this.form.set(null);
  }

  /** Returns the request-shape `customData` payload for the current form, or `{}` when none is bound. */
  normalize(): Record<string, unknown> {
    // Read current form (null when no status selected).
    const f = this.form();
    // Delegate to the presenter so the normalisation rule (drop empties, keep arrays) lives in one place.
    return f ? this.presenter.normalizeCustomData(f) : {};
  }

  /** Marks every control as touched so error messages light up — invoked right before any submit attempt. */
  markAllAsTouched(): void {
    // Optional chaining — no-op when no form is bound (e.g., before status selection).
    this.form()?.markAllAsTouched();
  }

  /** True when any control fails its client-side validators; submit is gated on this. */
  isInvalid(): boolean {
    // Read current form ref; absent form is treated as "valid" so the outer gating logic stays simple.
    const f = this.form();
    return f != null && f.invalid;
  }

  /** True when the user has modified any field — drives the "discard changes?" prompt. */
  isDirty(): boolean {
    // Same pattern as isInvalid — absent form means "no edits possible".
    const f = this.form();
    return f != null && f.dirty;
  }

  /**
   * Compares the staged payload against the persisted task. Returns true if status changed, assignee changed,
   * or the per-status customData differs (deep-compared). Used to short-circuit "no changes to save" submits.
   */
  hasChanges(
    task: TaskDetail,
    targetStatus: number,
    customData: Record<string, unknown>,
    nextUserId: number,
  ): boolean {
    // Status change → always counts as a real change, no further compare needed.
    if (targetStatus !== task.status) return true;
    // Assignee change → also counts; routed through updateStep on submit.
    if (nextUserId !== task.assignedUserId) return true;
    // Compare the staged customData against history at the current status.
    const currentCustomData = task.customDataByStatus[task.status] ?? {};
    return !deepEqual(customData, currentCustomData);
  }

  /** Projects 422 `fieldErrors` from `ApiError` onto matching controls as `{ server: messages }`. */
  applyServerFieldErrors(err: ApiError): void {
    // Only validation errors carry fieldErrors; other kinds bail out early.
    if (err.kind !== 'validation' || !err.fieldErrors) return;
    // untracked() — we're reading `form` from a callback that may run inside someone else's reactive context.
    const form = untracked(() => this.form());
    if (!form) return;
    for (const [field, messages] of Object.entries(err.fieldErrors)) {
      // Lookup may miss if server validated a field the client doesn't render — skip silently.
      const control = form.get(field);
      // Mark touched so the error message renders immediately (untouched fields hide messages).
      control?.markAsTouched();
      // Project the server messages into a `server` error key so error-collectors can surface them verbatim.
      control?.setErrors({ server: messages as readonly string[] });
    }
  }
}
