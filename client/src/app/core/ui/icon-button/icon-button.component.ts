import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IconComponent, IconName } from '../icon/icon.component';

export type IconButtonVariant = 'ghost' | 'subtle' | 'danger';
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
export class IconButtonComponent {
  readonly icon = input.required<IconName>();
  readonly label = input.required<string>();
  readonly variant = input<IconButtonVariant>('ghost');
  readonly size = input<IconButtonSize>('md');
  readonly type = input<'button' | 'submit'>('button');
  readonly disabled = input<boolean>(false);
  readonly title = input<string | null>(null);

  protected readonly iconSize = computed(() => (this.size() === 'sm' ? 14 : 16));

  protected readonly classes = computed(() =>
    `icon-btn icon-btn-${this.variant()} icon-btn-${this.size()}`,
  );
}
