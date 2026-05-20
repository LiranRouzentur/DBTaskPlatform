import { Pipe, PipeTransform } from '@angular/core';

/** Identifier → display label ("branchName" → "Branch Name") for dynamic-form field titles. */
@Pipe({ name: 'humanLabel', standalone: true, pure: true })
export class HumanizeLabelPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return '';
    const cleaned = value
      // ABCDef → ABC Def (handle acronym + word boundary)
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      // camelCase → camel Case
      .replace(/([a-z\d])([A-Z])/g, '$1 $2')
      // snake_case / kebab-case → space-separated
      .replace(/[_-]+/g, ' ')
      .trim();
    if (cleaned.length === 0) return '';

    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
}
