import { AbstractControl, FormArray, ValidationErrors } from '@angular/forms';

// Translates validator error keys to display strings. The `server` key carries messages already
// projected from 422 responses; those render verbatim instead of going through the lookup.

/** Maps one control's ValidationErrors bag to messages in stable order (avoids flicker). */
export function formatValidationErrors(errors: ValidationErrors | null): readonly string[] {
  if (!errors) return [];
  const out: string[] = [];
  if (errors['required']) out.push('This field is required.');
  if (errors['invalidType']) {
    const e = errors['invalidType'] as { expected: string };
    out.push(`Must be a ${e.expected}.`);
  }
  if (errors['stringMinLength']) {
    const n = (errors['stringMinLength'] as { required: number }).required;
    out.push(`Must be at least ${n} character${n === 1 ? '' : 's'}.`);
  }
  if (errors['stringMaxLength']) {
    const limit = (errors['stringMaxLength'] as { limit: number }).limit;
    out.push(`Must be at most ${limit} character${limit === 1 ? '' : 's'}.`);
  }
  if (errors['numberMin']) {
    const n = (errors['numberMin'] as { required: number }).required;
    out.push(`Must be at least ${n}.`);
  }
  if (errors['numberMax']) {
    const limit = (errors['numberMax'] as { limit: number }).limit;
    out.push(`Must be at most ${limit}.`);
  }
  if (errors['server']) {
    const serverMessages = errors['server'] as readonly string[];
    out.push(...serverMessages);
  }
  return out;
}

/** Walks a control; FormArray children get `Item N:` prefix to match the server format. */
export function collectFieldErrors(control: AbstractControl): readonly string[] {
  const messages = [...formatValidationErrors(control.errors)];
  if (control instanceof FormArray) {
    control.controls.forEach((child, i) => {
      if (!child.invalid) return;
      for (const m of formatValidationErrors(child.errors)) {
        messages.push(`Item ${i + 1}: ${m}`);
      }
    });
  }
  return messages;
}

