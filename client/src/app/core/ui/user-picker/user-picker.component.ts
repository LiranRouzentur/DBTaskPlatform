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
export const ALL_USERS_VALUE = ALL_VALUE;

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
export class UserPickerComponent extends PickerOverlayBase<number> {
  // ─── Inputs / Outputs ────────────────────────────────────────────────────
  readonly users = input.required<readonly User[]>();
  readonly value = input<number | null>(null);
  readonly placeholder = input<string>('Pick a user');
  readonly searchPlaceholder = input<string>('Search users');
  readonly panelLabel = input<string>('Choose user');
  readonly compact = input<boolean>(false);
  readonly disabled = input<boolean>(false);
  readonly allOption = input<boolean>(false);

  readonly valueChange = output<number>();

  // ─── View Queries ────────────────────────────────────────────────────────
  @ViewChild('panelTmpl', { static: true })
  protected panelTmpl!: TemplateRef<unknown>;

  // ─── Writable Signals ────────────────────────────────────────────────────
  protected readonly query = signal('');
  protected readonly activeId = signal<number | null>(null);

  // ─── Template constants ──────────────────────────────────────────────────
  protected readonly ALL_USERS_VALUE = ALL_USERS_VALUE;
  protected readonly SHOW_SEARCH_THRESHOLD = SHOW_SEARCH_THRESHOLD;

  // ─── Computed ────────────────────────────────────────────────────────────
  protected readonly isAllSelected = computed(
    () => this.allOption() && this.value() === ALL_USERS_VALUE,
  );

  protected readonly selected = computed(() => {
    const id = this.value();
    if (id === null || id === ALL_USERS_VALUE) return null;
    return this.users().find((u) => u.id === id) ?? null;
  });

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return this.users();
    return this.users().filter((u) => u.fullName.toLowerCase().includes(q));
  });

  // ─── Public API / UI Actions ─────────────────────────────────────────────
  protected onQuery(value: string): void {
    this.query.set(value);
    this.activeId.set(this.filtered()[0]?.id ?? null);
  }

  // ─── Subclass contract ───────────────────────────────────────────────────
  protected isDisabled(): boolean {
    return this.disabled();
  }

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
