import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../../core/ui/icon/icon.component';
import { TasksStore } from '../../../state/tasks.store';

/** App chrome: brand mark + totals strip; Tasks count relabels to "Visible tasks" when filtered. */
@Component({
  selector: 'tp-top-bar',
  standalone: true,
  imports: [RouterLink, IconComponent],
  template: `
    <a class="skip-link" href="#main-content">Skip to main content</a>
    <header class="topbar" role="banner">
      <div class="topbar-inner">
        <a routerLink="/tasks" class="brand" aria-label="TaskPlatform — home">
          <span class="brand-mark" aria-hidden="true">
            <tp-icon name="layers" [size]="16" />
          </span>
          <span class="brand-name">TaskPlatform</span>
        </a>
        <div class="stats" aria-label="Workspace totals (unfiltered)">
          <span class="stat">
            <span class="stat-value">{{ store.users().length }}</span>
            <span class="stat-label">Users</span>
          </span>
          <span class="sep" aria-hidden="true">|</span>
          <span class="stat">
            <span class="stat-value">{{ store.taskTypes().length }}</span>
            <span class="stat-label">Task Types</span>
          </span>
          <span class="sep" aria-hidden="true">|</span>
          <span class="stat" [attr.title]="tasksTitle()">
            <span class="stat-value">{{ store.tasks().length }}</span>
            <span class="stat-label">{{ tasksLabel() }}</span>
          </span>
        </div>
      </div>
    </header>
  `,
  styleUrl: './top-bar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopBarComponent {
  /** Reads totals + active filters; the global single-instance store is shared with all other features. */
  protected readonly store = inject(TasksStore);

  /** Relabels the Tasks count to "Visible tasks" whenever any filter is active, signalling the number isn't a true total. */
  protected readonly tasksLabel = computed(() => {
    // Active user filter (null = All Users) — drives label switching.
    const u = this.store.currentUserId();
    // Active task-type filter (null = All Types) — drives label switching.
    const t = this.store.typeFilter();
    // Both filters off → the count reflects the entire workspace, so the plain "Tasks" label is accurate.
    if (u === null && t === null) return 'Tasks';
    // Otherwise the count is filtered — relabel so users don't read it as the workspace total.
    return 'Visible tasks';
  });
  /** Tooltip describing which filters are in play — joined with a middle-dot or a generic "all tasks" string. */
  protected readonly tasksTitle = computed(() => {
    // Accumulator for the human filter description; ordered: assignee first, then type.
    const parts: string[] = [];
    // Resolve the active user object (null when "All Users") so we can name them in the tooltip.
    const u = this.store.currentUser();
    if (u) parts.push(`Assignee: ${u.fullName}`);
    // Active task-type id (null = no type filter).
    const typeId = this.store.typeFilter();
    if (typeId !== null) {
      // Lookup uses the O(1) map maintained in the store; falls through silently if metadata is missing.
      const type = this.store.taskTypeById().get(typeId);
      if (type) parts.push(`Type: ${type.name}`);
    }
    // No active filters → render the generic message instead of an empty tooltip.
    return parts.length === 0 ? 'All tasks across the workspace' : parts.join(' · ');
  });
}
