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
/** Standard placeholder shown when a list/section has no items — icon + title + optional body + projected actions. */
export class EmptyStateComponent {
  /** Decorative glyph above the title. Defaults to the generic "inbox" — pick a more specific icon when relevant. */
  readonly icon = input<IconName>('inbox');
  /** Short headline like "No tasks yet". */
  readonly title = input.required<string>();
  /** Optional supporting copy explaining the empty condition or next step. */
  readonly description = input<string | null>(null);
}
