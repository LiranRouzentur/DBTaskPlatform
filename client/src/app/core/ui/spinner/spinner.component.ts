import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'tp-spinner',
  standalone: true,
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      role="status"
      [attr.aria-label]="label()"
    >
      <circle
        cx="12" cy="12" r="9"
        fill="none"
        stroke="currentColor"
        stroke-opacity="0.18"
        stroke-width="2.5"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 12 12"
          to="360 12 12"
          dur="0.9s"
          repeatCount="indefinite"
        />
      </path>
    </svg>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        line-height: 0;
        color: inherit;
      }
      @media (prefers-reduced-motion: reduce) {
        animateTransform { display: none; }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpinnerComponent {
  readonly size = input<number>(16);
  readonly label = input<string>('Loading');
}
