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
    if (!type || !task) {
      this.clear();
      return null;
    }

    const status = target ?? task.status;
    const statusDef = type.statuses.find((s) => s.status === status);
    const fields = statusDef?.fields ?? [];
    this.fields.set(fields);

    const form = this.formBuilder.buildCustomDataForm(fields);
    const retired = task.retiredStatuses?.includes(status) ?? false;
    if (!retired) {
      const history = task.customDataByStatus[status];
      if (history) this.presenter.applyHistoryValues(form, fields, history);
    }
    form.markAsPristine();
    this.form.set(form);

    const assigneeFromHistory =
      (retired ? undefined : task.assigneeByStatus[status]) ?? task.assignedUserId;
    return assigneeFromHistory ?? null;
  }

  /** Resets the controller to "no form bound" — called before installing a freshly-built FormGroup. */
  clear(): void {
    this.fields.set([]);
    this.form.set(null);
  }

  /** Returns the request-shape `customData` payload for the current form, or `{}` when none is bound. */
  normalize(): Record<string, unknown> {
    const f = this.form();
    return f ? this.presenter.normalizeCustomData(f) : {};
  }

  /** Marks every control as touched so error messages light up — invoked right before any submit attempt. */
  markAllAsTouched(): void {
    this.form()?.markAllAsTouched();
  }

  /** True when any control fails its client-side validators; submit is gated on this. */
  isInvalid(): boolean {
    const f = this.form();
    return f != null && f.invalid;
  }

  /** True when the user has modified any field — drives the "discard changes?" prompt. */
  isDirty(): boolean {
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
    if (targetStatus !== task.status) return true;
    if (nextUserId !== task.assignedUserId) return true;
    const currentCustomData = task.customDataByStatus[task.status] ?? {};
    return !deepEqual(customData, currentCustomData);
  }

  /** Projects 422 `fieldErrors` from `ApiError` onto matching controls as `{ server: messages }`. */
  applyServerFieldErrors(err: ApiError): void {
    if (err.kind !== 'validation' || !err.fieldErrors) return;
    // untracked() — we're reading `form` from a callback that may run inside someone else's reactive context.
    const form = untracked(() => this.form());
    if (!form) return;
    for (const [field, messages] of Object.entries(err.fieldErrors)) {
      const control = form.get(field);
      control?.markAsTouched();
      control?.setErrors({ server: messages as readonly string[] });
    }
  }
}
