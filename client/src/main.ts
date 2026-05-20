import { isDevMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, appConfig).catch((err) => {
  // Bootstrap failed before Angular's injector is available, so FrontendLogger cannot be used here.
  console.error('App failed to bootstrap:', err);
  renderBootstrapRecoveryPage(err);
});

function renderBootstrapRecoveryPage(error: unknown): void {
  const root = document.querySelector('app-root');
  if (!root) {
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'bootstrap-recovery';
  wrap.setAttribute('role', 'alert');

  const title = document.createElement('h1');
  title.className = 'bootstrap-recovery__title';
  title.textContent = 'TaskPlatform failed to start';

  const body = document.createElement('p');
  body.className = 'bootstrap-recovery__body';
  body.textContent =
    'Please reload the page. If the problem persists, contact support.';

  wrap.append(title, body);

  if (isDevMode()) {
    const message = error instanceof Error ? error.message : String(error);
    const details = document.createElement('pre');
    details.className = 'bootstrap-recovery__details';
    details.textContent = message;
    wrap.append(details);
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'bootstrap-recovery__reload';
  button.textContent = 'Reload';
  button.addEventListener('click', () => location.reload());
  wrap.append(button);

  root.replaceChildren(wrap);
}
