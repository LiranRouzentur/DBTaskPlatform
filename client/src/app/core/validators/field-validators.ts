import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Validator factories mirroring the server's per-spec rules. Keys read by field-error-messages.ts. */
export const FieldValidators = {

  nonEmptyString(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value;
      if (value === null || value === undefined) return { required: true };
      if (typeof value !== 'string') return { invalidType: { expected: 'string' } };
      if (value.trim() === '') return { required: true };
      return null;
    };
  },

  finiteNumber(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value;
      if (value === null || value === undefined || value === '') return { required: true };
      const n = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(n)) return { invalidType: { expected: 'number' } };
      return null;
    };
  },

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

  stringMinLength(min: number): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value;
      if (typeof value !== 'string') return null;
      
      if (value.length === 0) return null;
      if (value.length < min) {
        return { stringMinLength: { required: min, actual: value.length } };
      }
      return null;
    };
  },

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
