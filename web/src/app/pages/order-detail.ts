import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { booleanAttribute, Component, inject, input, numberAttribute, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ApiService, apiErrorMessage } from '../core/api.service';
import { Order, OrderStatus } from '../core/models';
import { Icon } from '../shared/icon';
import { MoneyPipe } from '../shared/money.pipe';
import { StatusBadge } from '../shared/status-badge';
import { Steps } from '../shared/steps';

const PROGRESS: OrderStatus[] = ['placed', 'shipped', 'delivered'];

@Component({
  selector: 'app-order-detail',
  imports: [RouterLink, DatePipe, MoneyPipe, StatusBadge, Steps, Icon],
  template: `
    @if (placed()) {
      <app-steps [current]="3" />
    }
    <a routerLink="/orders" class="link-quiet mt-8 inline-flex items-center gap-2 text-sm text-muted">
      <app-icon name="arrow-left" /> All orders
    </a>

    @if (order.error()) {
      <div class="py-20 text-center">
        <p class="font-display text-3xl">We couldn't find that order.</p>
      </div>
    } @else if (order.value(); as o) {
      <header class="mt-6">
        @if (placed()) {
          <p class="eyebrow text-success">Thank you</p>
          <h1 class="mt-3 text-4xl sm:text-5xl">Your order is placed.</h1>
        } @else {
          <p class="eyebrow">{{ o.createdAt | date: 'longDate' }}</p>
          <h1 class="mt-3 text-4xl sm:text-5xl">Order #{{ o.id }}</h1>
        }
        <div class="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted">
          <app-status-badge [status]="o.status" />
          @if (placed()) {
            <span>Order #{{ o.id }} &middot; {{ o.createdAt | date: 'medium' }}</span>
          } @else {
            <span>{{ o.createdAt | date: 'shortTime' }}</span>
          }
        </div>
      </header>

      @if (o.status === 'cancelled') {
        <p class="mt-8 border border-base-300 p-4 text-sm text-muted">This order was cancelled and its items went back into stock.</p>
      } @else {
        <ol class="mt-10 grid max-w-2xl grid-cols-3" aria-label="Order progress">
          @for (step of progress; track step; let i = $index) {
            <li class="relative pt-5 text-sm" [class.text-muted]="i > progressIndex(o.status)">
              <span class="absolute top-0 left-0 h-px w-full" [class]="i <= progressIndex(o.status) ? 'bg-primary' : 'bg-base-300'"></span>
              <span class="absolute -top-1 left-0 size-2 rounded-full" [class]="i <= progressIndex(o.status) ? 'bg-primary' : 'bg-base-300'"></span>
              <span class="capitalize" [class.font-medium]="i === progressIndex(o.status)">{{ step }}</span>
            </li>
          }
        </ol>
      }

      <div class="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="items-heading">
          <p id="items-heading" class="eyebrow">Items</p>
          <ul class="mt-4 border-t border-base-300">
            @for (item of o.items; track item.productId) {
              <li class="flex items-baseline justify-between gap-4 border-b border-base-300 py-4">
                <div>
                  <p class="font-medium">{{ item.productName }}</p>
                  <p class="tabular text-sm text-muted">{{ item.quantity }} &times; {{ item.unitPriceCents | money }}</p>
                </div>
                <span class="tabular">{{ item.unitPriceCents * item.quantity | money }}</span>
              </li>
            }
          </ul>
          <div class="mt-5 flex items-baseline justify-between">
            <span>Total</span>
            <span class="tabular font-display text-3xl">{{ o.totalCents | money }}</span>
          </div>
        </section>

        <aside>
          <p class="eyebrow">Ship to</p>
          <p class="mt-4 border-t border-base-300 pt-4 font-medium">{{ o.shippingName }}</p>
          <p class="whitespace-pre-line text-muted">{{ o.shippingAddress }}</p>

          @if (o.status === 'placed') {
            <div class="mt-8 border-t border-base-300 pt-6">
              <button class="btn btn-outline btn-error w-full" [disabled]="cancelling()" (click)="cancel(o.id)">Cancel order</button>
              <p class="mt-2 text-xs text-muted">You can cancel until the order ships.</p>
            </div>
          }
          @if (error()) {
            <div role="alert" class="alert alert-error alert-soft mt-4">{{ error() }}</div>
          }
        </aside>
      </div>
    } @else {
      <div class="skeleton mt-8 h-80"></div>
    }
  `,
})
export class OrderDetailPage {
  private readonly api = inject(ApiService);

  readonly id = input.required({ transform: numberAttribute });
  readonly placed = input(false, { transform: booleanAttribute });

  protected readonly order = httpResource<Order>(() => `/api/orders/${this.id()}`);
  protected readonly progress = PROGRESS;
  protected readonly cancelling = signal(false);
  protected readonly error = signal<string | null>(null);

  protected progressIndex(status: OrderStatus): number {
    return PROGRESS.indexOf(status);
  }

  protected async cancel(id: number): Promise<void> {
    if (!confirm('Cancel this order? Items go back into stock.')) return;
    this.cancelling.set(true);
    this.error.set(null);
    try {
      this.order.set(await this.api.cancelOrder(id));
    } catch (err) {
      this.error.set(apiErrorMessage(err));
    } finally {
      this.cancelling.set(false);
    }
  }
}
