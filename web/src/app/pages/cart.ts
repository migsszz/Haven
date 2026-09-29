import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../core/auth.service';
import { CartService } from '../core/cart.service';
import { MoneyPipe } from '../shared/money.pipe';
import { ProductImage } from '../shared/product-image';

@Component({
  selector: 'app-cart',
  imports: [RouterLink, MoneyPipe, ProductImage],
  template: `
    <h1 class="mb-4 text-2xl font-bold">Your cart</h1>

    @if (cart.isEmpty()) {
      <div class="rounded-box bg-base-100 p-10 text-center">
        <p class="font-medium">Your cart is empty.</p>
        <a routerLink="/" class="btn btn-primary btn-sm mt-3">Start shopping</a>
      </div>
    } @else {
      <div class="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <ul class="divide-y divide-base-300 rounded-box bg-base-100 shadow-sm">
          @for (line of cart.lines(); track line.productId) {
            <li class="flex gap-4 p-4">
              <a [routerLink]="['/products', line.slug]" class="shrink-0">
                <app-product-image
                  class="size-20 rounded-lg"
                  [name]="line.name"
                  [category]="line.categorySlug"
                  [src]="line.imageUrl"
                />
              </a>
              <div class="flex min-w-0 flex-1 flex-col gap-2">
                <div class="flex items-start justify-between gap-2">
                  <a [routerLink]="['/products', line.slug]" class="font-medium hover:underline">{{ line.name }}</a>
                  <span class="font-semibold">{{ line.priceCents * line.quantity | money }}</span>
                </div>
                <div class="flex items-center justify-between">
                  <div class="join" role="group" [attr.aria-label]="'Quantity of ' + line.name">
                    <button
                      class="join-item btn btn-sm"
                      (click)="cart.setQuantity(line.productId, line.quantity - 1)"
                      [attr.aria-label]="line.quantity === 1 ? 'Remove' : 'Decrease'"
                    >
                      &minus;
                    </button>
                    <span class="join-item btn btn-sm pointer-events-none w-10">{{ line.quantity }}</span>
                    <button
                      class="join-item btn btn-sm"
                      [disabled]="line.quantity >= cart.maxFor(line.stock)"
                      (click)="cart.setQuantity(line.productId, line.quantity + 1)"
                      aria-label="Increase"
                    >
                      +
                    </button>
                  </div>
                  <button class="btn btn-ghost btn-xs" (click)="cart.remove(line.productId)">Remove</button>
                </div>
              </div>
            </li>
          }
        </ul>

        <aside class="h-fit rounded-box bg-base-100 p-5 shadow-sm">
          <div class="flex justify-between">
            <span>Subtotal</span>
            <span class="font-semibold">{{ cart.subtotalCents() | money }}</span>
          </div>
          <p class="mt-1 text-sm text-base-content/60">Free shipping on every order.</p>
          <a routerLink="/checkout" class="btn btn-primary mt-4 w-full">
            {{ auth.isSignedIn() ? 'Checkout' : 'Sign in to check out' }}
          </a>
        </aside>
      </div>
    }
  `,
})
export class CartPage {
  protected readonly cart = inject(CartService);
  protected readonly auth = inject(AuthService);
}
