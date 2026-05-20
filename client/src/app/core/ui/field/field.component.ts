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
export class FieldComponent {
  readonly label = input<string | null>(null);
  readonly hint = input<string | null>(null);
  readonly required = input<boolean>(false);
  
  readonly showRequiredMarker = input<boolean>(false);
  readonly controlId = input<string | null>(null);
  readonly errors = input<readonly string[] | null>(null);

  protected readonly hasError = computed(
    () => (this.errors()?.length ?? 0) > 0,
  );
}
