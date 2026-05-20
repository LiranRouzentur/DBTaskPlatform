
export interface PanelPosition {
  readonly top: number;
  readonly left: number;
  readonly minWidth: number;
}

export interface ComputePositionOptions {
  
  readonly minWidth?: number;
  
  readonly gap?: number;
  
  readonly margin?: number;
}

export function createBodyPortal(doc: Document = document): HTMLDivElement {
  const overlay = doc.createElement('div');
  overlay.setAttribute('data-tp-popover-overlay', '');
  doc.body.appendChild(overlay);
  return overlay;
}

export function destroyBodyPortal(overlay: HTMLDivElement | null): void {
  if (!overlay) return;
  overlay.parentNode?.removeChild(overlay);
}

export function computeAnchoredPosition(
  trigger: HTMLElement,
  panelHeight: number,
  options: ComputePositionOptions = {},
): PanelPosition {
  const rect = trigger.getBoundingClientRect();
  const margin = options.margin ?? 8;
  const gap = options.gap ?? 6;
  const minWidth = Math.max(rect.width, options.minWidth ?? rect.width);

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
    if (!fitsBelow && spaceAbove > spaceBelow) {
      top = rect.top - panelHeight - gap;
    }
    const maxTop = viewportHeight - panelHeight - margin;
    if (top > maxTop) top = maxTop;
    if (top < margin) top = margin;
  }

  return { top, left, minWidth };
}

export function bindReflowListeners(onReflow: () => void): () => void {
  window.addEventListener('resize', onReflow, { passive: true });
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
