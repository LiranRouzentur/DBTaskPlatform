import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { merge } from 'rxjs';

import { FieldSpecMetadata } from '../../core/models/task-type-metadata.model';
import { HumanizeLabelPipe } from '../../core/pipes/humanize-label.pipe';
import { FieldComponent } from '../../core/ui/field/field.component';
import { collectFieldErrors } from '../../core/validators/field-error-messages';
import { STRING_MAX_LENGTH } from '../../core/validators/task-form-builder.service';

/**
 * Data-driven form renderer. Walks `FieldSpecMetadata[]` and dispatches by `Kind` ("String" / "Number" — capitalised
 * to mirror the C# enum). Adding a new task type is data-only; never branch on taskTypeId in this component
 * (extensibility law — see .claude/rules/project.md §3).
 */
@Component({
  selector: 'tp-dynamic-form',
  standalone: true,
  imports: [ReactiveFormsModule, FieldComponent, HumanizeLabelPipe],
  templateUrl: './dynamic-form.component.html',
  styleUrl: './dynamic-form.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DynamicFormComponent {
  // ─── Dependencies ────────────────────────────────────────────────────────
  /** Scoped lifetime hook for the `takeUntilDestroyed` operator below — required from non-constructor contexts. */
  private readonly destroyRef = inject(DestroyRef);

  // ─── Inputs ──────────────────────────────────────────────────────────────
  /** Field descriptors from `GET /api/task-types`; required because the template has nothing useful to render without them. */
  readonly fields = input.required<readonly FieldSpecMetadata[]>();
  /** Externally-built `FormGroup` (owned by `TaskFormBuilder`) — this component only renders, it does not build forms. */
  readonly form = input.required<FormGroup>();

  // ─── Template constants ──────────────────────────────────────────────────
  /** Server-aligned maxLength for String inputs — surfaced to the template so the `maxlength` attribute matches the validator. */
  protected readonly maxLength = STRING_MAX_LENGTH;

  // ─── Writable Signals ────────────────────────────────────────────────────
  /** Increments on every form status/value change to invalidate the error-getter results under OnPush.
   *  Without this, calls like `fieldErrors(name)` would not re-evaluate when the form's internal state changes. */
  private readonly tick = signal(0);

  // ─── Effects ─────────────────────────────────────────────────────────────
  /** Re-subscribes whenever `form` swaps (status switch rebuilds it); each tick re-runs the template error getters. */
  private readonly _bindFormTick = effect(() => {
    const form = this.form();
    merge(form.statusChanges, form.valueChanges)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.tick.update((n) => n + 1));
  });

  // ─── Public API / UI Actions ─────────────────────────────────────────────
  /** Returns the typed child controls for a `FormArray` field (`ItemCount > 1`); empty array for scalar fields. */
  arrayControls(name: string): FormControl<string>[] {
    const array = this.form().get(name);
    return array instanceof FormArray ? (array.controls as FormControl<string>[]) : [];
  }

  /** Collects human messages for a field — returns `[]` until touched to avoid yelling at users on first paint. */
  fieldErrors(name: string): readonly string[] {
    this.tick(); // read the tick so OnPush re-runs this getter on form changes
    const control = this.form().get(name);
    if (!control || control.untouched || control.valid) return [];
    return collectFieldErrors(control);
  }

  /** Per-item invalid flag for a `FormArray` cell — used to apply the error border on a single array input. */
  isItemInvalid(name: string, index: number): boolean {
    this.tick();
    const arr = this.form().get(name);
    if (!(arr instanceof FormArray)) return false;
    const ctrl = arr.at(index);
    return !!ctrl && ctrl.invalid && ctrl.touched;
  }

  /** Per-scalar invalid flag — drives the error styling on a single FormControl input. */
  isControlInvalid(name: string): boolean {
    this.tick();
    const ctrl = this.form().get(name);
    return !!ctrl && ctrl.invalid && ctrl.touched;
  }
}
