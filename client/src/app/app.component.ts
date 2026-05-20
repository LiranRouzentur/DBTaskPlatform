import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TopBarComponent } from './features/shell/top-bar/top-bar.component';
import { ToastHostComponent } from './core/ui/toast-host/toast-host.component';

// App shell. Logic-free: composes top bar, router outlet, and the global toast host.
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, TopBarComponent, ToastHostComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {}
