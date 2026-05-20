import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ToastService, ToastTone } from '../../services/toast.service';
import { IconButtonComponent } from '../icon-button/icon-button.component';
import { IconComponent, IconName } from '../icon/icon.component';

/** Per-tone leading icon — pairs with the colour theme to signal the message family at a glance. */
const ICON_BY_TONE: Record<ToastTone, IconName> = {
  success: 'check-circle',
  info: 'info',
  warning: 'alert-triangle',
  danger: 'alert-circle',
};

/** Renders the toast queue from `ToastService`. Mounted once in AppComponent (aria-live="polite"). */
@Component({
  selector: 'tp-toast-host',
  standalone: true,
  imports: [IconComponent, IconButtonComponent],
  template: `
    <div class="toast-host" aria-live="polite" aria-atomic="false">
      @for (toast of toasts(); track toast.id) {
        <div class="toast" [class]="'tone-' + toast.tone">
          <span class="t-icon">
            <tp-icon [name]="iconFor(toast.tone)" [size]="16" />
          </span>
          <div class="t-body">
            @if (toast.title) { <strong class="t-title">{{ toast.title }}</strong> }
            <span class="t-msg">{{ toast.message }}</span>
          </div>
          <tp-icon-button
            icon="x"
            label="Dismiss"
            size="sm"
            variant="ghost"
            (click)="dismiss(toast.id)"
          />
        </div>
      }
    </div>
  `,
  styleUrl: './toast-host.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastHostComponent {
  // ─── Dependencies ────────────────────────────────────────────────────────
  private readonly svc = inject(ToastService);

  // ─── Bridges ─────────────────────────────────────────────────────────────
  /** Re-exposes the service's toast list to the template — single live signal, no local mirror. */
  protected readonly toasts = this.svc.toasts;

  // ─── Public API / UI Actions ─────────────────────────────────────────────
  /** Tone → icon name lookup used by the template. */
  protected iconFor(tone: ToastTone): IconName {
    return ICON_BY_TONE[tone];
  }

  /** Manual dismissal — delegates to the service (which also handles auto-dismiss timers). */
  protected dismiss(id: number): void {
    this.svc.dismiss(id);
  }
}
