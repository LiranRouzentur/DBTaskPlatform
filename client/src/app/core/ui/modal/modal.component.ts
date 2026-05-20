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

export type ModalSize = 'sm' | 'md' | 'lg';

// Module-scoped stack: only the topmost modal handles Escape; body scroll-lock engages on
// first push, releases on last pop.
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
export class ModalComponent implements OnInit, OnDestroy {
  // ─── Dependencies ────────────────────────────────────────────────────────
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly doc = inject(DOCUMENT);

  // ─── Inputs / Outputs ────────────────────────────────────────────────────
  readonly title = input<string | null>(null);
  readonly subtitle = input<string | null>(null);
  readonly eyebrow = input<string | null>(null);
  readonly size = input<ModalSize>('md');
  readonly closeOnBackdrop = input<boolean>(true);
  readonly ariaLabel = input<string | null>(null);

  readonly closed = output<void>();

  // ─── Private state ───────────────────────────────────────────────────────
  private previousActive: HTMLElement | null = null;

  // ─── Lifecycle ───────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.previousActive = this.doc.activeElement as HTMLElement | null;
    if (MODAL_STACK.length === 0) {
      this.doc.body.style.overflow = 'hidden';
    }
    MODAL_STACK.push(this);
    queueMicrotask(() => {
      const surface = this.host.nativeElement.querySelector('.surface') as HTMLElement | null;
      const firstFocusable = surface?.querySelector<HTMLElement>(
        'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      );
      (firstFocusable ?? surface)?.focus();
    });
  }

  ngOnDestroy(): void {
    const idx = MODAL_STACK.indexOf(this);
    if (idx >= 0) MODAL_STACK.splice(idx, 1);
    if (MODAL_STACK.length === 0) {
      this.doc.body.style.overflow = '';
    }
    const prev = this.previousActive;
    if (prev && typeof prev.focus === 'function') {
      requestAnimationFrame(() => prev.focus());
    }
  }

  // ─── Public API / UI Actions ─────────────────────────────────────────────
  protected emitClose(): void {
    this.closed.emit();
  }

  protected onBackdropClick(): void {
    if (this.closeOnBackdrop()) this.emitClose();
  }

  // ─── Host listeners ──────────────────────────────────────────────────────
  @HostListener('document:keydown.escape', ['$event'])
  protected onEscape(ev: KeyboardEvent): void {
    // Only the top-most modal in the stack reacts to Escape.
    if (MODAL_STACK[MODAL_STACK.length - 1] !== this) return;
    ev.stopPropagation();
    this.emitClose();
  }
}
