import { httpResource } from '@angular/common/http';
import { Component, computed, inject, input, numberAttribute } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { CartService } from '../core/cart.service';
import { Category, Page, Product } from '../core/models';
import { MoneyPipe } from '../shared/money.pipe';
import { ProductImage } from '../shared/product-image';

const PAGE_SIZE = 12;

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'name', label: 'Name' },
];

/** Search, category, sort and page all live in the URL, so results can be shared and survive a refresh. */
@Component({
  selector: 'app-catalog',
  imports: [RouterLink, MoneyPipe, ProductImage],
  template: `
    <section class="mb-6 rounded-box bg-base-100 p-6 shadow-sm">
      <h1 class="text-2xl font-bold sm:text-3xl">Everyday things, done well.</h1>
      <p class="mt-1 text-base-content/70">Tech, home, fashion, and more, all in one cart.</p>
      <div class="mt-4 flex flex-col gap-2 sm:flex-row">
        <label class="input w-full sm:max-w-md">
          <span class="sr-only">Search products</span>
          <input
            type="search"
            placeholder="Search products"
            [value]="q()"
            (input)="onSearch($any($event.target).value)"
          />
        </label>
        <select
          class="select w-full sm:w-56"
          aria-label="Sort by"
          [value]="sort()"
          (change)="navigate({ sort: $any($event.target).value, page: null })"
        >
          @for (option of sortOptions; track option.value) {
            <option [value]="option.value">{{ option.label }}</option>
          }
        </select>
      </div>
    </section>

    <div class="mb-4 flex flex-wrap gap-2" role="group" aria-label="Categories">
      <button class="btn btn-sm" [class.btn-primary]="!category()" (click)="navigate({ category: null, page: null })">
        All
      </button>
      @for (c of categories.value() ?? []; track c.slug) {
        <button
          class="btn btn-sm"
          [class.btn-primary]="category() === c.slug"
          (click)="navigate({ category: c.slug, page: null })"
        >
          {{ c.name }} <span class="opacity-60">{{ c.productCount }}</span>
        </button>
      }
    </div>

    @if (products.error()) {
      <div role="alert" class="alert alert-error">
        Couldn't load products.
        <button class="btn btn-sm" (click)="products.reload()">Try again</button>
      </div>
    } @else if (products.isLoading() && !products.hasValue()) {
      <div class="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        @for (i of skeletons; track i) {
          <div class="skeleton h-72"></div>
        }
      </div>
    } @else if (products.value(); as result) {
      <p class="mb-3 text-sm text-base-content/60" aria-live="polite">
        {{ result.total }} {{ result.total === 1 ? 'product' : 'products' }}
        @if (q()) {
          for "{{ q() }}"
        }
      </p>

      @if (result.items.length === 0) {
        <div class="rounded-box bg-base-100 p-10 text-center">
          <p class="font-medium">No products match your search.</p>
          <button class="btn btn-ghost btn-sm mt-2" (click)="navigate({ q: null, category: null, page: null })">
            Clear filters
          </button>
        </div>
      } @else {
        <div class="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4" [class.opacity-60]="products.isLoading()">
          @for (p of result.items; track p.id) {
            <article class="card bg-base-100 shadow-sm transition hover:shadow-md">
              <a [routerLink]="['/products', p.slug]" class="block">
                <app-product-image
                  class="aspect-square rounded-t-box"
                  [name]="p.name"
                  [category]="p.category.slug"
                  [src]="p.imageUrl"
                />
              </a>
              <div class="card-body gap-1 p-4">
                <p class="text-xs text-base-content/60">{{ p.category.name }}</p>
                <a [routerLink]="['/products', p.slug]" class="line-clamp-2 font-medium hover:underline">{{ p.name }}</a>
                <div class="mt-auto flex items-center justify-between pt-2">
                  <span class="font-semibold">{{ p.priceCents | money }}</span>
                  @if (p.stock === 0) {
                    <span class="badge badge-ghost badge-sm">Sold out</span>
                  } @else {
                    <button
                      class="btn btn-primary btn-xs"
                      [disabled]="cart.quantityOf(p.id) >= cart.maxFor(p.stock)"
                      (click)="cart.add(p)"
                      [attr.aria-label]="'Add ' + p.name + ' to cart'"
                    >
                      Add
                    </button>
                  }
                </div>
                @if (p.stock > 0 && p.stock <= 5) {
                  <p class="text-xs text-warning">Only {{ p.stock }} left</p>
                }
              </div>
            </article>
          }
        </div>

        @if (pageCount() > 1) {
          <div class="join mt-6 flex justify-center">
            <button class="join-item btn btn-sm" [disabled]="page() <= 1" (click)="navigate({ page: page() - 1 })">
              Previous
            </button>
            <span class="join-item btn btn-sm pointer-events-none">Page {{ page() }} of {{ pageCount() }}</span>
            <button
              class="join-item btn btn-sm"
              [disabled]="page() >= pageCount()"
              (click)="navigate({ page: page() + 1 })"
            >
              Next
            </button>
          </div>
        }
      }
    }
  `,
})
export class CatalogPage {
  private readonly router = inject(Router);
  protected readonly cart = inject(CartService);

  // Bound from query params by withComponentInputBinding().
  readonly q = input('', { transform: (v: string | undefined) => v ?? '' });
  readonly category = input('', { transform: (v: string | undefined) => v ?? '' });
  readonly sort = input('newest', { transform: (v: string | undefined) => v ?? 'newest' });
  readonly page = input(1, { transform: (v: unknown) => Math.max(1, numberAttribute(v, 1)) });

  protected readonly sortOptions = SORT_OPTIONS;
  protected readonly skeletons = Array.from({ length: 8 }, (_, i) => i);

  protected readonly categories = httpResource<Category[]>(() => '/api/categories');
  protected readonly products = httpResource<Page<Product>>(() => ({
    url: '/api/products',
    params: {
      q: this.q(),
      category: this.category(),
      sort: this.sort(),
      page: this.page(),
      pageSize: PAGE_SIZE,
    },
  }));

  protected readonly pageCount = computed(() => {
    const result = this.products.value();
    return result ? Math.ceil(result.total / result.pageSize) : 0;
  });

  private searchTimer?: ReturnType<typeof setTimeout>;

  protected onSearch(value: string): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.navigate({ q: value.trim() || null, page: null }), 300);
  }

  protected navigate(params: Record<string, string | number | null>): void {
    this.router.navigate([], { queryParams: params, queryParamsHandling: 'merge', replaceUrl: 'q' in params });
  }
}
