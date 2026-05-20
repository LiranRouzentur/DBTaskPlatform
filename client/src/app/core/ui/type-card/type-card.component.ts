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
/** Tile representing one task type in the create-task picker. Shows the type name and its workflow length. */
export class TypeCardComponent {
  /** Task-type metadata to display — drives name, stage count, and the emitted id on click. */
  readonly type = input.required<TaskTypeMetadata>();
  /** When true, paints the card as the active selection (also reflected via `aria-pressed`). */
  readonly selected = input<boolean>(false);

  /** Emits the picked type's id — parent decides what "select" means (typically advances the wizard). */
  readonly picked = output<number>();

  /** Pluralised label like "1 stage" / "4 stages" — derived from the number of statuses on this type. */
  protected readonly stagesLabel = computed(() => {
    // Stage count is the workflow length; cached locally to keep the conditional readable.
    const n = this.type().statuses.length;
    // Branch on 1 to avoid the "1 stages" grammar bug; everything else uses the plural form.
    return n === 1 ? '1 stage' : `${n} stages`;
  });
}
