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

/** Data-driven form. Renders inputs from bound FieldSpecMetadata; `tick` drives OnPush re-renders. */
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
  private readonly destroyRef = inject(DestroyRef);

  // ─── Inputs ──────────────────────────────────────────────────────────────
  readonly fields = input.required<readonly FieldSpecMetadata[]>();
  readonly form = input.required<FormGroup>();

  // ─── Template constants ──────────────────────────────────────────────────
  protected readonly maxLength = STRING_MAX_LENGTH;

  // ─── Writable Signals ────────────────────────────────────────────────────
  /** Bumped on status/value changes so OnPush re-evaluates inline-error getters. */
  private readonly tick = signal(0);

  // ─── Effects ─────────────────────────────────────────────────────────────
  private readonly _bindFormTick = effect(() => {
    const form = this.form();
    merge(form.statusChanges, form.valueChanges)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.tick.update((n) => n + 1));
  });

  // ─── Public API / UI Actions ─────────────────────────────────────────────
  arrayControls(name: string): FormControl<string>[] {
    const array = this.form().get(name);
    return array instanceof FormArray ? (array.controls as FormControl<string>[]) : [];
  }

  fieldErrors(name: string): readonly string[] {
    this.tick();
    const control = this.form().get(name);
    if (!control || control.untouched || control.valid) return [];
    return collectFieldErrors(control);
  }

  isItemInvalid(name: string, index: number): boolean {
    this.tick();
    const arr = this.form().get(name);
    if (!(arr instanceof FormArray)) return false;
    const ctrl = arr.at(index);
    return !!ctrl && ctrl.invalid && ctrl.touched;
  }

  isControlInvalid(name: string): boolean {
    this.tick();
    const ctrl = this.form().get(name);
    return !!ctrl && ctrl.invalid && ctrl.touched;
  }
}
