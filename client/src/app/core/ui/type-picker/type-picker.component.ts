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
export class TypePickerComponent extends PickerOverlayBase<number> {
  // ─── Inputs / Outputs ────────────────────────────────────────────────────
  readonly options = input.required<readonly TypePickerOption[]>();
  readonly value = input.required<number>();
  readonly allValue = input<number>(-1);
  readonly panelLabel = input<string>('Filter by type');
  readonly leadingIcon = input<IconName>('layers');
  readonly compact = input<boolean>(false);
  readonly disabled = input<boolean>(false);

  readonly valueChange = output<number>();

  // ─── View Queries ────────────────────────────────────────────────────────
  @ViewChild('panelTmpl', { static: true })
  protected panelTmpl!: TemplateRef<unknown>;

  // ─── Writable Signals ────────────────────────────────────────────────────
  protected readonly activeValue = signal<number | null>(null);

  // ─── Computed ────────────────────────────────────────────────────────────
  protected readonly selectedLabel = computed(() => {
    const v = this.value();
    return this.options().find((o) => o.value === v)?.label ?? '';
  });

  protected readonly triggerIcon = computed<IconName>(() =>
    this.value() === this.allValue() ? this.leadingIcon() : 'circle-dot',
  );

  // ─── Subclass contract ───────────────────────────────────────────────────
  protected override getMinWidth(): number {
    return 200;
  }

  protected isDisabled(): boolean {
    return this.disabled();
  }

  protected onBeforeOpen(): void {
    this.activeValue.set(this.value());
  }

  protected getActiveId(): number | null {
    return this.activeValue();
  }

  protected setActiveId(id: number | null): void {
    this.activeValue.set(id);
  }

  protected getNavigableIds(): readonly number[] {
    return this.options().map((o) => o.value);
  }

  protected emitChange(id: number): void {
    this.valueChange.emit(id);
  }
}
