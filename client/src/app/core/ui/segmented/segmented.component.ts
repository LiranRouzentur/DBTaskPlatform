import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

/** Single segment in a `tp-segmented` control. `count` renders a small pill next to the label (used for tab counts). */
export interface SegmentedOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly count?: number;
}

@Component({
  selector: 'tp-segmented',
  standalone: true,
  template: `
    <div
      class="segmented"
      role="tablist"
      [attr.aria-label]="ariaLabel()"
      (keydown)="onKeydown($event)"
    >
      @for (opt of options(); track opt.value; let i = $index) {
        <button
          type="button"
          role="tab"
          [id]="'seg-' + opt.value"
          [attr.aria-selected]="value() === opt.value"
          [tabindex]="value() === opt.value ? 0 : -1"
          class="seg-btn"
          [class.is-active]="value() === opt.value"
          (click)="value.set(opt.value)"
        >
          <span class="seg-label">{{ opt.label }}</span>
          @if (opt.count !== undefined) {
            <span class="seg-count">{{ opt.count }}</span>
          }
        </button>
      }
    </div>
  `,
  styleUrl: './segmented.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
/** Tab-strip style switcher — used for the open/closed/all state filter. Two-way bound via `model()`. */
export class SegmentedComponent<T extends string = string> {
  // ─── Inputs / Models ─────────────────────────────────────────────────────
  /** Ordered options to display. Type-parameter ensures the value matches one of the option values. */
  readonly options = input.required<readonly SegmentedOption<T>[]>();
  /** Two-way bound current selection — parent reads via `[(value)]` or signal binding. */
  readonly value = model.required<T>();
  /** Group-level aria-label applied to the `role="tablist"` container. */
  readonly ariaLabel = input<string>('Segmented');

  // ─── Public API / UI Actions ─────────────────────────────────────────────
  /** ARIA-pattern keyboard model: arrows cycle, Home/End jump to ends, other keys pass through. */
  protected onKeydown(event: KeyboardEvent): void {
    const opts = this.options();
    if (opts.length === 0) return;
    const currentIndex = opts.findIndex((o) => o.value === this.value());
    let nextIndex = currentIndex;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex = (currentIndex + 1) % opts.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex = (currentIndex - 1 + opts.length) % opts.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = opts.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.value.set(opts[nextIndex].value);
  }
}
