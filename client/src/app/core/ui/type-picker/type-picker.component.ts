import {
  ChangeDetectionStrategy,
  Component,
  TemplateRef,
  ViewChild,
  computed,
  input,
  output,
  signal,
} from '@angular/core';

import { PickerOverlayBase } from '../picker/picker-overlay.base';
import { IconComponent, IconName } from '../icon/icon.component';

/** One row in the type-picker list — `value` is the task-type id (or `allValue` for the "All Types" pseudo-row). */
export interface TypePickerOption {
  readonly value: number;
  readonly label: string;
}

@Component({
  selector: 'tp-type-picker',
  standalone: true,
  imports: [IconComponent],
  template: `
    <button
      type="button"
      class="trigger"
      [class.compact]="compact()"
      (click)="toggle()"
      [attr.aria-haspopup]="'listbox'"
      [attr.aria-expanded]="open()"
      [disabled]="disabled()"
    >
      <span class="trigger-icon" aria-hidden="true">
        <tp-icon [name]="triggerIcon()" [size]="14" />
      </span>
      @if (!compact()) {
        <span class="trigger-name">{{ selectedLabel() }}</span>
      }
      <tp-icon name="chevron-down" [size]="14" />
    </button>

    <!-- Panel template — instantiated into a body-level portal on open. -->
    <ng-template #panelTmpl>
      <div
        class="panel"
        role="dialog"
        [attr.aria-label]="panelLabel()"
        [style.top.px]="panelTop()"
        [style.left.px]="panelLeft()"
        [style.minWidth.px]="panelMinWidth()"
      >
        <ul class="list" role="listbox" [attr.aria-label]="panelLabel()">
          @for (opt of options(); track opt.value; let i = $index) {
            <li role="option" [attr.aria-selected]="opt.value === value()">
              <button
                type="button"
                class="opt"
                [class.is-active]="opt.value === activeValue()"
                [class.is-selected]="opt.value === value()"
                (mouseenter)="activeValue.set(opt.value)"
                (click)="select(opt.value)"
              >
                <span class="opt-icon" aria-hidden="true">
                  <tp-icon [name]="opt.value === allValue() ? 'layers' : 'circle-dot'" [size]="14" />
                </span>
                <span class="opt-name">{{ opt.label }}</span>
                @if (opt.value === value()) {
                  <tp-icon name="check" [size]="14" />
                }
              </button>
            </li>
          }
        </ul>
      </div>
    </ng-template>
  `,
  styleUrl: './type-picker.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
/** Popover task-type filter (toolbar) — inherits portal/positioning/keyboard from `PickerOverlayBase`. */
export class TypePickerComponent extends PickerOverlayBase<number> {
  // ─── Inputs / Outputs ────────────────────────────────────────────────────
  /** Options to render in the panel — typically the type catalog plus an "All Types" pseudo-row. */
  readonly options = input.required<readonly TypePickerOption[]>();
  /** Currently selected option's value — drives the trigger label and the panel's checkmark. */
  readonly value = input.required<number>();
  /** Sentinel for "no filter" / all-types row (per `ALL_TYPES` constant in filters.model). */
  readonly allValue = input<number>(-1);
  /** Accessible name applied to both the panel and its inner listbox. */
  readonly panelLabel = input<string>('Filter by type');
  /** Icon used on the trigger and the "all" row when the all-value is selected. */
  readonly leadingIcon = input<IconName>('layers');
  /** Icon-only trigger style (toolbar mode); when false, the trigger also shows the label text. */
  readonly compact = input<boolean>(false);
  /** Hides the panel and refuses to open on click — used while a parent is loading. */
  readonly disabled = input<boolean>(false);

  /** Emits the picked option's value — parent forwards into the store as the active filter. */
  readonly valueChange = output<number>();

  // ─── View Queries ────────────────────────────────────────────────────────
  /** Template handed to the base class; rendered into a body portal on open. */
  @ViewChild('panelTmpl', { static: true })
  protected panelTmpl!: TemplateRef<unknown>;

  // ─── Writable Signals ────────────────────────────────────────────────────
  /** Keyboard-cursor position inside the open panel — independent from the committed `value`. */
  protected readonly activeValue = signal<number | null>(null);

  // ─── Computed ────────────────────────────────────────────────────────────
  /** Label of the currently-selected option — empty string when the value isn't in the options list. */
  protected readonly selectedLabel = computed(() => {
    // Snapshot the signal so the find predicate doesn't re-read it per iteration.
    const v = this.value();
    // `?? ''` guards the brief window after deletion where the stored id no longer exists in `options`.
    return this.options().find((o) => o.value === v)?.label ?? '';
  });

  /** Trigger icon — uses the generic leading icon when "all" is selected, otherwise a single-type bullet. */
  protected readonly triggerIcon = computed<IconName>(() =>
    // "All Types" gets the caller-provided generic glyph; specific types share the bullet icon by design.
    this.value() === this.allValue() ? this.leadingIcon() : 'circle-dot',
  );

  // ─── Subclass contract ───────────────────────────────────────────────────
  /** Narrower min-width than the base default — type lists are short labels. */
  protected override getMinWidth(): number {
    // Override the 240px default; type names are typically 8–12 chars so 200 is plenty.
    return 200;
  }

  protected isDisabled(): boolean {
    // Surface the input straight to the base class — no extra gating logic in this picker.
    return this.disabled();
  }

  /** Seeds the keyboard cursor on the currently-selected option so ArrowDown lands intuitively. */
  protected onBeforeOpen(): void {
    // On open, place the keyboard cursor on the committed value so the first ArrowDown moves to the next option.
    this.activeValue.set(this.value());
  }

  protected getActiveId(): number | null {
    // Base class polls this on every Arrow key — keep it a direct signal read.
    return this.activeValue();
  }

  protected setActiveId(id: number | null): void {
    // Base class calls this from Arrow handlers; routing through the signal keeps templates reactive.
    this.activeValue.set(id);
  }

  /** Every option is keyboard-reachable — no filtering applied. */
  protected getNavigableIds(): readonly number[] {
    // Type picker has no search box, so the navigable set equals the full options list.
    return this.options().map((o) => o.value);
  }

  protected emitChange(id: number): void {
    // Final commit — parent re-runs the list filter with this id.
    this.valueChange.emit(id);
  }
}
