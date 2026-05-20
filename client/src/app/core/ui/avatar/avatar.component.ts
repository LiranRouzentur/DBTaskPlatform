import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Four discrete avatar sizes — drives both the chip dimension and the inner font size. */
export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';

/** Foreground/background colour pairs picked deterministically by hashing the user's name. */
const TONES = [
  ['#2358c9', '#dbe7ff'],
  ['#0c7a6f', '#d6f1ec'],
  ['#7b3fbf', '#ece1fa'],
  ['#a13a8b', '#f6dfee'],
  ['#9a5a08', '#fbe9c8'],
  ['#1f6f3a', '#dcefdd'],
] as const;

/** Pixel dimensions per size — kept in JS (not CSS) so the SVG/box stays in sync with font size. */
const SIZE_PX: Record<AvatarSize, number> = { xs: 20, sm: 24, md: 32, lg: 44 };
/** Initials font size per avatar size; smaller than chip to leave breathing room around the glyphs. */
const FONT_PX: Record<AvatarSize, number> = { xs: 9, sm: 10, md: 12, lg: 16 };

@Component({
  selector: 'tp-avatar',
  standalone: true,
  template: `
    <span
      class="avatar"
      [style.background]="palette()[1]"
      [style.color]="palette()[0]"
      [style.width.px]="px()"
      [style.height.px]="px()"
      [style.fontSize.px]="fontPx()"
      [attr.title]="title() || name()"
      [attr.aria-label]="hideLabel() ? name() : null"
    >{{ initials() }}</span>
  `,
  styleUrl: './avatar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
/** Circular initials chip used wherever a user appears (list rows, pickers, badges). Pure / no DI. */
export class AvatarComponent {
  /** Full display name — used both for initials extraction and as the default tooltip / aria-label. */
  readonly name = input.required<string>();
  /** Visual size; controls both chip dimensions and font size of the initials. */
  readonly size = input<AvatarSize>('md');
  /** Optional hashing seed — pass a stable id (e.g. user.id) so the same user keeps the same colour even if renamed. */
  readonly seed = input<string | null>(null);
  /** Optional explicit tooltip — falls back to `name` when null. */
  readonly title = input<string | null>(null);
  /** When true, name is exposed only via aria-label (used when a neighbouring label already shows the name). */
  readonly hideLabel = input<boolean>(false);

  /** One- or two-letter initials derived from `name`, capitalised. Falls back to "?" for empty input. */
  protected readonly initials = computed(() => initialsFrom(this.name()));
  /** Chip width/height in pixels — bound to both inline width and height styles. */
  protected readonly px = computed(() => SIZE_PX[this.size()]);
  /** Initials font size in pixels — kept smaller than `px` for visual padding. */
  protected readonly fontPx = computed(() => FONT_PX[this.size()]);
  /** Deterministic [fg, bg] pair — hashing `seed ?? name` keeps the same user visually consistent across renders. */
  protected readonly palette = computed(() => TONES[hashString(this.seed() ?? this.name()) % TONES.length]);
}

/** Extracts up to two uppercase initials: "Jane Doe" → "JD"; single-word → first two chars; empty → "?". */
function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Stable 32-bit-ish hash (djb-like multiplier-31) used to deterministically index into `TONES`. */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
