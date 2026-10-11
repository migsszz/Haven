import { httpResource } from '@angular/common/http';
import { Component, computed, inject, input, numberAttribute } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { CartService } from '../core/cart.service';
import { Category, Page, Product } from '../core/models';
import { Icon } from '../shared/icon';
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
  imports: [RouterLink, MoneyPipe, ProductImage, Icon],
  template: `
    @if (isHome()) {
      <section class="mb-14 sm:mb-20">
        <p class="eyebrow">The Haven shop</p>
        <h1 class="mt-4 max-w-4xl text-5xl leading-[1.04] sm:text-7xl">Everyday things, <em>done well.</em></h1>
        <p class="mt-6 max-w-xl text-lg text-muted">Tech, home, fashion, and more, all in one cart.</p>
      </section>

      @if (categories.value(); as list) {
        <nav aria-label="Browse by category" class="mb-14 sm:mb-20">
          <p class="eyebrow mb-4">Browse by category</p>
          <ul class="grid border-t border-base-300 sm:grid-cols-2 sm:gap-x-12 lg:grid-cols-3">
            @for (c of list; track c.slug; let i = $index) {
              <li class="border-b border-base-300">
                <button
                  class="group flex w-full items-baseline gap-4 py-4 text-left"
                  (click)="navigate({ category: c.slug, page: null })"
                >
                  <span class="tabular w-6 text-xs text-muted">{{ position(i) }}</span>
                  <span class="font-display text-2xl group-hover:italic">{{ c.name }}</span>
                  <span class="tabular ml-auto text-sm text-muted">{{ c.productCount }}</span>
                  <span class="-mr-1 self-center opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                    <app-icon name="arrow-right" />
                  </span>
                </button>
              </li>
            }
          </ul>
        </nav>
      }
    }

    <section aria-labelledby="results-heading">
      <div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 id="results-heading" class="text-3xl sm:text-4xl">{{ heading() }}</h2>
        @if (products.value(); as result) {
          <p class="tabular text-sm text-muted" aria-live="polite">
            {{ result.total }} {{ result.total === 1 ? 'product' : 'products' }}
          </p>
        }
      </div>
      @if (q()) {
        <button class="link-quiet mt-2 text-sm text-muted" (click)="navigate({ q: null, page: null })">Clear search</button>
      }

      <!-- Categories on the left, sort pinned to the right edge. On a phone the sort gets its own row
           above the categories, which scroll sideways. -->
      <div class="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-end sm:gap-4 sm:border-b sm:border-base-300">
        <div
          class="-mb-px flex min-w-0 flex-1 gap-6 overflow-x-auto border-b border-base-300 text-sm [scrollbar-width:none] sm:border-b-0"
          role="group"
          aria-label="Categories"
        >
          <button
            class="border-b py-3 whitespace-nowrap"
            [class]="category() ? 'border-transparent text-muted hover:text-base-content' : 'border-primary font-medium'"
            [attr.aria-pressed]="!category()"
            (click)="navigate({ category: null, page: null })"
          >
            All
          </button>
          @for (c of categories.value() ?? []; track c.slug) {
            <button
              class="border-b py-3 whitespace-nowrap"
              [class]="category() === c.slug ? 'border-primary font-medium' : 'border-transparent text-muted hover:text-base-content'"
              [attr.aria-pressed]="category() === c.slug"
              (click)="navigate({ category: c.slug, page: null })"
            >
              {{ c.name }}
            </button>
          }
        </div>
        <select
          class="select select-sm w-44 shrink-0 self-end sm:mb-2"
          aria-label="Sort by"
          [value]="sort()"
          (change)="navigate({ sort: $any($event.target).value, page: null })"
        >
          @for (option of sortOptions; track option.value) {
            <option [value]="option.value">{{ option.label }}</option>
          }
        </select>
      </div>

      @if (products.error()) {
        <div role="alert" class="alert alert-error mt-8">
          Couldn't load products.
          <button class="btn btn-sm" (click)="products.reload()">Try again</button>
        </div>
      } @else if (products.isLoading() && !products.hasValue()) {
        <div class="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
          @for (i of skeletons; track i) {
            <div>
              <div class="skeleton aspect-[4/5] rounded-sm"></div>
              <div class="skeleton mt-3 h-3 w-1/3"></div>
              <div class="skeleton mt-2 h-4 w-3/4"></div>
            </div>
          }
        </div>
      } @else if (products.value(); as result) {
        @if (result.items.length === 0) {
          <div class="py-20 text-center">
            <p class="font-display text-3xl">Nothing matches that.</p>
            <p class="mt-2 text-muted">Try a different word, or clear the filters.</p>
            <button class="btn btn-outline mt-6" (click)="navigate({ q: null, category: null, page: null })">Clear filters</button>
          </div>
        } @else {
          <div class="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 transition-opacity md:grid-cols-3 lg:grid-cols-4" [class.opacity-60]="products.isLoading()">
            @for (p of result.items; track p.id) {
              <article class="group">
                <div class="relative">
                  <a [routerLink]="['/products', p.slug]" class="block" [attr.aria-label]="p.name" tabindex="-1">
                    <app-product-image
                      class="photo aspect-[4/5] rounded-sm"
                      [class.opacity-60]="p.stock === 0"
                      [name]="p.name"
                      [category]="p.category.slug"
                      [src]="p.imageUrl"
                    />
                  </a>
                  @if (p.stock === 0) {
                    <span class="absolute top-2 left-2 bg-base-100 px-2 py-1 text-xs tracking-wide">Sold out</span>
                  } @else {
                    <button
                      class="quick-add btn btn-square absolute right-2 bottom-2 border-base-300 bg-base-100"
                      [disabled]="cart.quantityOf(p.id) >= cart.maxFor(p.stock)"
                      (click)="cart.add(p)"
                      [attr.aria-label]="'Add ' + p.name + ' to cart'"
                    >
                      <app-icon name="plus" />
                    </button>
                  }
                </div>
                <div class="mt-3 space-y-1">
                  <p class="eyebrow">{{ p.category.name }}</p>
                  <div class="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                    <a [routerLink]="['/products', p.slug]" class="link-quiet line-clamp-2 font-medium">{{ p.name }}</a>
                    <span class="tabular shrink-0">{{ p.priceCents | money }}</span>
                  </div>
                  @if (p.stock > 0 && p.stock <= 5) {
                    <p class="text-xs text-accent">Only {{ p.stock }} left</p>
                  }
                </div>
              </article>
            }
          </div>

          @if (pageCount() > 1) {
            <nav class="mt-16 flex items-center justify-between border-t border-base-300 pt-6 text-sm" aria-label="Pages">
              <button class="link-quiet inline-flex items-center gap-2 disabled:opacity-40" [disabled]="page() <= 1" (click)="navigate({ page: page() - 1 })">
                <app-icon name="arrow-left" /> Previous
              </button>
              <span class="tabular text-muted">Page {{ page() }} of {{ pageCount() }}</span>
              <button class="link-quiet inline-flex items-center gap-2 disabled:opacity-40" [disabled]="page() >= pageCount()" (click)="navigate({ page: page() + 1 })">
                Next <app-icon name="arrow-right" />
              </button>
            </nav>
          }
        }
      }
    </section>
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

  /** The introduction and category index only show on the plain front page, not in search or filtered views. */
  protected readonly isHome = computed(() => !this.q() && !this.category() && this.page() === 1);

  protected readonly heading = computed(() => {
    if (this.q()) return `Results for “${this.q()}”`;
    const slug = this.category();
    if (slug) return this.categories.value()?.find((c) => c.slug === slug)?.name ?? 'Products';
    return 'All products';
  });

  protected position(index: number): string {
    return String(index + 1).padStart(2, '0');
  }

  protected navigate(params: Record<string, string | number | null>): void {
    this.router.navigate([], { queryParams: params, queryParamsHandling: 'merge', replaceUrl: 'q' in params });
  }
}
