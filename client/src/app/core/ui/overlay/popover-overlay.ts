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
  // Fresh host per open — disposing it on close cleanly releases any styles attached by the panel template.
  const overlay = doc.createElement('div');
  // Marker attribute used by tests + dev tools to identify portal hosts; no styling depends on it.
  overlay.setAttribute('data-tp-popover-overlay', '');
  // Mount on body (not on the trigger's parent) so the panel escapes overflow / z-index stacking contexts.
  doc.body.appendChild(overlay);
  return overlay;
}

/** Removes the portal host from `<body>`. Safe to call with `null` for symmetry with the create/destroy lifecycle. */
export function destroyBodyPortal(overlay: HTMLDivElement | null): void {
  // Null-tolerant for symmetric "always call on close" usage, even when open never reached create.
  if (!overlay) return;
  // Use parentNode rather than `document.body` directly — host may have been moved during tests.
  overlay.parentNode?.removeChild(overlay);
}

/** Positions a panel below (or above, if no room) a trigger, clamped inside the visual viewport.
 *  Pure function — caller is responsible for applying the resulting top/left/minWidth as styles. */
export function computeAnchoredPosition(
  trigger: HTMLElement,
  panelHeight: number,
  options: ComputePositionOptions = {},
): PanelPosition {
  // Live trigger geometry — caller re-invokes on reflow events so this stays current.
  const rect = trigger.getBoundingClientRect();
  // Safe-area margin from viewport edges to prevent clipping at screen boundaries.
  const margin = options.margin ?? 8;
  // Vertical gap between trigger and panel.
  const gap = options.gap ?? 6;
  // Panel grows but never shrinks below trigger width — keeps the visual relationship clear.
  const minWidth = Math.max(rect.width, options.minWidth ?? rect.width);

  // visualViewport accounts for on-screen keyboards and pinch-zoom; fall back to inner* on older browsers.
  const vv = window.visualViewport;
  const viewportWidth = vv?.width ?? window.innerWidth;
  const viewportHeight = vv?.height ?? window.innerHeight;

  // Default alignment: right edge of panel sits at right edge of trigger (RTL-friendly for short labels).
  let left = rect.right - minWidth;
  // Right-edge clamp — keeps panel from spilling past viewport's right margin.
  const maxLeft = viewportWidth - minWidth - margin;
  if (left > maxLeft) left = maxLeft;
  // Left-edge clamp — when the trigger is in the far right column, prevent going off-screen left as well.
  if (left < margin) left = margin;

  // Default vertical: just below the trigger with the configured gap.
  let top = rect.bottom + gap;
  if (panelHeight > 0) {
    // Available room below trigger inside the viewport — drives the flip decision.
    const spaceBelow = viewportHeight - rect.bottom - margin;
    // Available room above trigger inside the viewport.
    const spaceAbove = rect.top - margin;
    // True when the panel can render entirely below without clipping.
    const fitsBelow = panelHeight <= spaceBelow;
    // Flip to above-trigger placement when there's more headroom upward than downward.
    if (!fitsBelow && spaceAbove > spaceBelow) {
      top = rect.top - panelHeight - gap;
    }
    // Bottom clamp — when neither side fits cleanly, anchor to bottom of viewport.
    const maxTop = viewportHeight - panelHeight - margin;
    if (top > maxTop) top = maxTop;
    // Top clamp — last-resort guard against extremely tall panels overflowing the top of the viewport.
    if (top < margin) top = margin;
  }

  return { top, left, minWidth };
}

/** Subscribes to viewport / scroll changes that should reposition an open panel.
 *  Returns a single cleanup that removes every listener — call on close to avoid leaks. */
export function bindReflowListeners(onReflow: () => void): () => void {
  // Window resize: drag-to-resize, DevTools open, OS-level scaling.
  window.addEventListener('resize', onReflow, { passive: true });
  // `capture: true` so scrolling inside any ancestor (not just window) triggers a reflow.
  window.addEventListener('scroll', onReflow, { passive: true, capture: true });
  // visualViewport fires on pinch-zoom and on-screen keyboard show/hide where regular events stay silent.
  window.visualViewport?.addEventListener('resize', onReflow);
  window.visualViewport?.addEventListener('scroll', onReflow);
  // Single cleanup function returned — caller stores and invokes on close so we never leak global listeners.
  return () => {
    window.removeEventListener('resize', onReflow);
    // Must pass `true` to remove the capture-phase listener registered above.
    window.removeEventListener('scroll', onReflow, true);
    window.visualViewport?.removeEventListener('resize', onReflow);
    window.visualViewport?.removeEventListener('scroll', onReflow);
  };
}
