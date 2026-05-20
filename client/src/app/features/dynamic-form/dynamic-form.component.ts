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
    // Read the current FormGroup signal — the effect re-runs whenever the facade swaps the form instance.
    const form = this.form();
    // Merge both status (VALID/INVALID/PENDING) and value streams — either can flip touched/invalid getters.
    merge(form.statusChanges, form.valueChanges)
      // takeUntilDestroyed cleans up the prior subscription when the component dies OR when this effect re-runs.
      .pipe(takeUntilDestroyed(this.destroyRef))
      // Bump the tick signal so any computed/template binding that reads `tick()` recomputes under OnPush.
      .subscribe(() => this.tick.update((n) => n + 1));
  });

  // ─── Public API / UI Actions ─────────────────────────────────────────────
  /** Returns the typed child controls for a `FormArray` field (`ItemCount > 1`); empty array for scalar fields. */
  arrayControls(name: string): FormControl<string>[] {
    // Look up by name — may be a FormArray (ItemCount > 1) or a scalar FormControl (ItemCount == 1).
    const array = this.form().get(name);
    // Only FormArrays expose `.controls`; scalar fields fall through to the empty array (template skips the *ngFor).
    return array instanceof FormArray ? (array.controls as FormControl<string>[]) : [];
  }

  /** Collects human messages for a field — returns `[]` until touched to avoid yelling at users on first paint. */
  fieldErrors(name: string): readonly string[] {
    this.tick(); // read the tick so OnPush re-runs this getter on form changes
    // Look up the field by descriptor name (matches FieldSpecMetadata.name).
    const control = this.form().get(name);
    // Suppress messages while pristine/valid — UX rule: only nag after the user has interacted with the field.
    if (!control || control.untouched || control.valid) return [];
    return collectFieldErrors(control);
  }

  /** Per-item invalid flag for a `FormArray` cell — used to apply the error border on a single array input. */
  isItemInvalid(name: string, index: number): boolean {
    this.tick();
    // Resolve by name — bail out if the field is scalar; the template should not be calling us for scalars.
    const arr = this.form().get(name);
    if (!(arr instanceof FormArray)) return false;
    // Look up the specific FormControl at the requested index.
    const ctrl = arr.at(index);
    // Show invalid styling only after touch so first-paint stays neutral.
    return !!ctrl && ctrl.invalid && ctrl.touched;
  }

  /** Per-scalar invalid flag — drives the error styling on a single FormControl input. */
  isControlInvalid(name: string): boolean {
    this.tick();
    // Scalar lookup — same touch-gated rule as `isItemInvalid` for consistent UX.
    const ctrl = this.form().get(name);
    return !!ctrl && ctrl.invalid && ctrl.touched;
  }
}
