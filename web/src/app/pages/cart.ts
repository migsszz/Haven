import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../core/auth.service';
import { CartService } from '../core/cart.service';
import { MoneyPipe } from '../shared/money.pipe';
import { ProductImage } from '../shared/product-image';
import { Quantity } from '../shared/quantity';
import { Steps } from '../shared/steps';

@Component({
  selector: 'app-cart',
  imports: [RouterLink, MoneyPipe, ProductImage, Quantity, Steps],
  template: `
    <app-steps [current]="1" />
    <h1 class="mt-8 text-4xl sm:text-5xl">Your cart</h1>

    @if (cart.isEmpty()) {
      <div class="py-20 text-center">
        <p class="font-display text-3xl">Your cart is empty.</p>
        <p class="mt-2 text-muted">Nothing here yet. Have a look around.</p>
        <a routerLink="/" class="btn btn-primary mt-6">Start shopping</a>
      </div>
    } @else {
      <div class="mt-8 grid gap-12 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <ul class="border-t border-base-300">
          @for (line of cart.lines(); track line.productId) {
            <li class="flex gap-4 border-b border-base-300 py-6 sm:gap-6">
              <a [routerLink]="['/products', line.slug]" class="w-24 shrink-0 sm:w-28">
                <app-product-image class="aspect-[4/5] rounded-sm" [name]="line.name" [category]="line.categorySlug" [src]="line.imageUrl" />
              </a>
              <div class="flex min-w-0 flex-1 flex-col">
                <div class="flex items-start justify-between gap-4">
                  <div class="min-w-0">
                    <a [routerLink]="['/products', line.slug]" class="link-quiet font-medium">{{ line.name }}</a>
                    <p class="tabular mt-1 text-sm text-muted">{{ line.priceCents | money }} each</p>
                  </div>
                  <span class="tabular">{{ line.priceCents * line.quantity | money }}</span>
                </div>
                <div class="mt-auto flex items-center justify-between pt-4">
                  <app-quantity
                    [value]="line.quantity"
                    [min]="0"
                    [max]="cart.maxFor(line.stock)"
                    [label]="'Quantity of ' + line.name"
                    [decreaseLabel]="line.quantity === 1 ? 'Remove ' + line.name : 'Decrease'"
                    (changed)="cart.setQuantity(line.productId, $event)"
                  />
                  <button class="link-quiet text-sm text-muted" (click)="cart.remove(line.productId)">Remove</button>
                </div>
                @if (line.quantity >= cart.maxFor(line.stock)) {
                  <p class="mt-2 text-xs text-accent">That's all we have{{ line.stock > cart.maxFor(line.stock) ? ' for one order' : '' }}.</p>
                }
              </div>
            </li>
          }
        </ul>

        <aside class="h-fit border-t border-base-300 pt-6 lg:sticky lg:top-24">
          <p class="eyebrow">Order summary</p>
          <dl class="mt-5 space-y-3 text-sm">
            <div class="flex justify-between"><dt>Subtotal</dt><dd class="tabular">{{ cart.subtotalCents() | money }}</dd></div>
            <div class="flex justify-between"><dt>Shipping</dt><dd>Free</dd></div>
          </dl>
          <div class="mt-5 flex items-baseline justify-between border-t border-base-300 pt-5">
            <span>Total</span>
            <span class="tabular font-display text-3xl">{{ cart.subtotalCents() | money }}</span>
          </div>
          <a routerLink="/checkout" class="btn btn-primary mt-6 w-full">
            {{ auth.isSignedIn() ? 'Checkout' : 'Sign in to check out' }}
          </a>
          <p class="mt-4 text-xs text-muted">Prices and stock are checked again when you place the order.</p>
        </aside>
      </div>
    }
  `,
})
export class CartPage {
  protected readonly cart = inject(CartService);
  protected readonly auth = inject(AuthService);
}
