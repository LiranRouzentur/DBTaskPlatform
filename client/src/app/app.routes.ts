import { Routes } from '@angular/router';

import { TaskListComponent } from './features/tasks/task-list/task-list.component';
import { CreateTaskComponent } from './features/tasks/create-task/create-task.component';
import { ChangeStatusComponent } from './features/tasks/change-status/change-status.component';

// Two child routes render as modals via an outlet in TaskListComponent; navigation uses
// `skipLocationChange: true` so the URL stays at /tasks. Wildcard sends unknown URLs to the list.
export const routes: Routes = [
  {
    path: 'tasks',
    component: TaskListComponent,
    title: 'Tasks',
    children: [
      { path: 'new', component: CreateTaskComponent, title: 'New Task' },
      { path: ':id/change-status', component: ChangeStatusComponent, title: 'Change Status' },
    ],
  },
  { path: '', redirectTo: 'tasks', pathMatch: 'full' },
  { path: '**', redirectTo: 'tasks' },
];
