import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { StatusMetadata } from '../../models/task-type-metadata.model';

// Visual progress indicator. Two density modes: 'compact' (conic-gradient ring for list rows)
// and 'comfortable' (horizontal stepper for detail views). Reads StatusMetadata; no store dep.

/** `compact` = conic-gradient ring (used in list rows); `comfortable` = horizontal numbered stepper (detail views). */
export type StepperDensity = 'compact' | 'comfortable';

/** Per-step state: done/current/pending = position vs current; target = hover-preview highlight. */
export type StepState = 'done' | 'current' | 'pending' | 'target';

/** View-model for one segment of the horizontal stepper. */
interface StepView {
  readonly number: number;
  readonly name: string;
  readonly state: StepState;
}

/** View-model for one arc of the compact ring — `path` is the SVG `d` attribute for the hit/tooltip layer. */
interface ArcView {
  readonly number: number;
  readonly name: string;
  readonly path: string;
  readonly state: StepState;
}

/** SVG viewport size of the compact ring in pixels. Coordinates below derive from it. */
const RING_BOX = 28;
/** Ring centre X — half of `RING_BOX`. */
const RING_CX = RING_BOX / 2;
/** Ring centre Y — half of `RING_BOX`. */
const RING_CY = RING_BOX / 2;
/** Ring stroke radius — leaves room inside for the step number. */
const RING_R = 11;
/** Visual gap between adjacent arcs in degrees — without it, arcs would touch and lose separation. */
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
/** Progress indicator for a task's position in its status sequence. Reads pure metadata — no store dependency. */
export class StatusStepperComponent {
  // ─── Inputs ──────────────────────────────────────────────────────────────
  /** Ordered list of statuses (definitions) for the task's type — drives both the number of segments and labels. */
  readonly statuses = input.required<readonly StatusMetadata[]>();
  /** Current status number — segments before are `done`, this one is `current`, ones after are `pending`. */
  readonly current = input.required<number>();
  /** Preview target — typically the hovered "next status" in change-status. Marked with `target` state. */
  readonly target = input<number | null>(null);
  /** When true, the task is closed: every step renders as `done` and the last as `current` regardless of `current`. */
  readonly closed = input<boolean>(false);
  /** Visual mode — compact ring vs comfortable horizontal stepper. */
  readonly density = input<StepperDensity>('compact');
  /** Show step labels next to numbers in the `comfortable` mode (no effect on the ring). */
  readonly showLabels = input<boolean>(false);

  // ─── Template constants ──────────────────────────────────────────────────
  /** Re-exposes `RING_BOX` to the template so the SVG `viewBox` can be bound. */
  protected readonly ringBox = RING_BOX;

  // ─── Computed ────────────────────────────────────────────────────────────
  /** A11y caption like "Step 2 of 5" — applied to both ring and stepper for screen readers. */
  protected readonly ariaLabel = computed(
    () => `Step ${this.current()} of ${this.statuses().length}`,
  );

  /** Step-by-step view model with derived `state` per segment — handles the closed-task override. */
  protected readonly steps = computed<readonly StepView[]>(() => {
    // Snapshot every signal up front so the per-step loop never re-reads inputs mid-derivation.
    const cur = this.current();
    const tgt = this.target();
    const closed = this.closed();
    const list = this.statuses();
    // Last status number drives the closed-task "highlight final step as current" rule.
    const last = list.length > 0 ? list[list.length - 1].status : 0;
    return list.map((s) => {
      // Per-step state computed in one place — UI binds class names directly to this enum.
      let state: StepState;
      if (closed) {
        // Closed task: terminal step shown as `current`, every prior step shown as `done`.
        state = s.status === last ? 'current' : 'done';
      } else if (s.status < cur) state = 'done';                              // Already passed in the workflow.
      else if (s.status === cur) state = 'current';                           // Where the task lives right now.
      else if (tgt !== null && s.status === tgt) state = 'target';            // Hover-preview of the proposed move.
      else state = 'pending';                                                 // Future step — not yet reached.
      return { number: s.status, name: s.name, state };
    });
  });

  /** CSS conic-gradient string drawing each arc in accent / muted colours with a transparent gap between segments. */
  protected readonly ringGradient = computed<string>(() => {
    // Steps view-model is the upstream truth — re-deriving from raw inputs would duplicate logic.
    const list = this.steps();
    const n = list.length;
    // Empty status list → fully transparent so no ring artifact paints.
    if (n === 0) return 'transparent';
    // Equal-slice geometry — every step occupies the same angular sweep.
    const slice = 360 / n;
    // CSS custom properties referenced (not raw colours) so theme switching works without a recompute.
    const accent = 'var(--color-accent)';
    const muted = 'var(--color-border-strong)';
    // Flat array of conic-gradient stops; alternating colour + transparent creates the visual gap.
    const stops: string[] = [];
    list.forEach((s, i) => {
      // Pending steps render in muted tone; everything else (done/current/target) takes accent.
      const colour = s.state === 'pending' ? muted : accent;
      // Coloured arc starts at the step's slice boundary…
      const start = i * slice;
      // …and ends `RING_GAP_DEG` short of the next boundary so a transparent gap separates segments.
      const end = (i + 1) * slice - RING_GAP_DEG;
      stops.push(`${colour} ${start.toFixed(3)}deg ${end.toFixed(3)}deg`);
      stops.push(`transparent ${end.toFixed(3)}deg ${((i + 1) * slice).toFixed(3)}deg`);
    });
    return `conic-gradient(${stops.join(', ')})`;
  });

  /** Per-segment SVG arc paths overlaid on the ring — invisible hit areas used for the per-arc `<title>` tooltips. */
  protected readonly arcs = computed<readonly ArcView[]>(() => {
    // Mirror `ringGradient`: derive from the view-model so labels stay aligned with colour.
    const list = this.steps();
    const n = list.length;
    if (n === 0) return [];
    // Full circle in degrees — explicit constant for readability vs `360`.
    const totalDeg = 360;
    // Each arc's angular sweep after subtracting the visual gap.
    const sweep = totalDeg / n - RING_GAP_DEG;
    // Degenerate case: too many steps for any sweep to render — return empty paths so SVG still mounts.
    if (sweep <= 0) return list.map((s) => ({ ...s, path: '' }));

    return list.map((s, i) => {
      // `-90` rotates the start to 12-o'clock; half-gap offset centres each arc inside its slice.
      const startDeg = -90 + (totalDeg / n) * i + RING_GAP_DEG / 2;
      const endDeg = startDeg + sweep;
      return { ...s, path: arcPath(RING_CX, RING_CY, RING_R, startDeg, endDeg) };
    });
  });
}

/** Builds an SVG `d` attribute for a counter-clockwise arc between two angles on a circle of radius `r`. */
function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  // SVG arcs draw between two endpoints — translate the two angles to cartesian start/end pairs.
  const start = polar(cx, cy, r, endDeg);
  const end = polar(cx, cy, r, startDeg);
  // SVG's `large-arc-flag`: 1 when sweep exceeds 180°, so the rendered arc takes the long way around.
  const largeArc = endDeg - startDeg <= 180 ? 0 : 1;
  // `M start A r r 0 large 0 end` — counter-clockwise (sweep=0) arc on a circle of radius `r`.
  return `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${r} ${r} 0 ${largeArc} 0 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;
}

/** Polar-to-cartesian helper for `arcPath` — degrees-based to match the rest of the ring math. */
function polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  // Convert to radians once — Math.{cos,sin} expect radians, the rest of the file thinks in degrees.
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
