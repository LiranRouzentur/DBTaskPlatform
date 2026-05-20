import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Semantic colour family — maps to CSS tone-* classes shared across status pills, task-type chips, toasts. */
export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
/** Visual treatment within a tone: `soft` (tinted bg), `solid` (filled), `outline` (border-only). */
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
/** Generic pill used for statuses, task-type chips, and counters. Content projected via `<ng-content>`. */
export class BadgeComponent {
  /** Semantic colour family. */
  readonly tone = input<BadgeTone>('neutral');
  /** Visual treatment within the tone. */
  readonly variant = input<BadgeVariant>('soft');
  /** When true, prepends a small status dot inside the pill (decorative — `aria-hidden`). */
  readonly dot = input<boolean>(false);

  /** Composes the host class list — variant + tone are kept as separate axes to let CSS combine them freely. */
  protected readonly classes = computed(
    () => `badge badge-${this.variant()} tone-${this.tone()}`,
  );
}
