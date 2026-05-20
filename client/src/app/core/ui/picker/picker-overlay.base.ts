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
    // Always tear down — covers route-change-while-open and similar parent-unmount races.
    this.unmountPanel();
  }

  // ─── Public API / UI Actions ─────────────────────────────────────────────
  /** Open/close the panel. When opening, runs `onBeforeOpen` so the subclass can seed its active id. */
  protected toggle(): void {
    // Subclass-driven disabled gate — disabled state must refuse to open via click and keyboard alike.
    if (this.isDisabled()) return;
    // Already open → close branch; keeps `toggle` truly idempotent on repeated clicks.
    if (this.open()) {
      this.close();
      return;
    }
    // Let the subclass seed its keyboard cursor before the panel paints so ArrowDown lands intuitively.
    this.onBeforeOpen();
    // Flip `open` first — template uses it for aria-expanded; panel template needs it before mount.
    this.open.set(true);
    // Initial measurement uses an estimated height (panel not painted yet); good enough for first paint frame.
    this.computePosition();
    // Now physically mount into the body portal.
    this.mountPanel();
    // Re-measure after the panel paints to anchor against actual height.
    requestAnimationFrame(() => this.computePosition());
  }

  /** Commit an option — emit the change then auto-close. */
  protected select(id: TId): void {
    // Notify consumer first so parent state can update before the panel disappears.
    this.emitChange(id);
    // Auto-close: pickers are single-select; selecting always dismisses.
    this.close();
  }

  /** Close the panel and tear down the portal + listeners. */
  protected close(): void {
    // Flip state first so any aria-expanded binding updates before the DOM disappears.
    this.open.set(false);
    // Unmount happens after the signal flip — subclasses can observe the open=false transition.
    this.unmountPanel();
  }

  // ─── Host listeners ──────────────────────────────────────────────────────
  /** Outside-click dismissal — ignores clicks inside the trigger host or the portaled panel itself. */
  @HostListener('document:click', ['$event'])
  protected onDocClick(event: MouseEvent): void {
    // No work if we're already closed — keeps every click cheap when nothing's open.
    if (!this.open()) return;
    // Click target as Node so both Element and Text-node targets work with `.contains`.
    const target = event.target as Node;
    // Click landed on the trigger / its children — toggle handles the open-close cycle; don't double-close here.
    if (this.host.nativeElement.contains(target)) return;
    // Click landed inside the portaled panel — that's a selection action, not a dismiss.
    if (this.overlayHost?.contains(target)) return;
    // True outside click → dismiss.
    this.close();
  }

  /** Keyboard model: when closed, ArrowDown/Enter/Space opens; when open, arrows cycle / Enter selects / Escape closes. */
  @HostListener('keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    if (!this.open()) {
      // Closed branch: only the three open-trigger keys are intercepted; everything else falls through to the page.
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        // Prevent the default Space-page-scroll / Enter-form-submit when used to open the picker.
        event.preventDefault();
        this.toggle();
      }
      return;
    }
    // Live navigable id list — recomputed per keystroke so a search-filter narrows the set immediately.
    const ids = this.getNavigableIds();
    if (ids.length === 0) {
      // Escape still works on an empty list (e.g. search returned no matches) — every other key is inert.
      if (event.key === 'Escape') this.close();
      return;
    }
    // Index of the current cursor inside `ids`; `-1` if cursor sits on a now-filtered-out id (treat as before-first).
    const idx = ids.findIndex((x) => this.idsEqual(x, this.getActiveId()));
    switch (event.key) {
      case 'ArrowDown':
        // Wrap on overflow so cycling never lands on an out-of-range index.
        event.preventDefault();
        this.setActiveId(ids[(idx + 1) % ids.length]);
        break;
      case 'ArrowUp':
        // `+ ids.length` ensures the modulo is positive even when `idx === 0`.
        event.preventDefault();
        this.setActiveId(ids[(idx - 1 + ids.length) % ids.length]);
        break;
      case 'Enter': {
        event.preventDefault();
        // Snapshot cursor at the moment of Enter — `select` mutates state via `close`.
        const active = this.getActiveId();
        // Defensive null guard: empty-list path above already handles 0-length, this catches the not-yet-positioned case.
        if (active !== null) this.select(active);
        break;
      }
      case 'Escape':
        // Stop Escape from bubbling to the route-level keyboard handler (would close the parent modal).
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
    // Idempotency: a double-toggle race must not double-mount.
    if (this.viewRef) return;
    // Fresh body-level host — escapes ancestor `overflow:hidden` and stacking contexts.
    const overlay = createBodyPortal(this.document);
    // Instantiate the subclass-provided template against the directive's own DI scope (Angular wiring intact).
    const view = this.viewContainer.createEmbeddedView(this.panelTmpl);
    // Manual CD pass so structural directives inside the template resolve before we move root nodes.
    view.detectChanges();
    for (const node of view.rootNodes) {
      // Renderer2 (not direct DOM append) so SSR / platform-server abstractions keep working.
      this.renderer.appendChild(overlay, node);
    }
    // Cache references so close can tear down symmetrically.
    this.overlayHost = overlay;
    this.viewRef = view;
    // Bind reflow listeners last; the cleanup fn is stored so close drains them.
    this.cleanupFns.push(bindReflowListeners(() => this.computePosition()));
  }

  /** Tears down the portal + listeners. Idempotent so `ngOnDestroy` and explicit `close()` are both safe. */
  private unmountPanel(): void {
    // Drain listener teardowns first so a buggy listener can't fire after the view is gone.
    while (this.cleanupFns.length > 0) {
      try {
        this.cleanupFns.pop()?.();
      } catch {
        /* swallow listener cleanup errors */
      }
    }
    // Already torn down → nothing else to do (covers double-close + ngOnDestroy-after-close).
    if (!this.viewRef) return;
    // Destroy the embedded view explicitly so child subscriptions / signal effects unwire.
    this.viewRef.destroy();
    this.viewRef = null;
    // Remove the body host last — view destruction may still touch nodes inside it.
    destroyBodyPortal(this.overlayHost);
    this.overlayHost = null;
  }

  /** Measures the trigger + the rendered panel and pushes new top/left/minWidth into the position signals. */
  private computePosition(): void {
    // Trigger element provides anchor geometry — bail when the host's template hasn't rendered it yet.
    const trigger = this.host.nativeElement.querySelector('.trigger') as HTMLElement | null;
    if (!trigger) return;
    // Panel element may be null on the first call (pre-mount); the position math handles `panelHeight=0` gracefully.
    const panelEl = this.overlayHost?.querySelector('.panel') as HTMLElement | null;
    // Live height read so flip-decision uses post-render measurements, not estimates.
    const panelHeight = panelEl ? panelEl.getBoundingClientRect().height : 0;
    // Pure positioning math — clamps inside viewport, flips above when needed.
    const { top, left, minWidth } = computeAnchoredPosition(trigger, panelHeight, {
      minWidth: this.getMinWidth(),
    });
    // Push into signals so the bound styles update without an extra change-detection tick.
    this.panelTop.set(top);
    this.panelLeft.set(left);
    this.panelMinWidth.set(minWidth);
  }
}
