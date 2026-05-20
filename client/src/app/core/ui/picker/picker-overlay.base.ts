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
  /** Subclass-provided template — instantiated into a body portal on open, destroyed on close. */
  protected abstract panelTmpl: TemplateRef<unknown>;

  // ─── Writable Signals ────────────────────────────────────────────────────
  /** True while the panel is mounted — drives `aria-expanded` and conditional rendering. */
  protected readonly open = signal(false);
  /** Top coordinate of the floating panel in viewport pixels — recomputed on open and reflow. */
  protected readonly panelTop = signal(0);
  /** Left coordinate of the floating panel in viewport pixels — recomputed on open and reflow. */
  protected readonly panelLeft = signal(0);
  /** Resolved min-width of the panel — at least the trigger's width, possibly more via `getMinWidth()`. */
  protected readonly panelMinWidth = signal(0);

  // ─── Private state ───────────────────────────────────────────────────────
  /** Body-level host element that backs the portal; null while the panel is closed. */
  private overlayHost: HTMLDivElement | null = null;
  /** Embedded view holding the panel — destroyed on close to prevent zombie subscriptions. */
  private viewRef: EmbeddedViewRef<unknown> | null = null;
  /** Reflow / outside-click listener teardowns — drained on unmount to avoid leaks. */
  private readonly cleanupFns: Array<() => void> = [];

  // ─── Lifecycle ───────────────────────────────────────────────────────────
  /** Catches the case where the host directive is destroyed while the panel is still open. */
  ngOnDestroy(): void {
    this.unmountPanel();
  }

  // ─── Public API / UI Actions ─────────────────────────────────────────────
  /** Open/close the panel. When opening, runs `onBeforeOpen` so the subclass can seed its active id. */
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

  /** Commit an option — emit the change then auto-close. */
  protected select(id: TId): void {
    this.emitChange(id);
    this.close();
  }

  /** Close the panel and tear down the portal + listeners. */
  protected close(): void {
    this.open.set(false);
    this.unmountPanel();
  }

  // ─── Host listeners ──────────────────────────────────────────────────────
  /** Outside-click dismissal — ignores clicks inside the trigger host or the portaled panel itself. */
  @HostListener('document:click', ['$event'])
  protected onDocClick(event: MouseEvent): void {
    if (!this.open()) return;
    const target = event.target as Node;
    if (this.host.nativeElement.contains(target)) return;
    if (this.overlayHost?.contains(target)) return;
    this.close();
  }

  /** Keyboard model: when closed, ArrowDown/Enter/Space opens; when open, arrows cycle / Enter selects / Escape closes. */
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
  /** Whether the trigger should refuse to open (e.g. disabled by parent). */
  protected abstract isDisabled(): boolean;
  /** Subclass hook to seed `activeId` (or any per-open state) just before mount. */
  protected abstract onBeforeOpen(): void;
  /** Currently highlighted option — drives arrow-key cycling and `is-active` styling. */
  protected abstract getActiveId(): TId | null;
  /** Setter counterpart to `getActiveId` — base class calls it during ArrowUp/ArrowDown. */
  protected abstract setActiveId(id: TId | null): void;
  /** Ordered list of ids that arrow-keys can land on (e.g. visible/filtered set). */
  protected abstract getNavigableIds(): readonly TId[];
  /** Emit the selected id to the consumer — base class invokes from `select()`. */
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
  /** Instantiates `panelTmpl` into a fresh body portal and registers reflow listeners. */
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

  /** Tears down the portal + listeners. Idempotent so `ngOnDestroy` and explicit `close()` are both safe. */
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

  /** Measures the trigger + the rendered panel and pushes new top/left/minWidth into the position signals. */
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
