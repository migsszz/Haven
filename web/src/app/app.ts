import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from './core/auth.service';
import { CartService } from './core/cart.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="flex min-h-screen flex-col">
      <header class="sticky top-0 z-30 border-b border-base-300 bg-base-100/90 backdrop-blur">
        <nav class="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2">
          <a routerLink="/" class="mr-auto flex items-center gap-2 text-lg font-bold tracking-tight">
            <span class="grid size-8 place-items-center rounded-lg bg-primary text-primary-content">H</span>
            Haven
          </a>

          @if (auth.isAdmin()) {
            <a routerLink="/admin" routerLinkActive="btn-active" class="btn btn-ghost btn-sm">Admin</a>
          }
          @if (auth.user(); as user) {
            <a routerLink="/orders" routerLinkActive="btn-active" class="btn btn-ghost btn-sm">Orders</a>
            <div class="dropdown dropdown-end">
              <button tabindex="0" class="btn btn-ghost btn-sm" aria-label="Account menu">
                <span class="max-w-28 truncate">{{ user.name }}</span>
              </button>
              <ul tabindex="0" class="dropdown-content menu z-40 mt-2 w-52 rounded-box bg-base-100 p-2 shadow">
                <li class="menu-title truncate">{{ user.email }}</li>
                <li><button (click)="auth.logout()">Sign out</button></li>
              </ul>
            </div>
          } @else {
            <a routerLink="/login" class="btn btn-ghost btn-sm">Sign in</a>
          }

          <a routerLink="/cart" class="btn btn-primary btn-sm" [attr.aria-label]="'Cart, ' + cart.count() + ' items'">
            Cart
            @if (cart.count() > 0) {
              <span class="badge badge-sm border-none bg-primary-content text-primary">{{ cart.count() }}</span>
            }
          </a>
        </nav>
      </header>

      <main class="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <router-outlet />
      </main>

      <footer class="border-t border-base-300 py-6 text-center text-sm text-base-content/60">
        Haven is a demo store. Payments are simulated and no real orders are shipped.
      </footer>
    </div>
  `,
})
export class App {
  protected readonly auth = inject(AuthService);
  protected readonly cart = inject(CartService);
}
