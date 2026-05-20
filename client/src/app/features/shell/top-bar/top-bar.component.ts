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
  protected readonly store = inject(TasksStore);

  protected readonly tasksLabel = computed(() => {
    const u = this.store.currentUserId();
    const t = this.store.typeFilter();
    if (u === null && t === null) return 'Tasks';
    return 'Visible tasks';
  });
  protected readonly tasksTitle = computed(() => {
    const parts: string[] = [];
    const u = this.store.currentUser();
    if (u) parts.push(`Assignee: ${u.fullName}`);
    const typeId = this.store.typeFilter();
    if (typeId !== null) {
      const type = this.store.taskTypeById().get(typeId);
      if (type) parts.push(`Type: ${type.name}`);
    }
    return parts.length === 0 ? 'All tasks across the workspace' : parts.join(' · ');
  });
}
