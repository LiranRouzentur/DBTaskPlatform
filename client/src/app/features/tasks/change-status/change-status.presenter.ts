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

/** Direction of a candidate status relative to the task's current status — drives pill styling. */
export type StatusDirection = 'current' | 'backward' | 'forward' | 'invalid';

/** View-model for a single status pill in the change-status stepper. */
export interface StatusOptionView {
  /** Numeric status from the C# `StatusDefinition`. */
  readonly status: number;
  /** Human-readable status name (e.g. "In review"). */
  readonly name: string;
  /** Position relative to the task's current status — current/backward/forward/invalid. */
  readonly direction: StatusDirection;
  /** True when the workflow rules say the user can't move here from the current status. */
  readonly disabled: boolean;
  /** Server-aligned reason for the disabled state (e.g. "no-forward-skip") shown as a tooltip. */
  readonly disabledReason: string | null;
  /** True when the task previously visited this status but it has since been retired in the type definition. */
  readonly retired: boolean;
}

/** Pure derivations shared by the change-status facade. Never injected into multiple stateful collaborators. */
@Injectable({ providedIn: 'root' })
export class ChangeStatusPresenter {
  /** Builds one StatusOptionView per defined status — the engine's rules are the source of truth via WorkflowValidators. */
  buildStatusOptions(
    task: TaskDetail,
    type: TaskTypeMetadata,
  ): readonly StatusOptionView[] {
    return type.statuses.map((s) => {
      // Retired = previously visited but no longer in the type definition; rendered with a dimmer style.
      const retired = task.retiredStatuses?.includes(s.status) ?? false;
      // "Current" branch — distinct from forward/backward so the stepper can render it differently.
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
      // Delegate gating to WorkflowValidators so the UI mirrors the engine's allowed transitions exactly.
      const check = WorkflowValidators.canChangeStatus(task, s.status, type);
      if (check.ok) {
        return {
          status: s.status,
          name: s.name,
          // Direction is decided by numeric comparison — the engine doesn't distinguish but the UI styles them.
          direction: s.status > task.status ? 'forward' : 'backward',
          disabled: false,
          disabledReason: null,
          retired,
        };
      }
      // Disabled branch — surface the rule message as a tooltip so users understand why the pill is greyed out.
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

  /** Resolves a status number to its human name; falls back to `"Status N"` to keep templates safe before metadata loads. */
  statusName(status: number | null, type: TaskTypeMetadata | null): string {
    // Either input missing → empty string (templates treat that as "render nothing").
    if (status === null || !type) return '';
    // Fallback `Status N` covers the race where metadata exists but doesn't yet contain this status (rare; defensive).
    return type.statuses.find((s) => s.status === status)?.name ?? `Status ${status}`;
  }

  /** Prefills `form` from the task's per-status `customDataByStatus` history; preserves FormArray length per ItemCount. */
  applyHistoryValues(
    form: FormGroup,
    fields: readonly FieldSpecMetadata[],
    history: Readonly<Record<string, unknown>>,
  ): void {
    for (const field of fields) {
      // History value for this field — undefined/null means "nothing to prefill", keep the form default.
      const raw = history[field.name];
      if (raw === undefined || raw === null) continue;
      // Look up the FormGroup child by descriptor name.
      const control = form.get(field.name);
      if (!control) continue;

      // FormArray path — iterate fixed-length and prefill each cell. Fixed length comes from ItemCount.
      if (field.itemCount > 1 && control instanceof FormArray) {
        // Normalise to array — history may be malformed if the spec changed between versions.
        const items = Array.isArray(raw) ? raw : [];
        for (let i = 0; i < control.length; i++) {
          // Per-cell history value (may be missing if history was saved before the cell existed).
          const item = items[i];
          if (item === undefined || item === null) {
            // Reset with the kind-appropriate empty value so validators see "no entry" rather than `undefined`.
            control.at(i)?.reset(field.kind === 'Number' ? null : '');
            continue;
          }
          // Coerce per Kind so the FormControl receives the correct primitive type.
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
      // Scalar path — `as never` because FormGroup.get returns a loose AbstractControl, we know the kind matches.
      control.setValue(raw as never);
    }
  }

  /** Converts a form's raw value to the request payload — keeps arrays verbatim, drops empty scalars so the server sees omissions. */
  normalizeCustomData(form: FormGroup): Record<string, unknown> {
    // getRawValue includes disabled controls — important if a future flow disables fields based on permissions.
    const raw = form.getRawValue() as Record<string, unknown>;
    // Build a fresh object so callers can mutate the result without touching the form snapshot.
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      // Arrays pass through verbatim — server treats them as fixed-length per ItemCount and re-validates.
      if (Array.isArray(value)) {
        out[key] = value;
        continue;
      }
      // Drop empty scalars so the JSON omits the field entirely (server then applies "missing" semantics).
      if (value === '' || value === null) continue;
      out[key] = value;
    }
    return out;
  }
}
