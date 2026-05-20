import { DOCUMENT } from '@angular/common';
import {
  Directive,
  ElementRef,
  EmbeddedViewRef,
  HostListener,
  OnDestroy,
  Renderer2,
  TemplateRef,
  ViewContainerRef,
  inject,
  signal,
} from '@angular/core';

import {
  bindReflowListeners,
  computeAnchoredPosition,
  createBodyPortal,
  destroyBodyPortal,
} from '../overlay/popover-overlay';

/** Base for anchored popover pickers: portal, positioning, outside-click, keyboard cycling. */
@Directive()
export abstract class PickerOverlayBase<TId> implements OnDestroy {
  // ─── Dependencies ────────────────────────────────────────────────────────
  protected readonly host = inject(ElementRef<HTMLElement>);
  protected readonly renderer = inject(Renderer2);
  protected readonly document = inject(DOCUMENT);
  protected readonly viewContainer = inject(ViewContainerRef);

  // ─── View Queries (subclass declares the @ViewChild) ─────────────────────
  protected abstract panelTmpl: TemplateRef<unknown>;

  // ─── Writable Signals ────────────────────────────────────────────────────
  protected readonly open = signal(false);
  protected readonly panelTop = signal(0);
  protected readonly panelLeft = signal(0);
  protected readonly panelMinWidth = signal(0);

  // ─── Private state ───────────────────────────────────────────────────────
  private overlayHost: HTMLDivElement | null = null;
  private viewRef: EmbeddedViewRef<unknown> | null = null;
  private readonly cleanupFns: Array<() => void> = [];

  // ─── Lifecycle ───────────────────────────────────────────────────────────
  ngOnDestroy(): void {
    this.unmountPanel();
  }

  // ─── Public API / UI Actions ─────────────────────────────────────────────
  protected toggle(): void {
    if (this.isDisabled()) return;
    if (this.open()) {
      this.close();
      return;
    }
    this.onBeforeOpen();
    this.open.set(true);
    this.computePosition();
    this.mountPanel();
    // Re-measure after the panel paints to anchor against actual height.
    requestAnimationFrame(() => this.computePosition());
  }

  protected select(id: TId): void {
    this.emitChange(id);
    this.close();
  }

  protected close(): void {
    this.open.set(false);
    this.unmountPanel();
  }

  // ─── Host listeners ──────────────────────────────────────────────────────
  @HostListener('document:click', ['$event'])
  protected onDocClick(event: MouseEvent): void {
    if (!this.open()) return;
    const target = event.target as Node;
    if (this.host.nativeElement.contains(target)) return;
    if (this.overlayHost?.contains(target)) return;
    this.close();
  }

  @HostListener('keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    if (!this.open()) {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.toggle();
      }
      return;
    }
    const ids = this.getNavigableIds();
    if (ids.length === 0) {
      if (event.key === 'Escape') this.close();
      return;
    }
    const idx = ids.findIndex((x) => this.idsEqual(x, this.getActiveId()));
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.setActiveId(ids[(idx + 1) % ids.length]);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.setActiveId(ids[(idx - 1 + ids.length) % ids.length]);
        break;
      case 'Enter': {
        event.preventDefault();
        const active = this.getActiveId();
        if (active !== null) this.select(active);
        break;
      }
      case 'Escape':
        event.preventDefault();
        this.close();
        break;
    }
  }

  // ─── Subclass contract ───────────────────────────────────────────────────
  protected abstract isDisabled(): boolean;
  protected abstract onBeforeOpen(): void;
  protected abstract getActiveId(): TId | null;
  protected abstract setActiveId(id: TId | null): void;
  protected abstract getNavigableIds(): readonly TId[];
  protected abstract emitChange(id: TId): void;
  /** Override to change min-width passed to `computeAnchoredPosition`. */
  protected getMinWidth(): number {
    return 240;
  }
  /** Override only if subclass needs custom equality (default: `===`). */
  protected idsEqual(a: TId | null, b: TId | null): boolean {
    return a === b;
  }

  // ─── Private methods ─────────────────────────────────────────────────────
  private mountPanel(): void {
    if (this.viewRef) return;
    const overlay = createBodyPortal(this.document);
    const view = this.viewContainer.createEmbeddedView(this.panelTmpl);
    view.detectChanges();
    for (const node of view.rootNodes) {
      this.renderer.appendChild(overlay, node);
    }
    this.overlayHost = overlay;
    this.viewRef = view;
    this.cleanupFns.push(bindReflowListeners(() => this.computePosition()));
  }

  private unmountPanel(): void {
    while (this.cleanupFns.length > 0) {
      try {
        this.cleanupFns.pop()?.();
      } catch {
        /* swallow listener cleanup errors */
      }
    }
    if (!this.viewRef) return;
    this.viewRef.destroy();
    this.viewRef = null;
    destroyBodyPortal(this.overlayHost);
    this.overlayHost = null;
  }

  private computePosition(): void {
    const trigger = this.host.nativeElement.querySelector('.trigger') as HTMLElement | null;
    if (!trigger) return;
    const panelEl = this.overlayHost?.querySelector('.panel') as HTMLElement | null;
    const panelHeight = panelEl ? panelEl.getBoundingClientRect().height : 0;
    const { top, left, minWidth } = computeAnchoredPosition(trigger, panelHeight, {
      minWidth: this.getMinWidth(),
    });
    this.panelTop.set(top);
    this.panelLeft.set(left);
    this.panelMinWidth.set(minWidth);
  }
}
