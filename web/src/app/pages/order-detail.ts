import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { booleanAttribute, Component, inject, input, numberAttribute, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ApiService, apiErrorMessage } from '../core/api.service';
import { Order } from '../core/models';
import { MoneyPipe } from '../shared/money.pipe';
import { StatusBadge } from '../shared/status-badge';

@Component({
  selector: 'app-order-detail',
  imports: [RouterLink, DatePipe, MoneyPipe, StatusBadge],
  template: `
    <a routerLink="/orders" class="btn btn-ghost btn-sm mb-4">&larr; All orders</a>

    @if (placed()) {
      <div role="status" class="alert alert-success mb-4">Thanks! Your order has been placed.</div>
    }

    @if (order.error()) {
      <div class="rounded-box bg-base-100 p-10 text-center">
        <p class="font-medium">We couldn't find that order.</p>
      </div>
    } @else if (order.value(); as o) {
      <div class="rounded-box bg-base-100 p-5 shadow-sm">
        <div class="flex flex-wrap items-center gap-3">
          <h1 class="text-2xl font-bold">Order #{{ o.id }}</h1>
          <app-status-badge [status]="o.status" />
          <span class="text-sm text-base-content/60">{{ o.createdAt | date: 'medium' }}</span>
        </div>

        <div class="mt-5 overflow-x-auto">
          <table class="table">
            <thead>
              <tr>
                <th>Item</th>
                <th class="text-right">Price</th>
                <th class="text-right">Qty</th>
                <th class="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              @for (item of o.items; track item.productId) {
                <tr>
                  <td>{{ item.productName }}</td>
                  <td class="text-right">{{ item.unitPriceCents | money }}</td>
                  <td class="text-right">{{ item.quantity }}</td>
                  <td class="text-right">{{ item.unitPriceCents * item.quantity | money }}</td>
                </tr>
              }
            </tbody>
            <tfoot>
              <tr>
                <th colspan="3" class="text-right">Total</th>
                <th class="text-right">{{ o.totalCents | money }}</th>
              </tr>
            </tfoot>
          </table>
        </div>

        <div class="mt-5">
          <h2 class="font-semibold">Ship to</h2>
          <p>{{ o.shippingName }}</p>
          <p class="whitespace-pre-line text-base-content/70">{{ o.shippingAddress }}</p>
        </div>

        @if (o.status === 'placed') {
          <div class="mt-6 flex items-center gap-3">
            <button class="btn btn-outline btn-error btn-sm" [disabled]="cancelling()" (click)="cancel(o.id)">
              Cancel order
            </button>
            <span class="text-sm text-base-content/60">You can cancel until the order ships.</span>
          </div>
        }
        @if (error()) {
          <div role="alert" class="alert alert-error mt-4">{{ error() }}</div>
        }
      </div>
    } @else {
      <div class="skeleton h-80"></div>
    }
  `,
})
export class OrderDetailPage {
  private readonly api = inject(ApiService);

  readonly id = input.required({ transform: numberAttribute });
  readonly placed = input(false, { transform: booleanAttribute });

  protected readonly order = httpResource<Order>(() => `/api/orders/${this.id()}`);
  protected readonly cancelling = signal(false);
  protected readonly error = signal<string | null>(null);

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
