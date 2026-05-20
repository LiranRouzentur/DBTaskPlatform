import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

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
export class SkeletonComponent {
  readonly shape = input<SkeletonShape>('line');
  readonly width = input<string>('100%');
  readonly height = input<string | null>(null);

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
