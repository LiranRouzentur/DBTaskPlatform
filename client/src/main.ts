import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

window.addEventListener('unhandledrejection', (event) => {
  
  console.error('[unhandled-rejection]', event.reason);
});

bootstrapApplication(AppComponent, appConfig).catch((err) => {
  
  console.error('App failed to bootstrap:', err);
  renderBootstrapRecoveryPage(err);
});

function renderBootstrapRecoveryPage(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const root = document.querySelector('app-root') ?? document.body;
  
  const wrap = document.createElement('div');
  wrap.setAttribute('role', 'alert');
  wrap.style.cssText =
    'padding:32px;font:14px/1.5 system-ui,sans-serif;color:#1a1a1a;max-width:560px;margin:48px auto';
  const title = document.createElement('h1');
  title.textContent = 'TaskPlatform failed to start';
  title.style.cssText = 'font-size:20px;font-weight:600;margin:0 0 12px';
  const body = document.createElement('p');
  body.textContent =
    'Please reload the page. If the problem persists, contact support and quote the message below.';
  body.style.cssText = 'margin:0 0 16px';
  const details = document.createElement('pre');
  details.textContent = message;
  details.style.cssText =
    'background:#f5f5f5;border:1px solid #e0e0e0;border-radius:6px;padding:12px;font:12px/1.4 ui-monospace,monospace;white-space:pre-wrap;overflow:auto;max-height:200px;margin:0 0 16px';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Reload';
  button.style.cssText =
    'background:#2358c9;color:#fff;border:0;border-radius:6px;padding:8px 16px;font:14px system-ui;cursor:pointer';
  button.addEventListener('click', () => location.reload());
  wrap.append(title, body, details, button);
  root.replaceChildren(wrap);
}
