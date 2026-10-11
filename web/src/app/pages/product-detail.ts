import { httpResource } from '@angular/common/http';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AssistantService } from '../core/assistant.service';
import { CartService } from '../core/cart.service';
import { Product } from '../core/models';
import { Icon } from '../shared/icon';
import { MoneyPipe } from '../shared/money.pipe';
import { ProductImage } from '../shared/product-image';
import { Quantity } from '../shared/quantity';

@Component({
  selector: 'app-product-detail',
  imports: [RouterLink, MoneyPipe, ProductImage, Quantity, Icon],
  template: `
    @if (product.error()) {
      <div class="py-20 text-center">
        <p class="font-display text-3xl">This product isn't available.</p>
        <a routerLink="/" class="btn btn-primary mt-6">Keep shopping</a>
      </div>
    } @else if (product.value(); as p) {
      <nav aria-label="Breadcrumb" class="mb-8 flex flex-wrap items-center gap-x-2 text-sm text-muted">
        <a routerLink="/" class="link-quiet">Shop</a>
        <span aria-hidden="true">/</span>
        <a routerLink="/" [queryParams]="{ category: p.category.slug }" class="link-quiet">{{ p.category.name }}</a>
        <span aria-hidden="true">/</span>
        <span class="text-base-content" aria-current="page">{{ p.name }}</span>
      </nav>

      <div class="grid gap-10 pb-24 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-16 md:pb-0">
        <div class="md:sticky md:top-24 md:self-start">
          <app-product-image
            class="aspect-[4/5] rounded-sm"
            [class.opacity-60]="p.stock === 0"
            [name]="p.name"
            [category]="p.category.slug"
            [src]="p.imageUrl"
            [large]="true"
          />
        </div>

        <div class="flex flex-col">
          <p class="eyebrow">{{ p.category.name }}</p>
          <h1 class="mt-3 text-4xl leading-[1.08] sm:text-5xl">{{ p.name }}</h1>
          <p class="tabular mt-5 text-2xl">{{ p.priceCents | money }}</p>
          <p class="mt-6 max-w-prose leading-relaxed text-base-content/85">{{ p.description }}</p>

          <p class="mt-6 flex items-center gap-2 text-sm">
            <span
              class="size-2 rounded-full"
              [class.bg-success]="p.stock > 5"
              [class.bg-accent]="p.stock > 0 && p.stock <= 5"
              [class.bg-base-300]="p.stock === 0"
              aria-hidden="true"
            ></span>
            @if (p.stock === 0) {
              Sold out. Check back soon.
            } @else if (p.stock <= 5) {
              <span class="text-accent">Only {{ p.stock }} left</span>
            } @else {
              In stock
            }
          </p>

          @if (p.stock > 0) {
            <div class="mt-6 flex items-center gap-3">
              <app-quantity
                [value]="quantity()"
                [min]="1"
                [max]="remaining()"
                (changed)="quantity.set($event)"
              />
              <button class="btn btn-primary hidden flex-1 md:inline-flex" [disabled]="remaining() === 0" (click)="addToCart(p)">
                {{ remaining() === 0 ? 'Max in cart' : 'Add to cart' }}
              </button>
            </div>
            @if (added()) {
              <p role="status" class="mt-4 flex items-center gap-2 text-sm text-success">
                <app-icon name="check" /> Added to your cart.
                <a routerLink="/cart" class="ml-1 underline underline-offset-4">View cart</a>
              </p>
            }
          }

          @if (assistant.enabled()) {
            <button
              class="link-quiet mt-6 inline-flex items-center gap-2 self-start text-sm"
              (click)="assistant.ask('Tell me about the ' + p.name + '. Is it a good choice, and is there anything similar?')"
            >
              <app-icon name="sparkle" /> Ask Haven about this
            </button>
          }

          <div class="mt-10 border-b border-base-300 text-sm">
            <details class="group border-t border-base-300 py-4">
              <summary class="flex cursor-pointer list-none items-center justify-between font-medium">
                Shipping
                <span class="transition group-open:rotate-45"><app-icon name="plus" /></span>
              </summary>
              <p class="mt-3 max-w-prose text-muted">Free shipping on every order. You can cancel an order any time before it ships.</p>
            </details>
            <details class="group border-t border-base-300 py-4">
              <summary class="flex cursor-pointer list-none items-center justify-between font-medium">
                Payment
                <span class="transition group-open:rotate-45"><app-icon name="plus" /></span>
              </summary>
              <p class="mt-3 max-w-prose text-muted">
                Haven is a demo store, so payment is simulated. No card details are collected and nothing is really shipped.
              </p>
            </details>
          </div>
        </div>
      </div>

      <!-- On a phone the main button lives in a bar at the bottom of the screen. -->
      @if (p.stock > 0) {
        <div class="fixed inset-x-0 bottom-0 z-20 flex items-center gap-4 border-t border-base-300 bg-base-100/95 px-4 py-3 backdrop-blur md:hidden">
          <span class="tabular text-lg">{{ p.priceCents * quantity() | money }}</span>
          <button class="btn btn-primary flex-1" [disabled]="remaining() === 0" (click)="addToCart(p)">
            {{ remaining() === 0 ? 'Max in cart' : 'Add to cart' }}
          </button>
        </div>
      }
    } @else {
      <div class="grid gap-10 md:grid-cols-[1.1fr_1fr] md:gap-16">
        <div class="skeleton aspect-[4/5] rounded-sm"></div>
        <div class="space-y-4">
          <div class="skeleton h-3 w-24"></div>
          <div class="skeleton h-12 w-3/4"></div>
          <div class="skeleton h-6 w-20"></div>
        </div>
      </div>
    }
  `,
})
export class ProductDetailPage {
  protected readonly cart = inject(CartService);
  protected readonly assistant = inject(AssistantService);

  readonly slug = input.required<string>();

  protected readonly product = httpResource<Product>(() => `/api/products/${encodeURIComponent(this.slug())}`);
  protected readonly quantity = signal(1);
  protected readonly added = signal(false);

  constructor() {
    // The same page instance is reused when going from one product to another; start fresh each time.
    effect(() => {
      this.slug();
      untracked(() => {
        this.quantity.set(1);
        this.added.set(false);
      });
    });
  }

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
