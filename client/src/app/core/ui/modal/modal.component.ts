import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  inject,
  input,
  output,
} from '@angular/core';

import { FocusTrapDirective } from '../focus-trap/focus-trap.directive';
import { IconButtonComponent } from '../icon-button/icon-button.component';

/** Three-step modal width — `md` is the default, `sm` for confirms, `lg` for forms with many fields. */
export type ModalSize = 'sm' | 'md' | 'lg';

// Module-scoped stack: only the topmost modal handles Escape; body scroll-lock engages on
// first push, releases on last pop. Stack ordering is mount-order — the last pushed is "top".
const MODAL_STACK: ModalComponent[] = [];

@Component({
  selector: 'tp-modal',
  standalone: true,
  imports: [IconButtonComponent, FocusTrapDirective],
  template: `
    <div class="backdrop" (click)="onBackdropClick()" aria-hidden="true"></div>
    <div
      class="surface"
      role="dialog"
      aria-modal="true"
      [attr.aria-labelledby]="title() ? 'tp-modal-title' : null"
      [attr.aria-label]="title() ? null : ariaLabel()"
      tabindex="-1"
      tpFocusTrap
      #surfaceRef
    >
      <header class="header">
        <div class="head-text">
          @if (eyebrow()) { <span class="eyebrow">{{ eyebrow() }}</span> }
          @if (title()) { <h2 id="tp-modal-title" class="title">{{ title() }}</h2> }
          @if (subtitle()) { <p class="subtitle">{{ subtitle() }}</p> }
        </div>
        <tp-icon-button
          icon="x"
          label="Close"
          variant="ghost"
          (click)="emitClose()"
        />
      </header>

      <div class="body">
        <ng-content />
      </div>

      <footer class="footer">
        <ng-content select="[footer]" />
      </footer>
    </div>
  `,
  styleUrl: './modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
/** Base dialog primitive — backdrop, surface, focus-trap, scroll-lock, stacking, focus restore.
 *  Modals are mounted as child routes (see frontend.md §5); this component owns only the chrome. */
export class ModalComponent implements OnInit, OnDestroy {
  // ─── Dependencies ────────────────────────────────────────────────────────
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly doc = inject(DOCUMENT);

  // ─── Inputs / Outputs ────────────────────────────────────────────────────
  /** Dialog title rendered as `<h2>` and linked via `aria-labelledby` for screen readers. */
  readonly title = input<string | null>(null);
  /** Secondary line under the title — typically describes the task or context. */
  readonly subtitle = input<string | null>(null);
  /** Tiny uppercase label above the title (e.g. "Step 2 of 3"). */
  readonly eyebrow = input<string | null>(null);
  /** Width preset for the dialog surface. */
  readonly size = input<ModalSize>('md');
  /** When true (default), clicking the backdrop closes the dialog — disable for forms with unsaved changes. */
  readonly closeOnBackdrop = input<boolean>(true);
  /** Fallback accessible name when no `title` is set — only one of the two ends up on the surface element. */
  readonly ariaLabel = input<string | null>(null);

  /** Emitted whenever the user requests close (Escape, backdrop click, or the X button). Caller handles routing. */
  readonly closed = output<void>();

  // ─── Private state ───────────────────────────────────────────────────────
  /** Snapshot of the element that had focus at open-time — focus is restored to it on destroy. */
  private previousActive: HTMLElement | null = null;

  // ─── Lifecycle ───────────────────────────────────────────────────────────
  /** Pushes onto the stack, locks body scroll on first push, and defers initial focus until the surface paints. */
  ngOnInit(): void {
    // Snapshot the element that owned focus pre-open so ngOnDestroy can restore it (a11y: focus must not vanish).
    this.previousActive = this.doc.activeElement as HTMLElement | null;
    // Lock body scroll only on the first modal — nested modals share the same lock.
    if (MODAL_STACK.length === 0) {
      // Setting `overflow:hidden` on body prevents background scroll while the dialog has focus.
      this.doc.body.style.overflow = 'hidden';
    }
    // Push self last so this instance becomes "top of stack" — drives Escape ownership + scroll-lock release.
    MODAL_STACK.push(this);
    // queueMicrotask defers until after Angular has rendered the surface so querySelector can find focusables.
    queueMicrotask(() => {
      // Look up the dialog surface inside the component — the focusable scan is scoped to it (not the backdrop).
      const surface = this.host.nativeElement.querySelector('.surface') as HTMLElement | null;
      // First interactive control wins initial focus so keyboard users don't have to Tab from the surface itself.
      const firstFocusable = surface?.querySelector<HTMLElement>(
        'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      );
      // Fall back to focusing the surface (`tabindex=-1`) when there's no focusable inside — Escape/Tab still work.
      (firstFocusable ?? surface)?.focus();
    });
  }

  /** Pops the stack, releases body scroll only when stack empties, and restores focus to the pre-open element. */
  ngOnDestroy(): void {
    // Locate self in the stack defensively — `indexOf` handles the impossible-but-cheap "already removed" case.
    const idx = MODAL_STACK.indexOf(this);
    if (idx >= 0) MODAL_STACK.splice(idx, 1);
    // Release scroll-lock only when the last modal closes — nested modals must keep the lock engaged.
    if (MODAL_STACK.length === 0) {
      // Clear inline style so the previous CSS-controlled value re-applies.
      this.doc.body.style.overflow = '';
    }
    // Cache the previously-focused element locally — `this.previousActive` may be GC'd inside the rAF closure.
    const prev = this.previousActive;
    if (prev && typeof prev.focus === 'function') {
      // rAF defers focus restoration past Angular's own cleanup so we don't focus an element that's about to be removed.
      requestAnimationFrame(() => prev.focus());
    }
  }

  // ─── Public API / UI Actions ─────────────────────────────────────────────
  /** Single emitter for every close trigger (X button, Escape, backdrop) — caller routes back. */
  protected emitClose(): void {
    // One canonical exit point — keeps every dismissal path symmetric for the parent router.
    this.closed.emit();
  }

  /** Backdrop click handler — gated by `closeOnBackdrop` so forms with unsaved changes can suppress it. */
  protected onBackdropClick(): void {
    // Forms with dirty state opt out by passing `closeOnBackdrop=false`; everything else dismisses naturally.
    if (this.closeOnBackdrop()) this.emitClose();
  }

  // ─── Host listeners ──────────────────────────────────────────────────────
  /** Document-level Escape handler — only the top-most modal in the stack reacts, so nesting works naturally. */
  @HostListener('document:keydown.escape', ['$event'])
  protected onEscape(ev: KeyboardEvent): void {
    // Only the top-most modal in the stack reacts to Escape.
    if (MODAL_STACK[MODAL_STACK.length - 1] !== this) return;
    // Stop propagation so a router-level keyboard handler doesn't also navigate away.
    ev.stopPropagation();
    this.emitClose();
  }
}
