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

import { ALL_VALUE } from '../../models/filters.model';
import { User } from '../../models/user.model';
import { AvatarComponent } from '../avatar/avatar.component';
import { IconComponent } from '../icon/icon.component';
import { PickerOverlayBase } from '../picker/picker-overlay.base';

// Sentinel value (= ALL_VALUE = -1) representing "no filter" / "All Users". Used so the picker's
// model is always a number; the store converts -1 → null at its boundary.
/** Sentinel "All Users" id — re-exported so feature components can import a self-documenting name. */
export const ALL_USERS_VALUE = ALL_VALUE;

/** When the user list exceeds this count, the panel renders a search input on open. */
const SHOW_SEARCH_THRESHOLD = 6;

// Popover body-portaled to escape ancestor overflow:hidden. Shared lifecycle lives in PickerOverlayBase.
@Component({
  selector: 'tp-user-picker',
  standalone: true,
  imports: [AvatarComponent, IconComponent],
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
      @if (isAllSelected()) {
        <span class="all-mark" aria-hidden="true">
          <tp-icon name="users" [size]="14" />
        </span>
        @if (!compact()) {
          <span class="trigger-name">All users</span>
        }
      } @else if (selected()) {
        <tp-avatar [name]="selected()!.fullName" size="sm" />
        @if (!compact()) {
          <span class="trigger-name">{{ selected()!.fullName }}</span>
        }
      } @else {
        <span class="placeholder">{{ placeholder() }}</span>
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
        @if (users().length > SHOW_SEARCH_THRESHOLD) {
          <div class="search">
            <tp-icon name="search" [size]="14" />
            <input
              type="text"
              [value]="query()"
              (input)="onQuery($any($event.target).value)"
              [placeholder]="searchPlaceholder()"
              autocomplete="off"
              spellcheck="false"
            />
          </div>
        }
        <ul class="list" role="listbox" [attr.aria-label]="panelLabel()">
          @if (allOption()) {
            <li
              role="option"
              [attr.aria-selected]="isAllSelected()"
            >
              <button
                type="button"
                class="opt opt-all"
                [class.is-active]="activeId() === ALL_USERS_VALUE"
                [class.is-selected]="isAllSelected()"
                (mouseenter)="activeId.set(ALL_USERS_VALUE)"
                (click)="select(ALL_USERS_VALUE)"
              >
                <span class="all-mark" aria-hidden="true">
                  <tp-icon name="users" [size]="14" />
                </span>
                <span class="opt-name">All users</span>
                <span class="opt-count">{{ users().length }}</span>
                @if (isAllSelected()) {
                  <tp-icon name="check" [size]="14" />
                }
              </button>
            </li>
            <li class="divider" aria-hidden="true"></li>
          }
          @for (user of filtered(); track user.id; let i = $index) {
            <li role="option" [attr.aria-selected]="user.id === value()">
              <button
                type="button"
                class="opt"
                [class.is-active]="user.id === activeId()"
                [class.is-selected]="user.id === value()"
                (mouseenter)="activeId.set(user.id)"
                (click)="select(user.id)"
              >
                <tp-avatar [name]="user.fullName" size="sm" />
                <span class="opt-name">{{ user.fullName }}</span>
                @if (user.id === value()) {
                  <tp-icon name="check" [size]="14" />
                }
              </button>
            </li>
          }
          @if (filtered().length === 0) {
            <li class="empty">No matches</li>
          }
        </ul>
      </div>
    </ng-template>
  `,
  styleUrl: './user-picker.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
/** Popover user picker — drives both the assignee selector and the toolbar's current-user filter.
 *  Inherits portal mount, positioning, outside-click, and keyboard navigation from `PickerOverlayBase`. */
export class UserPickerComponent extends PickerOverlayBase<number> {
  // ─── Inputs / Outputs ────────────────────────────────────────────────────
  /** Full user list — filtered locally by the search input when above the search threshold. */
  readonly users = input.required<readonly User[]>();
  /** Currently selected user id; `null` means nothing picked (placeholder shown). */
  readonly value = input<number | null>(null);
  /** Trigger label shown when nothing is selected. */
  readonly placeholder = input<string>('Pick a user');
  /** Placeholder text inside the search box that appears for large user lists. */
  readonly searchPlaceholder = input<string>('Search users');
  /** Accessible name applied to both the panel and the inner listbox. */
  readonly panelLabel = input<string>('Choose user');
  /** Icon-only trigger style (toolbar mode); when false, the trigger also shows the user's name. */
  readonly compact = input<boolean>(false);
  /** Refuses to open while true — used during loading or when the form is read-only. */
  readonly disabled = input<boolean>(false);
  /** When true, prepends an "All users" row backed by `ALL_USERS_VALUE` (used by the filter, not the assignee). */
  readonly allOption = input<boolean>(false);

  /** Emits the chosen user id (or `ALL_USERS_VALUE` for the "all" row) — parent handles routing into the store. */
  readonly valueChange = output<number>();

  // ─── View Queries ────────────────────────────────────────────────────────
  /** Template handed to the base class; rendered into a body portal on open. */
  @ViewChild('panelTmpl', { static: true })
  protected panelTmpl!: TemplateRef<unknown>;

  // ─── Writable Signals ────────────────────────────────────────────────────
  /** Live search text — drives `filtered`; reset to '' on every open. */
  protected readonly query = signal('');
  /** Keyboard-cursor position; independent from `value` so arrow keys can hover without committing. */
  protected readonly activeId = signal<number | null>(null);

  // ─── Template constants ──────────────────────────────────────────────────
  /** Re-exposed to the template so the `@if` / class bindings can compare against the sentinel. */
  protected readonly ALL_USERS_VALUE = ALL_USERS_VALUE;
  /** Re-exposed to the template so the `@if (users().length > SHOW_SEARCH_THRESHOLD)` check works. */
  protected readonly SHOW_SEARCH_THRESHOLD = SHOW_SEARCH_THRESHOLD;

  // ─── Computed ────────────────────────────────────────────────────────────
  /** True iff the "All Users" row is the current selection — drives the icon/label fork on the trigger. */
  protected readonly isAllSelected = computed(
    () => this.allOption() && this.value() === ALL_USERS_VALUE,
  );

  /** Resolves the selected user object; null for "all" or unset, so the template can fall back to placeholders. */
  protected readonly selected = computed(() => {
    const id = this.value();
    if (id === null || id === ALL_USERS_VALUE) return null;
    return this.users().find((u) => u.id === id) ?? null;
  });

  /** Case-insensitive name match over `users`; passes through unchanged when the query is empty. */
  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return this.users();
    return this.users().filter((u) => u.fullName.toLowerCase().includes(q));
  });

  // ─── Public API / UI Actions ─────────────────────────────────────────────
  /** Search-input handler — pushes the new query and re-anchors the keyboard cursor to the first match. */
  protected onQuery(value: string): void {
    this.query.set(value);
    this.activeId.set(this.filtered()[0]?.id ?? null);
  }

  // ─── Subclass contract ───────────────────────────────────────────────────
  protected isDisabled(): boolean {
    return this.disabled();
  }

  /** Resets search and lands the cursor on the current value (or the "all" row / first user as fallback). */
  protected onBeforeOpen(): void {
    this.query.set('');
    const v = this.value();
    this.activeId.set(
      v !== null && v !== ALL_USERS_VALUE
        ? v
        : this.allOption()
          ? ALL_USERS_VALUE
          : this.users()[0]?.id ?? null,
    );
  }

  protected getActiveId(): number | null {
    return this.activeId();
  }

  protected setActiveId(id: number | null): void {
    this.activeId.set(id);
  }

  /** Navigable set = (optional "all" row) + currently-filtered users — must match render order for ArrowUp/Down to feel right. */
  protected getNavigableIds(): readonly number[] {
    const ids: number[] = [];
    if (this.allOption()) ids.push(ALL_USERS_VALUE);
    for (const u of this.filtered()) ids.push(u.id);
    return ids;
  }

  protected emitChange(id: number): void {
    this.valueChange.emit(id);
  }
}
