import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';

const TONES = [
  ['#2358c9', '#dbe7ff'],
  ['#0c7a6f', '#d6f1ec'],
  ['#7b3fbf', '#ece1fa'],
  ['#a13a8b', '#f6dfee'],
  ['#9a5a08', '#fbe9c8'],
  ['#1f6f3a', '#dcefdd'],
] as const;

const SIZE_PX: Record<AvatarSize, number> = { xs: 20, sm: 24, md: 32, lg: 44 };
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
export class AvatarComponent {
  readonly name = input.required<string>();
  readonly size = input<AvatarSize>('md');
  readonly seed = input<string | null>(null);
  readonly title = input<string | null>(null);
  readonly hideLabel = input<boolean>(false);

  protected readonly initials = computed(() => initialsFrom(this.name()));
  protected readonly px = computed(() => SIZE_PX[this.size()]);
  protected readonly fontPx = computed(() => FONT_PX[this.size()]);
  protected readonly palette = computed(() => TONES[hashString(this.seed() ?? this.name()) % TONES.length]);
}

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
