import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Validator factories mirroring the server's per-spec rules. Keys read by field-error-messages.ts.
 *  Per frontend rules §4: these are UX hints — `CustomDataParser` on the server is authoritative.
 *  Length/range validators short-circuit on empty/wrong-type so `required` / `invalidType` aren't double-reported. */
export const FieldValidators = {

  /** Required + must be a non-blank string. Used as the base validator for every String field. */
  nonEmptyString(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      // Cache once — read repeatedly below and `control.value` can be an accessor on typed forms.
      const value = control.value;
      // null/undefined = field never touched OR explicitly cleared — same outcome: required violation.
      if (value === null || value === undefined) return { required: true };
      // Wrong-type guard: surface a typed error so the message layer can render "Must be a string."
      if (typeof value !== 'string') return { invalidType: { expected: 'string' } };
      // Whitespace-only counts as empty — the server's `CustomDataParser` rejects it too.
      if (value.trim() === '') return { required: true };
      // No error — `null` is Angular's "valid" sentinel.
      return null;
    };
  },

  /** Required + must coerce to a finite number. Used as the base validator for every Number field. */
  finiteNumber(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value;
      // Empty string is the cleared-input state for `<input type="number">`; treat as required.
      if (value === null || value === undefined || value === '') return { required: true };
      // Accept already-numeric values; otherwise coerce strings — mirrors how the server parses `JsonElement`.
      const n = typeof value === 'number' ? value : Number(value);
      // NaN/Infinity rejected — server enforces finite as well.
      if (!Number.isFinite(n)) return { invalidType: { expected: 'number' } };
      return null;
    };
  },

  /** Caps string length. Skips non-strings — `nonEmptyString` already reported the type error. */
  stringMaxLength(max: number): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value;
      // Non-string → defer to `nonEmptyString`'s `invalidType`; don't double-report on one control.
      if (typeof value !== 'string') return null;
      if (value.length > max) {
        // Carry `actual` so error UIs (or future tooltips) can show current vs limit.
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
        // `required` key here is the *threshold*, not the required-validator concept — naming matches the error renderer.
        return { stringMinLength: { required: min, actual: value.length } };
      }
      return null;
    };
  },

  /** Lower-bound check for numbers; skips empty/non-finite so `finiteNumber` owns those errors. */
  numberMin(min: number): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value;
      // Empty → `finiteNumber` will (or has already) emit `required`; skip to avoid stacking.
      if (value === null || value === undefined || value === '') return null;
      const n = typeof value === 'number' ? value : Number(value);
      // Non-finite → `finiteNumber` owns the `invalidType` error; don't double-report.
      if (!Number.isFinite(n)) return null;
      if (n < min) return { numberMin: { required: min, actual: n } };
      return null;
    };
  },

  /** Upper-bound check for numbers; symmetric to numberMin in skip semantics. */
  numberMax(max: number): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value;
      // Same empty-skip rationale as `numberMin` — defer required/type errors to `finiteNumber`.
      if (value === null || value === undefined || value === '') return null;
      const n = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(n)) return null;
      if (n > max) return { numberMax: { limit: max, actual: n } };
      return null;
    };
  },
};
