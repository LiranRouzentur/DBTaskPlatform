import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';

import { ButtonComponent } from '../../../core/ui/button/button.component';
import { ConfirmModalComponent } from '../../../core/ui/confirm-modal/confirm-modal.component';
import { FieldComponent } from '../../../core/ui/field/field.component';
import { ModalComponent } from '../../../core/ui/modal/modal.component';
import { TypeCardComponent } from '../../../core/ui/type-card/type-card.component';
import { UserPickerComponent } from '../../../core/ui/user-picker/user-picker.component';

import { CreateTaskFacade } from './create-task.facade';

export type { ActiveCreateTaskDialog } from './create-task.facade';

/** Modal route for creating a new task. Logic in `CreateTaskFacade`; new tasks start at status 1. */
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
  protected readonly f = inject(CreateTaskFacade);
  protected readonly store = this.f.storeRef;
}
