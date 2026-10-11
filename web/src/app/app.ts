import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AssistantService } from './core/assistant.service';
import { AuthService } from './core/auth.service';
import { CartService } from './core/cart.service';
import { Assistant } from './shared/assistant';
import { Icon } from './shared/icon';
import { SearchBox } from './shared/search-box';
import { Appearance } from './shared/appearance';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Assistant, Icon, SearchBox, Appearance],
  template: `
    <a
      href="#main"
      class="sr-only z-50 bg-primary px-4 py-2 text-primary-content focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
    >
      Skip to content
    </a>

    <div class="flex min-h-screen flex-col">
      <header class="site-header sticky top-0 z-30 border-b border-base-300 bg-base-100/90 backdrop-blur">
        <div class="mx-auto max-w-7xl px-4 sm:px-6">
          <div class="flex h-16 items-center gap-2 sm:gap-6">
            <!-- Menu (small screens) -->
            <div class="dropdown md:hidden">
              <button tabindex="0" class="btn btn-ghost btn-square -ml-2" aria-label="Menu"><app-icon name="menu" /></button>
              <div tabindex="0" class="dropdown-content z-40 mt-2 max-h-[calc(100dvh-5rem)] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-box border border-base-300 bg-base-100 p-2 shadow-lg">
                <ul class="menu w-full p-0">
                  <li><a routerLink="/" (click)="closeMenu()">Shop</a></li>
                  @if (auth.user()) {
                    <li><a routerLink="/orders" (click)="closeMenu()">Your orders</a></li>
                    @if (auth.isAdmin()) {
                      <li><a routerLink="/admin" (click)="closeMenu()">Admin</a></li>
                    }
                  } @else {
                    <li><a routerLink="/login" (click)="closeMenu()">Sign in</a></li>
                    <li><a routerLink="/register" (click)="closeMenu()">Create an account</a></li>
                  }
                </ul>
                <div class="mt-2 border-t border-base-300 px-2 pt-3">
                  @if (auth.user(); as user) {
                    <p class="text-sm font-medium">{{ user.name }}</p>
                    <p class="mb-3 text-xs break-all text-muted">{{ user.email }}</p>
                  }
                  <app-appearance />
                </div>
                @if (auth.user()) {
                  <ul class="menu mt-2 w-full border-t border-base-300 p-0 pt-2">
                    <li><button (click)="closeMenu(); auth.logout()">Sign out</button></li>
                  </ul>
                }
              </div>
            </div>

            <a routerLink="/" class="wordmark font-display text-2xl tracking-tight" aria-label="Haven, home">Haven</a>

            <!-- Navigation (larger screens) -->
            <nav class="hidden items-center gap-6 text-sm md:flex" aria-label="Main">
              <a
                routerLink="/"
                routerLinkActive="border-primary"
                [routerLinkActiveOptions]="{ exact: true }"
                class="border-b border-transparent py-1 hover:border-base-300"
              >
                Shop
              </a>
              @if (auth.user()) {
                <a routerLink="/orders" routerLinkActive="border-primary" class="border-b border-transparent py-1 hover:border-base-300">
                  Orders
                </a>
              }
              @if (auth.isAdmin()) {
                <a routerLink="/admin" routerLinkActive="border-primary" class="border-b border-transparent py-1 hover:border-base-300">
                  Admin
                </a>
              }
            </nav>

            <div class="hidden max-w-sm flex-1 md:ml-auto md:block"><app-search-box [compact]="true" /></div>

            <div class="ml-auto flex items-center gap-1 md:ml-0">
              <button
                class="btn btn-ghost btn-square md:hidden"
                [attr.aria-expanded]="searchOpen()"
                aria-label="Search"
                (click)="searchOpen.set(!searchOpen())"
              >
                <app-icon name="search" />
              </button>

              @if (assistant.enabled()) {
                <button class="btn btn-ghost btn-sm max-md:btn-square" (click)="assistant.toggle()" aria-label="Ask Haven">
                  <app-icon name="sparkle" />
                  <span class="hidden lg:inline">Ask Haven</span>
                </button>
              }

              <!-- Account (larger screens) -->
              <div class="hidden md:block">
                @if (auth.user(); as user) {
                  <div class="dropdown dropdown-end">
                    <button tabindex="0" class="btn btn-ghost btn-sm" aria-label="Account menu">
                      <span class="max-w-28 truncate">{{ user.name }}</span>
                    </button>
                    <div tabindex="0" class="dropdown-content z-40 mt-2 max-h-[calc(100dvh-5rem)] w-72 overflow-y-auto rounded-box border border-base-300 bg-base-100 p-3 shadow-lg">
                      <p class="text-sm font-medium">{{ user.name }}</p>
                      <p class="mb-3 text-xs break-all text-muted">{{ user.email }}</p>
                      <app-appearance />
                      <ul class="menu mt-3 w-full border-t border-base-300 p-0 pt-2">
                        <li><button (click)="closeMenu(); auth.logout()">Sign out</button></li>
                      </ul>
                    </div>
                  </div>
                } @else {
                  <div class="flex items-center">
                    <div class="dropdown dropdown-end">
                      <button tabindex="0" class="btn btn-ghost btn-sm btn-square" aria-label="Appearance"><app-icon name="palette" /></button>
                      <div tabindex="0" class="dropdown-content z-40 mt-2 max-h-[calc(100dvh-5rem)] w-72 overflow-y-auto rounded-box border border-base-300 bg-base-100 p-3 shadow-lg">
                        <app-appearance />
                      </div>
                    </div>
                    <a routerLink="/login" class="btn btn-ghost btn-sm">Sign in</a>
                  </div>
                }
              </div>

              <a routerLink="/cart" class="btn btn-ghost btn-sm relative" [attr.aria-label]="'Cart, ' + cart.count() + ' items'">
                <app-icon name="bag" />
                @if (cart.count() > 0) {
                  <span class="tabular grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-xs font-medium text-accent-content">
                    {{ cart.count() }}
                  </span>
                }
              </a>
            </div>
          </div>

          @if (searchOpen()) {
            <div class="pb-3 md:hidden"><app-search-box /></div>
          }
        </div>
      </header>

      <main id="main" tabindex="-1" class="mx-auto w-full max-w-7xl flex-1 px-4 py-8 outline-none sm:px-6 sm:py-12">
        <router-outlet />
      </main>

      <footer class="site-footer mt-16 border-t border-base-300">
        <div class="mx-auto grid max-w-7xl gap-8 px-4 py-12 text-sm sm:grid-cols-3 sm:px-6">
          <div>
            <p class="font-display text-2xl">Haven</p>
            <p class="mt-2 max-w-xs text-muted">Everyday things, done well. A small, considered shop.</p>
          </div>
          <nav aria-label="Footer" class="flex flex-col gap-2">
            <p class="eyebrow mb-1">Browse</p>
            <a routerLink="/" class="link-quiet">Shop</a>
            <a routerLink="/orders" class="link-quiet">Your orders</a>
            <a routerLink="/cart" class="link-quiet">Cart</a>
          </nav>
          <div>
            <p class="eyebrow mb-3">About this store</p>
            <p class="text-muted">Haven is a demo store. Payments are simulated and no real orders are shipped.</p>
          </div>
        </div>
      </footer>
    </div>
    <!-- The chat panel is only downloaded once the server says the assistant is on. -->
    @defer (when assistant.enabled()) {
      <app-assistant />
    }
  `,
})
export class App {
  protected readonly auth = inject(AuthService);
  protected readonly cart = inject(CartService);
  protected readonly assistant = inject(AssistantService);
  protected readonly searchOpen = signal(false);

  /** The menus are CSS dropdowns that stay open while focused, so drop focus after a choice. */
  protected closeMenu(): void {
    (document.activeElement as HTMLElement | null)?.blur();
  }
}
