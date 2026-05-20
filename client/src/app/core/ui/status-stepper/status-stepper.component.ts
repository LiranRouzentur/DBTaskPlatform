import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { StatusMetadata } from '../../models/task-type-metadata.model';

// Visual progress indicator. Two density modes: 'compact' (conic-gradient ring for list rows)
// and 'comfortable' (horizontal stepper for detail views). Reads StatusMetadata; no store dep.

export type StepperDensity = 'compact' | 'comfortable';

/** Per-step state: done/current/pending = position vs current; target = hover-preview highlight. */
export type StepState = 'done' | 'current' | 'pending' | 'target';

interface StepView {
  readonly number: number;
  readonly name: string;
  readonly state: StepState;
}

interface ArcView {
  readonly number: number;
  readonly name: string;
  readonly path: string;
  readonly state: StepState;
}

const RING_BOX = 28; 
const RING_CX = RING_BOX / 2;
const RING_CY = RING_BOX / 2;
const RING_R = 11; 
const RING_GAP_DEG = 8; 

@Component({
  selector: 'tp-status-stepper',
  standalone: true,
  imports: [],
  template: `
    @if (density() === 'compact') {
      <div
        class="ring"
        role="img"
        [attr.aria-label]="ariaLabel()"
        [style.--n]="statuses().length"
        [style.--ring-bg]="ringGradient()"
      >
        <span class="num">{{ current() }}</span>
        <svg
          class="hover-layer"
          [attr.viewBox]="'0 0 ' + ringBox + ' ' + ringBox"
          aria-hidden="true"
        >
          @for (arc of arcs(); track arc.number) {
            <path [attr.d]="arc.path" class="arc-hit">
              <title>{{ arc.number }} · {{ arc.name }}</title>
            </path>
          }
        </svg>
      </div>
    } @else {
      <ol class="hstepper" [attr.aria-label]="ariaLabel()">
        @for (step of steps(); track step.number) {
          <li
            class="hstep"
            [class.is-done]="step.state === 'done'"
            [class.is-current]="step.state === 'current'"
            [class.is-pending]="step.state === 'pending'"
            [class.is-target]="step.state === 'target'"
            [attr.aria-current]="step.state === 'current' ? 'step' : null"
            [title]="step.number + ' · ' + step.name"
          >
            <span class="hstep-node">{{ step.number }}</span>
            @if (showLabels()) {
              <span class="hstep-label">{{ step.name }}</span>
            }
          </li>
        }
      </ol>
    }
  `,
  styleUrl: './status-stepper.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusStepperComponent {
  // ─── Inputs ──────────────────────────────────────────────────────────────
  readonly statuses = input.required<readonly StatusMetadata[]>();
  readonly current = input.required<number>();
  readonly target = input<number | null>(null);
  readonly closed = input<boolean>(false);
  readonly density = input<StepperDensity>('compact');
  readonly showLabels = input<boolean>(false);

  // ─── Template constants ──────────────────────────────────────────────────
  protected readonly ringBox = RING_BOX;

  // ─── Computed ────────────────────────────────────────────────────────────
  protected readonly ariaLabel = computed(
    () => `Step ${this.current()} of ${this.statuses().length}`,
  );

  protected readonly steps = computed<readonly StepView[]>(() => {
    const cur = this.current();
    const tgt = this.target();
    const closed = this.closed();
    const list = this.statuses();
    const last = list.length > 0 ? list[list.length - 1].status : 0;
    return list.map((s) => {
      let state: StepState;
      if (closed) {
        state = s.status === last ? 'current' : 'done';
      } else if (s.status < cur) state = 'done';
      else if (s.status === cur) state = 'current';
      else if (tgt !== null && s.status === tgt) state = 'target';
      else state = 'pending';
      return { number: s.status, name: s.name, state };
    });
  });

  protected readonly ringGradient = computed<string>(() => {
    const list = this.steps();
    const n = list.length;
    if (n === 0) return 'transparent';
    const slice = 360 / n;
    const accent = 'var(--color-accent)';
    const muted = 'var(--color-border-strong)';
    const stops: string[] = [];
    list.forEach((s, i) => {
      const colour = s.state === 'pending' ? muted : accent;
      const start = i * slice;
      const end = (i + 1) * slice - RING_GAP_DEG;
      stops.push(`${colour} ${start.toFixed(3)}deg ${end.toFixed(3)}deg`);
      stops.push(`transparent ${end.toFixed(3)}deg ${((i + 1) * slice).toFixed(3)}deg`);
    });
    return `conic-gradient(${stops.join(', ')})`;
  });

  protected readonly arcs = computed<readonly ArcView[]>(() => {
    const list = this.steps();
    const n = list.length;
    if (n === 0) return [];
    const totalDeg = 360;
    const sweep = totalDeg / n - RING_GAP_DEG;
    if (sweep <= 0) return list.map((s) => ({ ...s, path: '' }));

    return list.map((s, i) => {
      const startDeg = -90 + (totalDeg / n) * i + RING_GAP_DEG / 2;
      const endDeg = startDeg + sweep;
      return { ...s, path: arcPath(RING_CX, RING_CY, RING_R, startDeg, endDeg) };
    });
  });
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const start = polar(cx, cy, r, endDeg);
  const end = polar(cx, cy, r, startDeg);
  const largeArc = endDeg - startDeg <= 180 ? 0 : 1;
  return `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${r} ${r} 0 ${largeArc} 0 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;
}

function polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
