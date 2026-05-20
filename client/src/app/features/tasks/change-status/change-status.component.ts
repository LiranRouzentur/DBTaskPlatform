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

/** Re-exported so other features can type against the presenter's option shape without importing it directly. */
export type { StatusDirection, StatusOptionView } from './change-status.presenter';
/** Re-exported so templates / tests can name the confirm-dialog states served by the facade. */
export type { ActiveConfirmDialog } from './change-status.facade';

/**
 * Container component for the change-status modal. Mounted as a child route of `/tasks` and opened/closed via
 * `router.navigate(..., { skipLocationChange: true })` (see .claude/rules/frontend.md §5). This file is intentionally
 * thin — UX orchestration lives in `ChangeStatusFacade`, pure derivations in `ChangeStatusPresenter`, and the
 * per-status form lifecycle in `CustomDataFormController`.
 */
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
  /** Per-route facade (provided in component `providers`) — owns all orchestration state for this modal. */
  protected readonly f = inject(ChangeStatusFacade);
  /** Convenience alias exposed by the facade so templates can read shared store signals without a second injection. */
  protected readonly store = this.f.storeRef;

  // ─── Inputs ──────────────────────────────────────────────────────────────
  /** Task id from the `:id` route segment, transformed to `number` via Angular's `withComponentInputBinding()`. */
  readonly id = input(0, { transform: numberAttribute });

  // ─── Lifecycle ───────────────────────────────────────────────────────────
  constructor() {
    // Propagate route-driven id changes into the facade so it can (re)load the detail and rebuild the form.
    // Effect runs on construction and re-runs whenever Angular's input binding pushes a new `:id` value.
    effect(() => this.f.setTaskId(this.id()));
  }
}
