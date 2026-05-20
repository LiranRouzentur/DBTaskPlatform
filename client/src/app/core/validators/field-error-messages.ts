import { AbstractControl, FormArray, ValidationErrors } from '@angular/forms';

// Translates validator error keys to display strings. The `server` key carries messages already
// projected from 422 responses; those render verbatim instead of going through the lookup.
// Per frontend rules §4: these are UX hints — the server is the source of truth for validation.

/** Maps one control's ValidationErrors bag to messages in stable order (avoids flicker on re-render).
 *  Order matches the order of `if` branches below; new error keys must be appended deterministically. */
export function formatValidationErrors(errors: ValidationErrors | null): readonly string[] {
  // Null errors bag = valid control; return the shared empty literal so callers can safely spread.
  if (!errors) return [];
  // Accumulator built in stable order — each branch appends, preserving the declared sequence below.
  const out: string[] = [];
  // `required` is intentionally first so it always heads the list when stacked with type / length errors.
  if (errors['required']) out.push('This field is required.');
  if (errors['invalidType']) {
    // Narrow the bag payload — validator-factory contract guarantees this shape.
    const e = errors['invalidType'] as { expected: string };
    out.push(`Must be a ${e.expected}.`);
  }
  if (errors['stringMinLength']) {
    // Validator stores the threshold under `required`; pull it out for the user-facing message.
    const n = (errors['stringMinLength'] as { required: number }).required;
    // Singular/plural switch — minor polish so "Must be at least 1 character." reads correctly.
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
    // `server` messages come from a 422 ProblemDetails projection — already user-ready, render verbatim.
    const serverMessages = errors['server'] as readonly string[];
    // Spread keeps insertion order so multiple server messages don't get reshuffled with local ones.
    out.push(...serverMessages);
  }
  return out;
}

/** Walks a control; FormArray children get `Item N:` prefix to match the server format.
 *  Used by `<tp-field>` to render per-control error lists for both scalar and array fields. */
export function collectFieldErrors(control: AbstractControl): readonly string[] {
  // Start with the parent control's own errors (scalar or array-level) — children layer on top.
  const messages = [...formatValidationErrors(control.errors)];
  if (control instanceof FormArray) {
    control.controls.forEach((child, i) => {
      // Skip valid children — only invalid ones contribute messages.
      if (!child.invalid) return;
      for (const m of formatValidationErrors(child.errors)) {
        // 1-based `Item N:` prefix mirrors the server's `customData[N]` error shape; users see consistent numbering.
        messages.push(`Item ${i + 1}: ${m}`);
      }
    });
  }
  return messages;
}

