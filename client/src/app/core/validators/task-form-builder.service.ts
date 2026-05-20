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

// Fallback string max — used only if a spec omits its own Max (seeded specs always set one).
export const STRING_MAX_LENGTH = 150;

/** Builds a typed FormGroup from FieldSpecMetadata: ItemCount=1 → scalar, >1 → FormArray. */
@Injectable({ providedIn: 'root' })
export class TaskFormBuilder {
  private readonly fb = inject(NonNullableFormBuilder);

  buildCustomDataForm(fields: readonly FieldSpecMetadata[]): FormGroup {
    const controls: Record<string, AbstractControl> = {};
    for (const field of fields) {
      controls[field.name] = this.buildControl(field);
    }
    return this.fb.group(controls);
  }

  private buildControl(field: FieldSpecMetadata): AbstractControl {
    if (field.itemCount > 1) {
      const items: AbstractControl[] = Array.from({ length: field.itemCount }, () =>
        this.buildScalar(field.kind, field.min, field.max),
      );
      return this.fb.array(items);
    }
    return this.buildScalar(field.kind, field.min, field.max);
  }

  private buildScalar(kind: FieldKind, min: number | null, max: number | null): AbstractControl {
    switch (kind) {
      case 'String':
        return this.fb.control('', this.stringItemValidators(min, max));

      case 'Number':
        
        return new FormControl<number | null>(
          null,
          {
            nonNullable: false,
            validators: this.numberItemValidators(min, max),
          },
        );
    }
  }

  private stringItemValidators(min: number | null, max: number | null): ValidatorFn[] {
    const validators: ValidatorFn[] = [
      FieldValidators.nonEmptyString(),
      FieldValidators.stringMaxLength(max ?? STRING_MAX_LENGTH),
    ];
    if (min != null && min > 0) validators.push(FieldValidators.stringMinLength(min));
    return validators;
  }

  private numberItemValidators(min: number | null, max: number | null): ValidatorFn[] {
    const validators: ValidatorFn[] = [FieldValidators.finiteNumber()];
    if (min != null) validators.push(FieldValidators.numberMin(min));
    if (max != null) validators.push(FieldValidators.numberMax(max));
    return validators;
  }
}
