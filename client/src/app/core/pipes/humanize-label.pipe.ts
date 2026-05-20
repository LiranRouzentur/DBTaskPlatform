import { Pipe, PipeTransform } from '@angular/core';

/**
 * Identifier → display label ("branchName" → "Branch Name") for dynamic-form field titles.
 * Pure pipe — safe to reuse on every change-detection cycle since output depends only on input.
 */
@Pipe({ name: 'humanLabel', standalone: true, pure: true })
export class HumanizeLabelPipe implements PipeTransform {
  /** Returns empty string on null/undefined/blank input so templates can bind without optional chaining. */
  transform(value: string | null | undefined): string {
    // Short-circuit on falsy input — covers null/undefined/'' in one check, lets `{{ x | humanLabel }}` bind safely.
    if (!value) return '';
    // Three-step normalisation: split acronym boundaries, split camelCase, then collapse separators to spaces and trim.
    const cleaned = value
      // ABCDef → ABC Def (handle acronym + word boundary)
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      // camelCase → camel Case
      .replace(/([a-z\d])([A-Z])/g, '$1 $2')
      // snake_case / kebab-case → space-separated
      .replace(/[_-]+/g, ' ')
      .trim();
    // After trimming the input could be all-separators (e.g. "___") and collapse to "" — guard so we don't index charAt(0) on empty.
    if (cleaned.length === 0) return '';

    // Capitalise first letter only — leave the rest of the casing intact (acronyms remain uppercase).
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
}
