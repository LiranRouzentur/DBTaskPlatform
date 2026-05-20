import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Validator factories mirroring the server's per-spec rules. Keys read by field-error-messages.ts.
 *  Per frontend rules §4: these are UX hints — `CustomDataParser` on the server is authoritative.
 *  Length/range validators short-circuit on empty/wrong-type so `required` / `invalidType` aren't double-reported. */
export const FieldValidators = {

  /** Required + must be a non-blank string. Used as the base validator for every String field. */
  nonEmptyString(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value;
      if (value === null || value === undefined) return { required: true };
      if (typeof value !== 'string') return { invalidType: { expected: 'string' } };
      if (value.trim() === '') return { required: true };
      return null;
    };
  },

  /** Required + must coerce to a finite number. Used as the base validator for every Number field. */
  finiteNumber(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value;
      if (value === null || value === undefined || value === '') return { required: true };
      const n = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(n)) return { invalidType: { expected: 'number' } };
      return null;
    };
  },

  /** Caps string length. Skips non-strings — `nonEmptyString` already reported the type error. */
  stringMaxLength(max: number): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value;
      if (typeof value !== 'string') return null;
      if (value.length > max) {
        return { stringMaxLength: { limit: max, actual: value.length } };
      }
      return null;
    };
  },

  /** Enforces minimum string length. Skips empty so `nonEmptyString` owns the "required" message. */
  stringMinLength(min: number): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value;
      if (typeof value !== 'string') return null;
      // Empty handled by nonEmptyString — bail to avoid stacking two messages on a single control.
      if (value.length === 0) return null;
      if (value.length < min) {
        return { stringMinLength: { required: min, actual: value.length } };
      }
      return null;
    };
  },

  /** Lower-bound check for numbers; skips empty/non-finite so `finiteNumber` owns those errors. */
  numberMin(min: number): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value;
      if (value === null || value === undefined || value === '') return null;
      const n = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(n)) return null;
      if (n < min) return { numberMin: { required: min, actual: n } };
      return null;
    };
  },

  /** Upper-bound check for numbers; symmetric to numberMin in skip semantics. */
  numberMax(max: number): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value;
      if (value === null || value === undefined || value === '') return null;
      const n = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(n)) return null;
      if (n > max) return { numberMax: { limit: max, actual: n } };
      return null;
    };
  },
};
