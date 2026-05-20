import { DOCUMENT } from '@angular/common';
import { Directive, ElementRef, HostListener, inject, input } from '@angular/core';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Keyboard focus containment for modals. Re-queries the DOM on each Tab so dynamically inserted
// controls stay reachable; `offsetParent !== null` filters out display:none nodes.
@Directive({
  selector: '[tpFocusTrap]',
  standalone: true,
})
export class FocusTrapDirective {
  // ─── Dependencies ────────────────────────────────────────────────────────
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly document = inject(DOCUMENT);

  // ─── Inputs ──────────────────────────────────────────────────────────────
  readonly enabled = input<boolean>(true, { alias: 'tpFocusTrapEnabled' });

  // ─── Host listeners ──────────────────────────────────────────────────────
  @HostListener('keydown.Tab', ['$event'])
  protected onTab(event: KeyboardEvent): void {
    if (!this.enabled()) return;
    this.handleTab(event, false);
  }

  @HostListener('keydown.shift.Tab', ['$event'])
  protected onShiftTab(event: KeyboardEvent): void {
    if (!this.enabled()) return;
    this.handleTab(event, true);
  }

  // ─── Private methods ─────────────────────────────────────────────────────
  private handleTab(event: KeyboardEvent, shift: boolean): void {
    const focusable = this.focusableNodes();
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = this.document.activeElement as HTMLElement | null;

    if (!shift && active === last) {
      event.preventDefault();
      first.focus();
    } else if (shift && (active === first || !this.host.nativeElement.contains(active))) {
      event.preventDefault();
      last.focus();
    }
  }

  private focusableNodes(): HTMLElement[] {
    const nodes = this.host.nativeElement.querySelectorAll(FOCUSABLE_SELECTOR);
    return Array.from(nodes as NodeListOf<HTMLElement>).filter(
      (el) => el.offsetParent !== null || el === this.document.activeElement,
    );
  }
}
