import { computed, effect, Injectable, signal } from '@angular/core';

import { Product, StockProblem } from './models';
import { readStorage, writeStorage } from './storage';

const CART_KEY = 'haven.cart';
export const MAX_PER_LINE = 20;

export interface CartLine {
  productId: number;
  slug: string;
  name: string;
  categorySlug: string;
  imageUrl: string | null;
  priceCents: number;
  stock: number;
  quantity: number;
}

/**
 * The cart lives in the browser. Prices shown here are for display only: the API
 * re-reads every price and checks stock when the order is placed.
 */
@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly linesSignal = signal<CartLine[]>(readStorage<CartLine[]>(CART_KEY, []));

  readonly lines = this.linesSignal.asReadonly();
  readonly count = computed(() => this.linesSignal().reduce((n, l) => n + l.quantity, 0));
  readonly subtotalCents = computed(() => this.linesSignal().reduce((n, l) => n + l.priceCents * l.quantity, 0));
  readonly isEmpty = computed(() => this.linesSignal().length === 0);

  constructor() {
    effect(() => writeStorage(CART_KEY, this.linesSignal()));
  }

  quantityOf(productId: number): number {
    return this.linesSignal().find((l) => l.productId === productId)?.quantity ?? 0;
  }

  maxFor(stock: number): number {
    return Math.min(stock, MAX_PER_LINE);
  }

  add(product: Product, quantity = 1): void {
    this.linesSignal.update((lines) => {
      const existing = lines.find((l) => l.productId === product.id);
      const max = this.maxFor(product.stock);
      if (existing) {
        return lines.map((l) =>
          l.productId === product.id
            ? { ...l, priceCents: product.priceCents, stock: product.stock, quantity: Math.min(l.quantity + quantity, max) }
            : l,
        );
      }
      return [
        ...lines,
        {
          productId: product.id,
          slug: product.slug,
          name: product.name,
          categorySlug: product.category.slug,
          imageUrl: product.imageUrl,
          priceCents: product.priceCents,
          stock: product.stock,
          quantity: Math.min(quantity, max),
        },
      ];
    });
  }

  setQuantity(productId: number, quantity: number): void {
    if (quantity <= 0) {
      this.remove(productId);
      return;
    }
    this.linesSignal.update((lines) =>
      lines.map((l) => (l.productId === productId ? { ...l, quantity: Math.min(quantity, this.maxFor(l.stock)) } : l)),
    );
  }

  remove(productId: number): void {
    this.linesSignal.update((lines) => lines.filter((l) => l.productId !== productId));
  }

  clear(): void {
    this.linesSignal.set([]);
  }

  /** Applies a checkout rejection: shrink lines to what's left, drop unavailable ones. */
  applyStockProblems(problems: StockProblem[]): void {
    this.linesSignal.update((lines) =>
      lines
        .map((l) => {
          const problem = problems.find((p) => p.productId === l.productId);
          if (!problem) return l;
          const available = problem.available ?? 0;
          return { ...l, stock: available, quantity: Math.min(l.quantity, available) };
        })
        .filter((l) => l.quantity > 0),
    );
  }
}
