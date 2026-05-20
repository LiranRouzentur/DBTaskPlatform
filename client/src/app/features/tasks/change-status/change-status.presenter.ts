import { Injectable } from '@angular/core';
import { FormArray, FormGroup } from '@angular/forms';

import {
  FieldSpecMetadata,
  TaskTypeMetadata,
} from '../../../core/models/task-type-metadata.model';
import { TaskDetail } from '../../../core/models/task.model';
import { WorkflowValidators } from '../../../core/validators/workflow-validators.service';

// Pure presenter — no signals, no subscriptions. Derives status pills, names, and prefill values.
// Workflow gating goes through WorkflowValidators so the UI mirrors the server's rules 1:1.

export type StatusDirection = 'current' | 'backward' | 'forward' | 'invalid';

export interface StatusOptionView {
  readonly status: number;
  readonly name: string;
  readonly direction: StatusDirection;
  readonly disabled: boolean;
  readonly disabledReason: string | null;
  readonly retired: boolean;
}

@Injectable({ providedIn: 'root' })
export class ChangeStatusPresenter {
  buildStatusOptions(
    task: TaskDetail,
    type: TaskTypeMetadata,
  ): readonly StatusOptionView[] {
    return type.statuses.map((s) => {
      const retired = task.retiredStatuses?.includes(s.status) ?? false;
      if (s.status === task.status) {
        return {
          status: s.status,
          name: s.name,
          direction: 'current',
          disabled: false,
          disabledReason: null,
          retired,
        };
      }
      const check = WorkflowValidators.canChangeStatus(task, s.status, type);
      if (check.ok) {
        return {
          status: s.status,
          name: s.name,
          direction: s.status > task.status ? 'forward' : 'backward',
          disabled: false,
          disabledReason: null,
          retired,
        };
      }
      return {
        status: s.status,
        name: s.name,
        direction: 'invalid',
        disabled: true,
        disabledReason: check.message ?? null,
        retired,
      };
    });
  }

  statusName(status: number | null, type: TaskTypeMetadata | null): string {
    if (status === null || !type) return '';
    return type.statuses.find((s) => s.status === status)?.name ?? `Status ${status}`;
  }

  applyHistoryValues(
    form: FormGroup,
    fields: readonly FieldSpecMetadata[],
    history: Readonly<Record<string, unknown>>,
  ): void {
    for (const field of fields) {
      const raw = history[field.name];
      if (raw === undefined || raw === null) continue;
      const control = form.get(field.name);
      if (!control) continue;

      if (field.itemCount > 1 && control instanceof FormArray) {
        const items = Array.isArray(raw) ? raw : [];
        for (let i = 0; i < control.length; i++) {
          const item = items[i];
          if (item === undefined || item === null) {
            control.at(i)?.reset(field.kind === 'Number' ? null : '');
            continue;
          }
          control.at(i)?.setValue(
            field.kind === 'Number'
              ? typeof item === 'number'
                ? item
                : Number(item)
              : typeof item === 'string'
                ? item
                : String(item),
          );
        }
        continue;
      }
      control.setValue(raw as never);
    }
  }

  normalizeCustomData(form: FormGroup): Record<string, unknown> {
    const raw = form.getRawValue() as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (Array.isArray(value)) {
        out[key] = value;
        continue;
      }
      if (value === '' || value === null) continue;
      out[key] = value;
    }
    return out;
  }
}
