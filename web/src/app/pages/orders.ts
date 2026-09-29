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
    <h1 class="mb-4 text-2xl font-bold">Your orders</h1>

    @if (orders.error()) {
      <div role="alert" class="alert alert-error">
        Couldn't load your orders.
        <button class="btn btn-sm" (click)="orders.reload()">Try again</button>
      </div>
    } @else if (orders.value(); as list) {
      @if (list.length === 0) {
        <div class="rounded-box bg-base-100 p-10 text-center">
          <p class="font-medium">You haven't placed any orders yet.</p>
          <a routerLink="/" class="btn btn-primary btn-sm mt-3">Start shopping</a>
        </div>
      } @else {
        <ul class="space-y-3">
          @for (order of list; track order.id) {
            <li>
              <a
                [routerLink]="['/orders', order.id]"
                class="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-box bg-base-100 p-4 shadow-sm hover:shadow-md"
              >
                <span class="font-semibold">Order #{{ order.id }}</span>
                <app-status-badge [status]="order.status" />
                <span class="text-sm text-base-content/60">{{ order.createdAt | date: 'mediumDate' }}</span>
                <span class="ml-auto font-semibold">{{ order.totalCents | money }}</span>
                <span class="w-full truncate text-sm text-base-content/70">
                  @for (item of order.items; track item.productId; let last = $last) {
                    {{ item.quantity }} &times; {{ item.productName }}{{ last ? '' : ', ' }}
                  }
                </span>
              </a>
            </li>
          }
        </ul>
      }
    } @else {
      <div class="skeleton h-40"></div>
    }
  `,
})
export class OrdersPage {
  protected readonly orders = httpResource<Order[]>(() => '/api/orders');
}
