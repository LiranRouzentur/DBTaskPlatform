import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent, IconName } from '../icon/icon.component';

@Component({
  selector: 'tp-empty-state',
  standalone: true,
  imports: [IconComponent],
  template: `
    <div class="empty">
      <div class="empty-icon">
        <tp-icon [name]="icon()" [size]="22" />
      </div>
      <h3 class="empty-title">{{ title() }}</h3>
      @if (description()) {
        <p class="empty-desc">{{ description() }}</p>
      }
      <div class="empty-actions">
        <ng-content />
      </div>
    </div>
  `,
  styleUrl: './empty-state.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyStateComponent {
  readonly icon = input<IconName>('inbox');
  readonly title = input.required<string>();
  readonly description = input<string | null>(null);
}
