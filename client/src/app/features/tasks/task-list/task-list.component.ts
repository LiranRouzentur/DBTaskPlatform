import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { AvatarComponent } from '../../../core/ui/avatar/avatar.component';
import { BadgeComponent } from '../../../core/ui/badge/badge.component';
import { ButtonComponent } from '../../../core/ui/button/button.component';
import { CardComponent } from '../../../core/ui/card/card.component';
import { ConfirmModalComponent } from '../../../core/ui/confirm-modal/confirm-modal.component';
import { EmptyStateComponent } from '../../../core/ui/empty-state/empty-state.component';
import { IconButtonComponent } from '../../../core/ui/icon-button/icon-button.component';
import { IconComponent } from '../../../core/ui/icon/icon.component';
import { SegmentedComponent } from '../../../core/ui/segmented/segmented.component';
import { SkeletonComponent } from '../../../core/ui/skeleton/skeleton.component';
import { StatusStepperComponent } from '../../../core/ui/status-stepper/status-stepper.component';
import { TypePickerComponent } from '../../../core/ui/type-picker/type-picker.component';
import { UserPickerComponent } from '../../../core/ui/user-picker/user-picker.component';

import { TaskListFacade } from './task-list.facade';

/** Main page. Logic in `TaskListFacade`; hosts `<router-outlet>` for modal child routes. */
@Component({
  selector: 'tp-task-list',
  standalone: true,
  imports: [
    RouterOutlet,
    AvatarComponent,
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    ConfirmModalComponent,
    EmptyStateComponent,
    IconComponent,
    IconButtonComponent,
    SegmentedComponent,
    SkeletonComponent,
    StatusStepperComponent,
    TypePickerComponent,
    UserPickerComponent,
  ],
  providers: [TaskListFacade],
  templateUrl: './task-list.component.html',
  styleUrl: './task-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskListComponent {
  protected readonly f = inject(TaskListFacade);
  protected readonly store = this.f.storeRef;
  protected readonly ALL_TYPES = this.f.ALL_TYPES;
}
