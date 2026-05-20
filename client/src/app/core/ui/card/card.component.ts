import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'tp-card',
  standalone: true,
  template: `
    @if (heading() || hasHeader()) {
      <header class="card-header">
        <div class="card-heading">
          @if (eyebrow()) {
            <span class="card-eyebrow">{{ eyebrow() }}</span>
          }
          @if (heading()) {
            <h3 class="card-title">{{ heading() }}</h3>
          }
          @if (subheading()) {
            <p class="card-sub">{{ subheading() }}</p>
          }
        </div>
        <div class="card-actions">
          <ng-content select="[actions]" />
        </div>
      </header>
    }
    <div class="card-body" [class.card-body-pad]="padded()">
      <ng-content />
    </div>
  `,
  styleUrl: './card.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
/** Generic surface container with optional header (eyebrow / title / subtitle / projected actions). */
export class CardComponent {
  /** Primary title rendered as `<h3>` — when omitted (and no `hasHeader`), the entire header block is skipped. */
  readonly heading = input<string | null>(null);
  /** Optional supporting text below the heading. */
  readonly subheading = input<string | null>(null);
  /** Tiny uppercase label above the heading (e.g. "Section", "Step 2"). */
  readonly eyebrow = input<string | null>(null);
  /** Adds default body padding; turn off when the card hosts edge-to-edge content like a table. */
  readonly padded = input<boolean>(true);
  /** Forces the header slot to render even when heading/subheading/eyebrow are empty — used when only `[actions]` is projected. */
  readonly hasHeader = input<boolean>(false);
}
