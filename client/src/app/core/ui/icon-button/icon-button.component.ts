import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IconComponent, IconName } from '../icon/icon.component';

/** Icon-only button emphasis level — narrower than `ButtonVariant` since these are typically inline affordances. */
export type IconButtonVariant = 'ghost' | 'subtle' | 'danger';
/** Two-step scale; `sm` for compact toolbars, `md` for modal headers and primary affordances. */
export type IconButtonSize = 'sm' | 'md';

@Component({
  selector: 'tp-icon-button',
  standalone: true,
  imports: [IconComponent],
  template: `
    <button
      [type]="type()"
      [disabled]="disabled()"
      [attr.aria-label]="label()"
      [attr.title]="title() || label()"
      [class]="classes()"
    >
      <tp-icon [name]="icon()" [size]="iconSize()" />
    </button>
  `,
  styleUrl: './icon-button.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
/** Compact icon-only affordance. Requires `label` (a11y) — falls back to it for the tooltip when `title` is null. */
export class IconButtonComponent {
  /** Glyph to render — drives the visual meaning of the button. */
  readonly icon = input.required<IconName>();
  /** Accessible name surfaced via `aria-label` — required because there is no visible text. */
  readonly label = input.required<string>();
  /** Emphasis level. */
  readonly variant = input<IconButtonVariant>('ghost');
  /** Visual size — also scales the embedded icon. */
  readonly size = input<IconButtonSize>('md');
  /** Native `type` — defaults to `button` to prevent accidental form submission. */
  readonly type = input<'button' | 'submit'>('button');
  /** Disables interaction and applies the disabled styling. */
  readonly disabled = input<boolean>(false);
  /** Tooltip text — when null, falls back to `label` so hover-help is always present. */
  readonly title = input<string | null>(null);

  /** Tracks size → matching icon pixel size to keep the glyph proportional to the button. */
  protected readonly iconSize = computed(() => (this.size() === 'sm' ? 14 : 16));

  /** Composes the host class list — variant + size are kept as separate axes for CSS combinatorics. */
  protected readonly classes = computed(() =>
    // Three classes: base for layout, variant for colour treatment, size for padding/font metrics.
    `icon-btn icon-btn-${this.variant()} icon-btn-${this.size()}`,
  );
}
