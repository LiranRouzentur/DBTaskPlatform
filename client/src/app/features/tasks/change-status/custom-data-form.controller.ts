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

/** Per-status dynamic form lifecycle: rebuild, history prefill, 422 projection, hasChanges. */
@Injectable()
export class CustomDataFormController {
  // ─── Dependencies ────────────────────────────────────────────────────────
  private readonly formBuilder = inject(TaskFormBuilder);
  private readonly presenter = inject(ChangeStatusPresenter);

  // ─── Writable Signals ────────────────────────────────────────────────────
  readonly fields = signal<readonly FieldSpecMetadata[]>([]);
  readonly form = signal<FormGroup | null>(null);

  // ─── Public API ──────────────────────────────────────────────────────────
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

  clear(): void {
    this.fields.set([]);
    this.form.set(null);
  }

  normalize(): Record<string, unknown> {
    const f = this.form();
    return f ? this.presenter.normalizeCustomData(f) : {};
  }

  markAllAsTouched(): void {
    this.form()?.markAllAsTouched();
  }

  isInvalid(): boolean {
    const f = this.form();
    return f != null && f.invalid;
  }

  isDirty(): boolean {
    const f = this.form();
    return f != null && f.dirty;
  }

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

  applyServerFieldErrors(err: ApiError): void {
    if (err.kind !== 'validation' || !err.fieldErrors) return;
    const form = untracked(() => this.form());
    if (!form) return;
    for (const [field, messages] of Object.entries(err.fieldErrors)) {
      const control = form.get(field);
      control?.markAsTouched();
      control?.setErrors({ server: messages as readonly string[] });
    }
  }
}
