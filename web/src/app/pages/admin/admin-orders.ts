import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ApiService, apiErrorMessage } from '../../core/api.service';
import { Order, OrderStatus } from '../../core/models';
import { MoneyPipe } from '../../shared/money.pipe';
import { StatusBadge } from '../../shared/status-badge';

// Mirrors TRANSITIONS in api/app/orders.py; the API enforces it either way.
const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  placed: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};
const FILTERS: (OrderStatus | '')[] = ['', 'placed', 'shipped', 'delivered', 'cancelled'];

@Component({
  selector: 'app-admin-orders',
  imports: [RouterLink, DatePipe, MoneyPipe, StatusBadge],
  template: `
    <div class="mb-3 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
      @for (f of filters; track f) {
        <button class="btn btn-sm capitalize" [class.btn-primary]="status() === f" (click)="status.set(f)">
          {{ f || 'All' }}
        </button>
      }
    </div>

    @if (error()) {
      <div role="alert" class="alert alert-error mb-3">{{ error() }}</div>
    }

    @if (orders.error()) {
      <div role="alert" class="alert alert-error">
        Couldn't load orders.
        <button class="btn btn-sm" (click)="orders.reload()">Try again</button>
      </div>
    } @else if (orders.value(); as list) {
      <div class="overflow-x-auto rounded-box bg-base-100 shadow-sm">
        <table class="table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Placed</th>
              <th>Status</th>
              <th class="text-right">Total</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (o of list; track o.id) {
              <tr>
                <td><a [routerLink]="['/orders', o.id]" class="link">#{{ o.id }}</a></td>
                <td class="max-w-48 truncate">{{ o.customerEmail }}</td>
                <td class="whitespace-nowrap">{{ o.createdAt | date: 'short' }}</td>
                <td><app-status-badge [status]="o.status" /></td>
                <td class="text-right">{{ o.totalCents | money }}</td>
                <td class="whitespace-nowrap">
                  @for (next of nextStatuses[o.status]; track next) {
                    <button
                      class="btn btn-xs mr-1 capitalize"
                      [class.btn-error]="next === 'cancelled'"
                      [class.btn-outline]="next === 'cancelled'"
                      [disabled]="busyId() === o.id"
                      (click)="setStatus(o, next)"
                    >
                      {{ next === 'cancelled' ? 'Cancel' : 'Mark ' + next }}
                    </button>
                  } @empty {
                    <span class="text-base-content/40">&mdash;</span>
                  }
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="6" class="py-8 text-center text-base-content/60">No orders here yet.</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <div class="skeleton h-60"></div>
    }
  `,
})
export class AdminOrders {
  private readonly api = inject(ApiService);

  protected readonly filters = FILTERS;
  protected readonly nextStatuses = NEXT_STATUSES;
  protected readonly status = signal<OrderStatus | ''>('');
  protected readonly busyId = signal<number | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly orders = httpResource<Order[]>(() => ({
    url: '/api/admin/orders',
    params: this.status() ? { status: this.status() } : undefined,
  }));

  protected async setStatus(order: Order, next: OrderStatus): Promise<void> {
    if (next === 'cancelled' && !confirm(`Cancel order #${order.id}? Items go back into stock.`)) return;
    this.busyId.set(order.id);
    this.error.set(null);
    try {
      await this.api.updateOrderStatus(order.id, next);
      this.orders.reload();
    } catch (err) {
      this.error.set(apiErrorMessage(err));
    } finally {
      this.busyId.set(null);
    }
  }
}
