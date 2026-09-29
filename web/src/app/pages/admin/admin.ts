import { Component, signal } from '@angular/core';

import { AdminOrders } from './admin-orders';
import { AdminProducts } from './admin-products';

@Component({
  selector: 'app-admin',
  imports: [AdminProducts, AdminOrders],
  template: `
    <div class="mb-4 flex flex-wrap items-center gap-4">
      <h1 class="text-2xl font-bold">Admin</h1>
      <div role="tablist" class="tabs tabs-box">
        <button role="tab" class="tab" [class.tab-active]="tab() === 'orders'" (click)="tab.set('orders')">Orders</button>
        <button role="tab" class="tab" [class.tab-active]="tab() === 'products'" (click)="tab.set('products')">
          Products
        </button>
      </div>
    </div>

    @if (tab() === 'orders') {
      <app-admin-orders />
    } @else {
      <app-admin-products />
    }
  `,
})
export class AdminPage {
  protected readonly tab = signal<'orders' | 'products'>('orders');
}
