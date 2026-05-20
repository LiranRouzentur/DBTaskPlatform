import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/** SVG `<path>` markup per icon name. Inlined (no sprite sheet) so the app ships zero icon HTTP requests. */
const ICONS: Record<string, string> = {
  'chevron-down':
    '<polyline points="6 9 12 15 18 9"/>',
  'chevron-up':
    '<polyline points="18 15 12 9 6 15"/>',
  'chevron-right':
    '<polyline points="9 18 15 12 9 6"/>',
  'chevron-left':
    '<polyline points="15 18 9 12 15 6"/>',
  'arrow-right':
    '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  'arrow-left':
    '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  'plus':
    '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  'minus':
    '<line x1="5" y1="12" x2="19" y2="12"/>',
  'x':
    '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  'check':
    '<polyline points="20 6 9 17 4 12"/>',
  'check-circle':
    '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  'alert-triangle':
    '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  'alert-circle':
    '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  'info':
    '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  'wifi-off':
    '<line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.58 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>',
  'refresh':
    '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/>',
  'user':
    '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  'users':
    '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  'search':
    '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  'inbox':
    '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  'circle':
    '<circle cx="12" cy="12" r="10"/>',
  'circle-dot':
    '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3" fill="currentColor"/>',
  'circle-check':
    '<circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/>',
  'lock':
    '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  'corner-down-left':
    '<polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/>',
  'corner-up-right':
    '<polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/>',
  'list':
    '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  'send':
    '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  'layers':
    '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  'sparkles':
    '<path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/><path d="M19 14l.75 2.25L22 17l-2.25.75L19 20l-.75-2.25L16 17l2.25-.75L19 14z"/>',
};

/** Union of valid icon names — derived from `ICONS` so the compiler catches typos at every call site. */
export type IconName = keyof typeof ICONS;

@Component({
  selector: 'tp-icon',
  standalone: true,
  template: `<span class="icon-host" [innerHTML]="markup()"></span>`,
  styles: [
    `
      :host {
        display: inline-flex;
        flex: none;
        line-height: 0;
        color: inherit;
      }
      .icon-host,
      .icon-host > svg {
        display: inline-flex;
        line-height: 0;
        color: inherit;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
/** Inline-SVG icon renderer. Markup comes from the typed `ICONS` map — no external assets. */
export class IconComponent {
  // ─── Dependencies ────────────────────────────────────────────────────────
  private readonly sanitizer = inject(DomSanitizer);

  // ─── Inputs ──────────────────────────────────────────────────────────────
  /** Which icon to render. Compile-time-checked via `IconName`. */
  readonly name = input.required<IconName>();
  /** Pixel dimensions for both width and height — viewBox is fixed at 24, so this just scales the glyph. */
  readonly size = input<number>(16);
  /** When provided, the SVG carries `role="img"` + `aria-label` for screen readers; otherwise it's `aria-hidden`. */
  readonly label = input<string | null>(null);

  // ─── Computed ────────────────────────────────────────────────────────────
  /** Fully-formed SVG string trusted via DomSanitizer — bypass is safe because content comes from a static, typed map. */
  protected readonly markup = computed<SafeHtml>(() => {
    // Lookup is keyed on the typed name; `?? ''` is a defensive fallback (the type system should prevent misses).
    const inner = ICONS[this.name()] ?? '';
    // Snapshot inputs into locals to keep the template-string interpolations readable.
    const size = this.size();
    const label = this.label();
    // Decorative vs labelled fork — provide either `role=img + aria-label` or `aria-hidden`, never both.
    const labelAttrs = label
      ? `role="img" aria-label="${escapeAttr(label)}"`
      : `aria-hidden="true"`;
    // Bypass is safe: `inner` comes from the static `ICONS` map and `label` is attribute-escaped — no user HTML enters the string.
    return this.sanitizer.bypassSecurityTrustHtml(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${labelAttrs}>${inner}</svg>`,
    );
  });
}

/** Minimal HTML-attribute escaping for the `aria-label` value before it gets serialised into the SVG string. */
function escapeAttr(value: string): string {
  // Order matters: replace `&` first so we don't double-escape entities introduced by the later substitutions.
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
