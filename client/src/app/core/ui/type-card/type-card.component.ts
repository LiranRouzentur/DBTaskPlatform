import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TaskTypeMetadata } from '../../models/task-type-metadata.model';

@Component({
  selector: 'tp-type-card',
  standalone: true,
  imports: [],
  template: `
    <button
      type="button"
      class="type-card"
      [class.is-selected]="selected()"
      [attr.aria-pressed]="selected()"
      (click)="picked.emit(type().id)"
    >
      <header class="head">
        <span class="dot" aria-hidden="true"></span>
        <span class="name">{{ type().name }}</span>
        <span class="stages">{{ stagesLabel() }}</span>
      </header>
    </button>
  `,
  styleUrl: './type-card.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TypeCardComponent {
  readonly type = input.required<TaskTypeMetadata>();
  readonly selected = input<boolean>(false);

  readonly picked = output<number>();

  protected readonly stagesLabel = computed(() => {
    const n = this.type().statuses.length;
    return n === 1 ? '1 stage' : `${n} stages`;
  });
}
