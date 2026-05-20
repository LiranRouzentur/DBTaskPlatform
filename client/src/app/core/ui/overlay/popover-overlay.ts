/** Resolved popover placement in viewport pixels. `minWidth` lets the panel grow but never shrink below the trigger. */
export interface PanelPosition {
  readonly top: number;
  readonly left: number;
  readonly minWidth: number;
}

/** Per-call tuning knobs for `computeAnchoredPosition`. */
export interface ComputePositionOptions {
  /** Minimum panel width in pixels — caller defaults to the trigger's own width when omitted. */
  readonly minWidth?: number;
  /** Vertical gap between trigger and panel — used for both below and above placements. */
  readonly gap?: number;
  /** Safe-area margin from viewport edges — prevents the panel from clipping at screen boundaries. */
  readonly margin?: number;
}

/** Creates a body-level `<div>` host so the panel escapes ancestor `overflow:hidden` / stacking contexts. */
export function createBodyPortal(doc: Document = document): HTMLDivElement {
  const overlay = doc.createElement('div');
  overlay.setAttribute('data-tp-popover-overlay', '');
  doc.body.appendChild(overlay);
  return overlay;
}

/** Removes the portal host from `<body>`. Safe to call with `null` for symmetry with the create/destroy lifecycle. */
export function destroyBodyPortal(overlay: HTMLDivElement | null): void {
  if (!overlay) return;
  overlay.parentNode?.removeChild(overlay);
}

/** Positions a panel below (or above, if no room) a trigger, clamped inside the visual viewport.
 *  Pure function — caller is responsible for applying the resulting top/left/minWidth as styles. */
export function computeAnchoredPosition(
  trigger: HTMLElement,
  panelHeight: number,
  options: ComputePositionOptions = {},
): PanelPosition {
  const rect = trigger.getBoundingClientRect();
  const margin = options.margin ?? 8;
  const gap = options.gap ?? 6;
  const minWidth = Math.max(rect.width, options.minWidth ?? rect.width);

  // visualViewport accounts for on-screen keyboards and pinch-zoom; fall back to inner* on older browsers.
  const vv = window.visualViewport;
  const viewportWidth = vv?.width ?? window.innerWidth;
  const viewportHeight = vv?.height ?? window.innerHeight;

  let left = rect.right - minWidth;
  const maxLeft = viewportWidth - minWidth - margin;
  if (left > maxLeft) left = maxLeft;
  if (left < margin) left = margin;

  let top = rect.bottom + gap;
  if (panelHeight > 0) {
    const spaceBelow = viewportHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const fitsBelow = panelHeight <= spaceBelow;
    // Flip to above-trigger placement when there's more headroom upward than downward.
    if (!fitsBelow && spaceAbove > spaceBelow) {
      top = rect.top - panelHeight - gap;
    }
    const maxTop = viewportHeight - panelHeight - margin;
    if (top > maxTop) top = maxTop;
    if (top < margin) top = margin;
  }

  return { top, left, minWidth };
}

/** Subscribes to viewport / scroll changes that should reposition an open panel.
 *  Returns a single cleanup that removes every listener — call on close to avoid leaks. */
export function bindReflowListeners(onReflow: () => void): () => void {
  window.addEventListener('resize', onReflow, { passive: true });
  // `capture: true` so scrolling inside any ancestor (not just window) triggers a reflow.
  window.addEventListener('scroll', onReflow, { passive: true, capture: true });
  window.visualViewport?.addEventListener('resize', onReflow);
  window.visualViewport?.addEventListener('scroll', onReflow);
  return () => {
    window.removeEventListener('resize', onReflow);
    window.removeEventListener('scroll', onReflow, true);
    window.visualViewport?.removeEventListener('resize', onReflow);
    window.visualViewport?.removeEventListener('scroll', onReflow);
  };
}
