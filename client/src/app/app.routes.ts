import { Routes } from '@angular/router';

import { TaskListComponent } from './features/tasks/task-list/task-list.component';
import { CreateTaskComponent } from './features/tasks/create-task/create-task.component';
import { ChangeStatusComponent } from './features/tasks/change-status/change-status.component';

/**
 * Two child routes render as modals via an outlet in TaskListComponent; navigation uses
 * `skipLocationChange: true` so the URL stays at /tasks (see decisions.md ADR-10).
 * Wildcard sends unknown URLs to the list rather than a 404 page.
 */
export const routes: Routes = [
  {
    path: 'tasks',
    component: TaskListComponent,
    title: 'Tasks',
    children: [
      /** Create-task modal — child route rendered into TaskListComponent's outlet. */
      { path: 'new', component: CreateTaskComponent, title: 'New Task' },
      /** Change-status modal — `:id` flows in as a typed input via withComponentInputBinding. */
      { path: ':id/change-status', component: ChangeStatusComponent, title: 'Change Status' },
    ],
  },
  /** Default landing route. */
  { path: '', redirectTo: 'tasks', pathMatch: 'full' },
  /** Catch-all — keep users in-app instead of showing a router error. */
  { path: '**', redirectTo: 'tasks' },
];
