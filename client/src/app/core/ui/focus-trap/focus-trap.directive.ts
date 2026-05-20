import { DOCUMENT } from '@angular/common';
import { Directive, ElementRef, HostListener, inject, input } from '@angular/core';

/** CSS selector for anything keyboard-focusable. Re-queried per Tab so trap honours late-added controls. */
const FOCUSABLE_SELECTOR =
  'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Keyboard focus containment for modals. Re-queries the DOM on each Tab so dynamically inserted
// controls stay reachable; `offsetParent !== null` filters out display:none nodes.
@Directive({
  selector: '[tpFocusTrap]',
  standalone: true,
})
/** Wrap-around Tab/Shift+Tab containment for modals. Attach with `tpFocusTrap` on the dialog surface. */
export class FocusTrapDirective {
  // ─── Dependencies ────────────────────────────────────────────────────────
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly document = inject(DOCUMENT);

  // ─── Inputs ──────────────────────────────────────────────────────────────
  /** Lets the host conditionally disable trapping (e.g. while a nested overlay owns focus). */
  readonly enabled = input<boolean>(true, { alias: 'tpFocusTrapEnabled' });

  // ─── Host listeners ──────────────────────────────────────────────────────
  /** Forward Tab: wraps from last focusable back to first when on the boundary. */
  @HostListener('keydown.Tab', ['$event'])
  protected onTab(event: KeyboardEvent): void {
    // Bail when the parent has temporarily disabled trapping (e.g. nested overlay owns focus).
    if (!this.enabled()) return;
    // Delegate to the shared handler with `shift=false` for the forward-cycle branch.
    this.handleTab(event, false);
  }

  /** Backward Tab: wraps from first focusable back to last (and also reels focus in if it has escaped the host). */
  @HostListener('keydown.shift.Tab', ['$event'])
  protected onShiftTab(event: KeyboardEvent): void {
    // Same enabled gate as the forward handler — keep both branches symmetric.
    if (!this.enabled()) return;
    // `shift=true` activates the backward-wrap path inside `handleTab`.
    this.handleTab(event, true);
  }

  // ─── Private methods ─────────────────────────────────────────────────────
  /** Shared Tab handler — re-queries the focusable set per keystroke so dynamically added controls participate. */
  private handleTab(event: KeyboardEvent, shift: boolean): void {
    // Fresh query every Tab — late-mounted controls (dynamic-form fields) must participate without re-binding.
    const focusable = this.focusableNodes();
    // No focusables at all → swallow Tab so focus can't escape the trap into the backdrop / page chrome.
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    // First and last define the wrap boundary; any element between them tabs naturally without our intervention.
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    // Current focus owner — may be outside the host (e.g. focus has leaked) so the backward branch handles reeling in.
    const active = this.document.activeElement as HTMLElement | null;

    if (!shift && active === last) {
      // Forward Tab on the last element → wrap to first.
      event.preventDefault();
      first.focus();
    } else if (shift && (active === first || !this.host.nativeElement.contains(active))) {
      // Shift+Tab on the first element OR focus has escaped the host → snap back to the last focusable.
      event.preventDefault();
      last.focus();
    }
  }

  /** Live query of currently-visible focusables under the host. `offsetParent !== null` strips `display:none` nodes
   *  but the activeElement is kept so an inputs-hidden-then-revealed cycle doesn't lose its anchor. */
  private focusableNodes(): HTMLElement[] {
    // Fresh DOM query — dynamic forms add/remove controls between keystrokes; cached lists go stale.
    const nodes = this.host.nativeElement.querySelectorAll(FOCUSABLE_SELECTOR);
    // `offsetParent === null` is the cheap "display:none / detached" check; keep activeElement so transient hide cycles don't lose the anchor.
    return Array.from(nodes as NodeListOf<HTMLElement>).filter(
      (el) => el.offsetParent !== null || el === this.document.activeElement,
    );
  }
}
