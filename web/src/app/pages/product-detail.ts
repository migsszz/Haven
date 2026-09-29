import { httpResource } from '@angular/common/http';
import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CartService } from '../core/cart.service';
import { Product } from '../core/models';
import { MoneyPipe } from '../shared/money.pipe';
import { ProductImage } from '../shared/product-image';

@Component({
  selector: 'app-product-detail',
  imports: [RouterLink, MoneyPipe, ProductImage],
  template: `
    <a routerLink="/" class="btn btn-ghost btn-sm mb-4">&larr; All products</a>

    @if (product.error()) {
      <div class="rounded-box bg-base-100 p-10 text-center">
        <p class="font-medium">This product isn't available.</p>
        <a routerLink="/" class="btn btn-primary btn-sm mt-3">Keep shopping</a>
      </div>
    } @else if (product.value(); as p) {
      <div class="grid gap-8 rounded-box bg-base-100 p-4 shadow-sm md:grid-cols-2 md:p-8">
        <app-product-image
          class="aspect-square rounded-box"
          [name]="p.name"
          [category]="p.category.slug"
          [src]="p.imageUrl"
          [large]="true"
        />
        <div class="flex flex-col gap-4">
          <div>
            <a [routerLink]="['/']" [queryParams]="{ category: p.category.slug }" class="link link-hover text-sm">
              {{ p.category.name }}
            </a>
            <h1 class="mt-1 text-2xl font-bold sm:text-3xl">{{ p.name }}</h1>
          </div>
          <p class="text-2xl font-semibold">{{ p.priceCents | money }}</p>
          <p class="text-base-content/80">{{ p.description }}</p>

          @if (p.stock === 0) {
            <div class="alert">Sold out. Check back soon.</div>
          } @else {
            <p class="text-sm" [class.text-warning]="p.stock <= 5">
              {{ p.stock <= 5 ? 'Only ' + p.stock + ' left in stock' : 'In stock' }}
            </p>
            <div class="flex flex-wrap items-center gap-3">
              <div class="join" role="group" aria-label="Quantity">
                <button class="join-item btn" [disabled]="quantity() <= 1" (click)="quantity.set(quantity() - 1)">
                  &minus;
                </button>
                <span class="join-item btn pointer-events-none w-12" aria-live="polite">{{ quantity() }}</span>
                <button class="join-item btn" [disabled]="quantity() >= remaining()" (click)="quantity.set(quantity() + 1)">
                  +
                </button>
              </div>
              <button class="btn btn-primary" [disabled]="remaining() === 0" (click)="addToCart(p)">
                {{ remaining() === 0 ? 'Max in cart' : 'Add to cart' }}
              </button>
            </div>
            @if (added()) {
              <div role="status" class="alert alert-success">
                Added to your cart.
                <a routerLink="/cart" class="btn btn-sm">View cart</a>
              </div>
            }
          }
        </div>
      </div>
    } @else {
      <div class="skeleton h-96"></div>
    }
  `,
})
export class ProductDetailPage {
  protected readonly cart = inject(CartService);

  readonly slug = input.required<string>();

  protected readonly product = httpResource<Product>(() => `/api/products/${encodeURIComponent(this.slug())}`);
  protected readonly quantity = signal(1);
  protected readonly added = signal(false);

  /** How many more the shopper can add, given stock, the per-line cap, and what's already in the cart. */
  protected readonly remaining = computed(() => {
    const p = this.product.value();
    return p ? Math.max(0, this.cart.maxFor(p.stock) - this.cart.quantityOf(p.id)) : 0;
  });

  protected addToCart(p: Product): void {
    this.cart.add(p, Math.min(this.quantity(), this.remaining()));
    this.quantity.set(1);
    this.added.set(true);
  }
}
