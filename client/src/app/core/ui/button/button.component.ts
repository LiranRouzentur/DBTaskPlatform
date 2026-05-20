import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IconComponent, IconName } from '../icon/icon.component';
import { SpinnerComponent } from '../spinner/spinner.component';

/** Semantic emphasis level — primary for the main CTA, ghost for low-emphasis, danger for destructive. */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
/** Two-step button scale; `sm` is used in dense rows and table cells, `md` everywhere else. */
export type ButtonSize = 'sm' | 'md';

@Component({
  selector: 'tp-button',
  standalone: true,
  imports: [IconComponent, SpinnerComponent],
  template: `
    <button
      [type]="type()"
      [disabled]="isDisabled()"
      [class]="classes()"
      [attr.aria-busy]="loading() ? 'true' : null"
    >
      @if (loading()) {
        <tp-spinner [size]="iconSize()" />
      } @else if (leadingIcon()) {
        <tp-icon [name]="leadingIcon()!" [size]="iconSize()" />
      }
      <span class="label"><ng-content /></span>
      @if (trailingIcon()) {
        <tp-icon [name]="trailingIcon()!" [size]="iconSize()" />
      }
    </button>
  `,
  styleUrl: './button.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
/** App-wide text button. Loading state replaces the leading icon with a spinner and blocks interaction. */
export class ButtonComponent {
  /** Emphasis level — drives colour treatment. */
  readonly variant = input<ButtonVariant>('primary');
  /** Visual size — also scales the embedded icon. */
  readonly size = input<ButtonSize>('md');
  /** Native `type` — defaults to `button` to avoid accidental form submission. Set `submit` inside `<form>`. */
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  /** Icon shown before the label; suppressed while `loading` (the spinner takes its slot). */
  readonly leadingIcon = input<IconName | null>(null);
  /** Icon shown after the label — typically a chevron or arrow indicating navigation. */
  readonly trailingIcon = input<IconName | null>(null);
  /** Drives the inline spinner + `aria-busy` and forces the button into a disabled state. */
  readonly loading = input<boolean>(false);
  /** Explicit disabled flag — independent from `loading` so callers can disable for validation reasons. */
  readonly disabled = input<boolean>(false);
  /** When true, the button stretches to fill its container (used in narrow side-panels and modals). */
  readonly block = input<boolean>(false);

  /** Tracks size → matching icon pixel size so leading/trailing icons remain proportional. */
  protected readonly iconSize = computed(() => (this.size() === 'sm' ? 14 : 16));

  /** Effective disabled: `disabled OR loading` — single source of truth for the underlying `<button>`. */
  protected readonly isDisabled = computed(() => this.disabled() || this.loading());

  /** Composes the host class list from variant + size + optional `btn-block`. */
  protected readonly classes = computed(() => {
    const parts = ['btn', `btn-${this.variant()}`, `btn-${this.size()}`];
    if (this.block()) parts.push('btn-block');
    return parts.join(' ');
  });
}
