import { Injectable, inject } from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ValidatorFn,
} from '@angular/forms';
import { FieldKind, FieldSpecMetadata } from '../models/task-type-metadata.model';
import { FieldValidators } from './field-validators';

/** Fallback string max — used only if a spec omits its own Max (seeded specs always set one). */
export const STRING_MAX_LENGTH = 150;

/** Builds a typed FormGroup from FieldSpecMetadata: ItemCount=1 → scalar, >1 → fixed-length FormArray.
 *  Per frontend rules §4 the resulting validators are UX hints — server `CustomDataParser` is authoritative.
 *  Per rules §7, this is part of the dynamic-form pipeline that lets new task types work without Angular code. */
@Injectable({ providedIn: 'root' })
export class TaskFormBuilder {
  /** NonNullable builder so String controls default to `''` (not `null`) — matches server's required semantics. */
  private readonly fb = inject(NonNullableFormBuilder);

  /** Entry point: produces a FormGroup keyed by `field.name`, one control per spec. */
  buildCustomDataForm(fields: readonly FieldSpecMetadata[]): FormGroup {
    // Map keyed by field name — matches the server's `customData` payload shape verbatim.
    const controls: Record<string, AbstractControl> = {};
    for (const field of fields) {
      // Dispatch per spec — buildControl picks scalar/array, then per-kind validators.
      controls[field.name] = this.buildControl(field);
    }
    return this.fb.group(controls);
  }

  /** Picks scalar vs FormArray shape from `itemCount`. Arrays are fixed-length (no add/remove UI per rules §4). */
  private buildControl(field: FieldSpecMetadata): AbstractControl {
    if (field.itemCount > 1) {
      // Pre-allocate `itemCount` identical controls — fixed length matches the server's array contract.
      const items: AbstractControl[] = Array.from({ length: field.itemCount }, () =>
        this.buildScalar(field.kind, field.min, field.max),
      );
      return this.fb.array(items);
    }
    // ItemCount === 1 (or 0, defensively): single scalar control, no wrapping FormArray.
    return this.buildScalar(field.kind, field.min, field.max);
  }

  /** Builds one scalar control wired with the validators appropriate to its `StatusFieldKind`. */
  private buildScalar(kind: FieldKind, min: number | null, max: number | null): AbstractControl {
    switch (kind) {
      case 'String':
        // Default '' (nonNullable builder) — matches what `nonEmptyString` validates against.
        return this.fb.control('', this.stringItemValidators(min, max));

      case 'Number':
        // Raw FormControl<number | null> (not nb.control) to preserve the empty-input semantics — see frontend rules §4.
        return new FormControl<number | null>(
          null,
          {
            nonNullable: false,
            validators: this.numberItemValidators(min, max),
          },
        );
    }
  }

  /** Validator chain for String fields — required + max length + optional min length. */
  private stringItemValidators(min: number | null, max: number | null): ValidatorFn[] {
    // Always include required + max length; max falls back to STRING_MAX_LENGTH so unbounded specs still get a sane cap.
    const validators: ValidatorFn[] = [
      FieldValidators.nonEmptyString(),
      FieldValidators.stringMaxLength(max ?? STRING_MAX_LENGTH),
    ];
    // Skip when min is null OR 0 — `nonEmptyString` already covers the >0 case; adding `min=0` would be a no-op.
    if (min != null && min > 0) validators.push(FieldValidators.stringMinLength(min));
    return validators;
  }

  /** Validator chain for Number fields — required-finite + optional min/max bounds. */
  private numberItemValidators(min: number | null, max: number | null): ValidatorFn[] {
    // Required-finite is mandatory; bounds are conditionally appended below.
    const validators: ValidatorFn[] = [FieldValidators.finiteNumber()];
    // Append only when defined — null means "no lower/upper bound in the spec".
    if (min != null) validators.push(FieldValidators.numberMin(min));
    if (max != null) validators.push(FieldValidators.numberMax(max));
    return validators;
  }
}
