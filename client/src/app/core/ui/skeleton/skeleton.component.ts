import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Visual silhouette: `line` for text rows, `block` for cards/images, `circle` for avatar placeholders. */
export type SkeletonShape = 'line' | 'block' | 'circle';

@Component({
  selector: 'tp-skeleton',
  standalone: true,
  template: `
    <span
      class="skeleton"
      [class.shape-line]="shape() === 'line'"
      [class.shape-block]="shape() === 'block'"
      [class.shape-circle]="shape() === 'circle'"
      [style.width]="width()"
      [style.height]="effectiveHeight()"
      aria-hidden="true"
    ></span>
  `,
  styleUrl: './skeleton.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
/** Generic shimmer placeholder shown while data loads. Marked `aria-hidden` — the screen reader sees loading text elsewhere. */
export class SkeletonComponent {
  /** Silhouette family — drives both the border-radius and the default height. */
  readonly shape = input<SkeletonShape>('line');
  /** CSS width — accepts any length unit (px, %, rem, etc.). */
  readonly width = input<string>('100%');
  /** Explicit CSS height; when null, falls back to a shape-appropriate default via `effectiveHeight`. */
  readonly height = input<string | null>(null);

  /** Resolved height: caller-specified `height` wins, otherwise a sensible default per shape. */
  protected readonly effectiveHeight = computed<string>(() => {
    const h = this.height();
    if (h) return h;
    switch (this.shape()) {
      case 'line': return '12px';
      case 'block': return '64px';
      case 'circle': return '32px';
    }
  });
}
