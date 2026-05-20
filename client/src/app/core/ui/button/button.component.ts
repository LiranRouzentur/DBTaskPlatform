import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IconComponent, IconName } from '../icon/icon.component';
import { SpinnerComponent } from '../spinner/spinner.component';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
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
export class ButtonComponent {
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('md');
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  readonly leadingIcon = input<IconName | null>(null);
  readonly trailingIcon = input<IconName | null>(null);
  readonly loading = input<boolean>(false);
  readonly disabled = input<boolean>(false);
  readonly block = input<boolean>(false);

  protected readonly iconSize = computed(() => (this.size() === 'sm' ? 14 : 16));

  protected readonly isDisabled = computed(() => this.disabled() || this.loading());

  protected readonly classes = computed(() => {
    const parts = ['btn', `btn-${this.variant()}`, `btn-${this.size()}`];
    if (this.block()) parts.push('btn-block');
    return parts.join(' ');
  });
}
