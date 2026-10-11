import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, inject, output, signal } from '@angular/core';
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
    <div class="cat-tabs mb-4 flex gap-6 overflow-x-auto border-b border-base-300 text-sm [scrollbar-width:none]" role="group" aria-label="Filter by status">
      @for (f of filters; track f) {
        <button
          class="-mb-px border-b py-3 whitespace-nowrap capitalize"
          [class]="status() === f ? 'border-primary font-medium' : 'border-transparent text-muted hover:text-base-content'"
          [attr.aria-pressed]="status() === f"
          (click)="status.set(f)"
        >
          {{ f || 'All' }}
        </button>
      }
    </div>

    @if (error()) {
      <div role="alert" class="alert alert-error alert-soft mb-4">{{ error() }}</div>
    }

    @if (orders.error()) {
      <div role="alert" class="alert alert-error alert-soft">
        Couldn't load orders.
        <button class="btn btn-sm" (click)="orders.reload()">Try again</button>
      </div>
    } @else if (orders.value(); as list) {
      <div class="overflow-x-auto">
        <table class="table">
          <thead>
            <tr class="eyebrow border-base-300">
              <th class="font-medium">Order</th>
              <th class="font-medium max-sm:hidden">Customer</th>
              <th class="font-medium max-md:hidden">Placed</th>
              <th class="font-medium">Status</th>
              <th class="text-right font-medium">Total</th>
              <th class="font-medium"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            @for (o of list; track o.id) {
              <tr class="border-base-300">
                <td><a [routerLink]="['/orders', o.id]" class="link-quiet font-medium">#{{ o.id }}</a></td>
                <td class="max-w-48 truncate text-muted max-sm:hidden">{{ o.customerEmail }}</td>
                <td class="whitespace-nowrap text-muted max-md:hidden">{{ o.createdAt | date: 'short' }}</td>
                <td><app-status-badge [status]="o.status" /></td>
                <td class="tabular text-right">{{ o.totalCents | money }}</td>
                <td class="text-right whitespace-nowrap">
                  @for (next of nextStatuses[o.status]; track next) {
                    <button
                      class="btn btn-outline btn-sm ml-1 capitalize"
                      [class.btn-error]="next === 'cancelled'"
                      [disabled]="busyId() === o.id"
                      (click)="setStatus(o, next)"
                    >
                      {{ next === 'cancelled' ? 'Cancel' : 'Mark ' + next }}
                    </button>
                  } @empty {
                    <span class="text-muted">&mdash;</span>
                  }
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="6" class="py-12 text-center text-muted">No orders here yet.</td>
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

  /** Fires after a status change, so the dashboard numbers can refresh. */
  readonly changed = output<void>();

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
      this.changed.emit();
    } catch (err) {
      this.error.set(apiErrorMessage(err));
    } finally {
      this.busyId.set(null);
    }
  }
}
