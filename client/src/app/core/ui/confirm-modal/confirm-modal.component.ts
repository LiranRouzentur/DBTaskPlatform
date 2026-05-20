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
  /** Dialog title — surfaced as `aria-labelledby` on the modal surface. */
  readonly title = input.required<string>();
  /** Label on the affirmative button (e.g. "Discard", "Delete", "Close task"). */
  readonly confirmLabel = input.required<string>();
  /** Label on the dismissive button; the default fits most "are you sure" prompts. */
  readonly cancelLabel = input<string>('Cancel');
  /** Visual emphasis for the affirmative button — set to `danger` for destructive prompts. */
  readonly confirmVariant = input<ButtonVariant>('primary');
  /** Optional icon before the confirm label — pairs with the variant to clarify intent. */
  readonly confirmLeadingIcon = input<IconName | null>(null);
  /** Optional icon after the confirm label (e.g. arrow-right for navigation). */
  readonly confirmTrailingIcon = input<IconName | null>(null);
  /** When true, the confirm button shows a spinner and is non-interactive — used while a mutation is in flight. */
  readonly loading = input<boolean>(false);

  /** Fired when the user accepts — caller performs the actual destructive/affirmative action. */
  readonly confirmed = output<void>();
  /** Fired when the user dismisses (cancel button, backdrop, Escape, or the modal close button). */
  readonly cancelled = output<void>();
}
