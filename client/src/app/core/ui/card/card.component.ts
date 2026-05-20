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
export class CardComponent {
  readonly heading = input<string | null>(null);
  readonly subheading = input<string | null>(null);
  readonly eyebrow = input<string | null>(null);
  readonly padded = input<boolean>(true);
  readonly hasHeader = input<boolean>(false);
}
