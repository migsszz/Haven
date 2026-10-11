import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Order } from '../core/models';
import { MoneyPipe } from '../shared/money.pipe';
import { StatusBadge } from '../shared/status-badge';

@Component({
  selector: 'app-orders',
  imports: [RouterLink, DatePipe, MoneyPipe, StatusBadge],
  template: `
    <p class="eyebrow">Your account</p>
    <h1 class="mt-3 text-4xl sm:text-5xl">Orders</h1>

    @if (orders.error()) {
      <div role="alert" class="alert alert-error alert-soft mt-8">
        Couldn't load your orders.
        <button class="btn btn-sm" (click)="orders.reload()">Try again</button>
      </div>
    } @else if (orders.value(); as list) {
      @if (list.length === 0) {
        <div class="py-20 text-center">
          <p class="font-display text-3xl">No orders yet.</p>
          <p class="mt-2 text-muted">When you place one, it will show up here.</p>
          <a routerLink="/" class="btn btn-primary mt-6">Start shopping</a>
        </div>
      } @else {
        <ul class="mt-10 border-t border-base-300">
          @for (order of list; track order.id) {
            <li class="border-b border-base-300">
              <a
                [routerLink]="['/orders', order.id]"
                class="grid items-baseline gap-x-8 gap-y-2 py-6 hover:bg-base-200/60 sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:px-3 sm:-mx-3"
              >
                <div>
                  <p class="font-display text-xl">Order #{{ order.id }}</p>
                  <p class="text-sm text-muted">{{ order.createdAt | date: 'mediumDate' }}</p>
                </div>
                <div class="min-w-0">
                  <p class="truncate text-sm text-muted">
                    @for (item of order.items; track item.productId; let last = $last) {
                      {{ item.quantity }} &times; {{ item.productName }}{{ last ? '' : ', ' }}
                    }
                  </p>
                  <div class="mt-2"><app-status-badge [status]="order.status" /></div>
                </div>
                <p class="tabular sm:text-right">{{ order.totalCents | money }}</p>
              </a>
            </li>
          }
        </ul>
      }
    } @else {
      <div class="skeleton mt-10 h-48"></div>
    }
  `,
})
export class OrdersPage {
  protected readonly orders = httpResource<Order[]>(() => '/api/orders');
}
