import { httpResource } from '@angular/common/http';
import { Component, signal } from '@angular/core';

import { AdminSummary } from '../../core/models';
import { MoneyPipe } from '../../shared/money.pipe';
import { AdminOrders } from './admin-orders';
import { AdminProducts } from './admin-products';

@Component({
  selector: 'app-admin',
  imports: [AdminProducts, AdminOrders],
  template: `
    <p class="eyebrow">Store</p>
    <h1 class="mt-3 text-4xl sm:text-5xl">Admin</h1>

    <!-- Headline numbers, counted by the API across every order and product. -->
    @if (summary.value(); as s) {
      <dl class="mt-8 grid grid-cols-2 border-y border-base-300 sm:grid-cols-3 lg:grid-cols-5">
        @for (tile of tiles(s); track tile.label) {
          <div class="border-b border-base-300 px-1 py-5 last:border-b-0 sm:px-5 sm:first:pl-1 lg:border-b-0 lg:border-l lg:first:border-l-0">
            <dt class="eyebrow">{{ tile.label }}</dt>
            <dd class="tabular mt-2 font-display text-4xl" [class.text-accent]="tile.alert">{{ tile.value }}</dd>
          </div>
        }
      </dl>
    }

    <div role="tablist" class="mt-10 mb-6 flex gap-8 border-b border-base-300">
      <button
        role="tab"
        class="-mb-px border-b py-3"
        [class]="tab() === 'orders' ? 'border-primary font-medium' : 'border-transparent text-muted hover:text-base-content'"
        [attr.aria-selected]="tab() === 'orders'"
        (click)="tab.set('orders')"
      >
        Orders
      </button>
      <button
        role="tab"
        class="-mb-px border-b py-3"
        [class]="tab() === 'products' ? 'border-primary font-medium' : 'border-transparent text-muted hover:text-base-content'"
        [attr.aria-selected]="tab() === 'products'"
        (click)="tab.set('products')"
      >
        Products
      </button>
    </div>

    @if (tab() === 'orders') {
      <app-admin-orders (changed)="summary.reload()" />
    } @else {
      <app-admin-products (changed)="summary.reload()" />
    }
  `,
})
export class AdminPage {
  protected readonly tab = signal<'orders' | 'products'>('orders');
  protected readonly summary = httpResource<AdminSummary>(() => '/api/admin/summary');
  private readonly money = new MoneyPipe();

  protected tiles(s: AdminSummary) {
    return [
      { label: 'Awaiting shipment', value: String(s.ordersByStatus.placed), alert: s.ordersByStatus.placed > 0 },
      { label: 'In transit', value: String(s.ordersByStatus.shipped), alert: false },
      { label: 'Low or out of stock', value: String(s.lowStockProducts), alert: s.lowStockProducts > 0 },
      { label: 'Live products', value: String(s.liveProducts), alert: false },
      { label: 'Revenue', value: this.money.transform(s.revenueCents), alert: false },
    ];
  }
}
