import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  numberAttribute,
} from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';

import { BadgeComponent } from '../../../core/ui/badge/badge.component';
import { ButtonComponent } from '../../../core/ui/button/button.component';
import { ConfirmModalComponent } from '../../../core/ui/confirm-modal/confirm-modal.component';
import { EmptyStateComponent } from '../../../core/ui/empty-state/empty-state.component';
import { FieldComponent } from '../../../core/ui/field/field.component';
import { IconComponent } from '../../../core/ui/icon/icon.component';
import { ModalComponent } from '../../../core/ui/modal/modal.component';
import { SpinnerComponent } from '../../../core/ui/spinner/spinner.component';
import { StatusStepperComponent } from '../../../core/ui/status-stepper/status-stepper.component';
import { UserPickerComponent } from '../../../core/ui/user-picker/user-picker.component';
import { DynamicFormComponent } from '../../dynamic-form/dynamic-form.component';

import { ChangeStatusFacade } from './change-status.facade';
import { CustomDataFormController } from './custom-data-form.controller';

export type { StatusDirection, StatusOptionView } from './change-status.presenter';
export type { ActiveConfirmDialog } from './change-status.facade';

/** Modal route for moving/closing/editing a task. Logic in `ChangeStatusFacade` + `CustomDataFormController`. */
@Component({
  selector: 'tp-change-status',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    DynamicFormComponent,
    BadgeComponent,
    ButtonComponent,
    EmptyStateComponent,
    FieldComponent,
    IconComponent,
    ModalComponent,
    ConfirmModalComponent,
    SpinnerComponent,
    StatusStepperComponent,
    UserPickerComponent,
  ],
  providers: [ChangeStatusFacade, CustomDataFormController],
  templateUrl: './change-status.component.html',
  styleUrl: './change-status.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangeStatusComponent {
  // ─── Dependencies ────────────────────────────────────────────────────────
  protected readonly f = inject(ChangeStatusFacade);
  protected readonly store = this.f.storeRef;

  // ─── Inputs ──────────────────────────────────────────────────────────────
  readonly id = input(0, { transform: numberAttribute });

  // ─── Lifecycle ───────────────────────────────────────────────────────────
  constructor() {
    effect(() => this.f.setTaskId(this.id()));
  }
}
