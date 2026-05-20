import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';

import { ButtonComponent, ButtonVariant } from '../button/button.component';
import { IconName } from '../icon/icon.component';
import { ModalComponent } from '../modal/modal.component';

/** Yes/no prompt wrapping `ModalComponent`. Body projected per call site; `loading` blocks confirm. */
@Component({
  selector: 'tp-confirm-modal',
  standalone: true,
  imports: [ModalComponent, ButtonComponent],
  template: `
    <tp-modal [title]="title()" (closed)="cancelled.emit()">
      <p class="confirm-text"><ng-content /></p>
      <ng-container footer>
        <tp-button variant="ghost" (click)="cancelled.emit()">
          {{ cancelLabel() }}
        </tp-button>
        <tp-button
          [variant]="confirmVariant()"
          [leadingIcon]="confirmLeadingIcon()"
          [trailingIcon]="confirmTrailingIcon()"
          [loading]="loading()"
          (click)="confirmed.emit()"
        >
          {{ confirmLabel() }}
        </tp-button>
      </ng-container>
    </tp-modal>
  `,
  styleUrl: './confirm-modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmModalComponent {
  readonly title = input.required<string>();
  readonly confirmLabel = input.required<string>();
  readonly cancelLabel = input<string>('Cancel');
  readonly confirmVariant = input<ButtonVariant>('primary');
  readonly confirmLeadingIcon = input<IconName | null>(null);
  readonly confirmTrailingIcon = input<IconName | null>(null);
  readonly loading = input<boolean>(false);

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();
}
