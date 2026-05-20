import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'tp-field',
  standalone: true,
  template: `
    @if (label()) {
      <label class="lbl" [attr.for]="controlId()">
        <span>{{ label() }}</span>
        @if (required() && showRequiredMarker()) {
          <span class="req" aria-label="required">*</span>
        }
      </label>
    }
    <div class="control"><ng-content /></div>
    @if (hint() && (!errors() || errors()!.length === 0)) {
      <small class="hint">{{ hint() }}</small>
    }
    @if (errors() && errors()!.length > 0) {
      <ul class="errors">
        @for (msg of errors(); track msg) {
          <li>{{ msg }}</li>
        }
      </ul>
    }
  `,
  styleUrl: './field.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.has-error]': 'hasError()',
  },
})
/** Form-field wrapper: label + projected control + hint or errors. Single source of truth for field layout. */
export class FieldComponent {
  /** Visible label rendered above the control. When omitted, no label element is emitted (useful for grouped controls). */
  readonly label = input<string | null>(null);
  /** Help text shown below the control — suppressed automatically once `errors` is non-empty. */
  readonly hint = input<string | null>(null);
  /** Mark the control as required in the underlying form model — does not by itself draw the asterisk. */
  readonly required = input<boolean>(false);

  /** Opt-in asterisk next to the label; kept separate from `required` so callers can suppress the marker visually. */
  readonly showRequiredMarker = input<boolean>(false);
  /** id of the projected control — bound to `<label for>` for screen readers and click-to-focus. */
  readonly controlId = input<string | null>(null);
  /** Error messages to render — null/empty hides the list and lets the hint show through. */
  readonly errors = input<readonly string[] | null>(null);

  /** True iff at least one error is present — bound to the host `has-error` class for styling hooks. */
  protected readonly hasError = computed(
    () => (this.errors()?.length ?? 0) > 0,
  );
}
