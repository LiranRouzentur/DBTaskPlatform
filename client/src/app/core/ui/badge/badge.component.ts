import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
export type BadgeVariant = 'soft' | 'solid' | 'outline';

@Component({
  selector: 'tp-badge',
  standalone: true,
  template: `
    <span [class]="classes()">
      @if (dot()) {
        <span class="dot" aria-hidden="true"></span>
      }
      <ng-content />
    </span>
  `,
  styleUrl: './badge.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BadgeComponent {
  readonly tone = input<BadgeTone>('neutral');
  readonly variant = input<BadgeVariant>('soft');
  readonly dot = input<boolean>(false);

  protected readonly classes = computed(
    () => `badge badge-${this.variant()} tone-${this.tone()}`,
  );
}
