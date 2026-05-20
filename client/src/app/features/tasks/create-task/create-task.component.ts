import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';

import { ButtonComponent } from '../../../core/ui/button/button.component';
import { ConfirmModalComponent } from '../../../core/ui/confirm-modal/confirm-modal.component';
import { FieldComponent } from '../../../core/ui/field/field.component';
import { ModalComponent } from '../../../core/ui/modal/modal.component';
import { TypeCardComponent } from '../../../core/ui/type-card/type-card.component';
import { UserPickerComponent } from '../../../core/ui/user-picker/user-picker.component';

import { CreateTaskFacade } from './create-task.facade';

/** Re-exported so other features can name the open/cancel confirm-dialog states. */
export type { ActiveCreateTaskDialog } from './create-task.facade';

/**
 * Container component for the create-task modal — opened as a child route of `/tasks` and routed away via
 * `router.navigate(..., { skipLocationChange: true })` (see .claude/rules/frontend.md §5). Logic lives in
 * `CreateTaskFacade`; the template is data-driven so adding a task type requires no Angular changes.
 */
@Component({
  selector: 'tp-create-task',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    ButtonComponent,
    ConfirmModalComponent,
    FieldComponent,
    ModalComponent,
    TypeCardComponent,
    UserPickerComponent,
  ],
  providers: [CreateTaskFacade],
  templateUrl: './create-task.component.html',
  styleUrl: './create-task.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateTaskComponent {
  /** Per-route facade — owns the form, the dialog state machine, and submission. */
  protected readonly f = inject(CreateTaskFacade);
  /** Shared store alias re-exposed via the facade so templates can read `users()` / `taskTypes()` directly. */
  protected readonly store = this.f.storeRef;
}
