import { Component, computed, input } from '@angular/core';

import { OrderStatus } from '../core/models';

const STYLES: Record<OrderStatus, string> = {
  placed: 'badge-info',
  shipped: 'badge-warning',
  delivered: 'badge-success',
  cancelled: 'badge-ghost',
};

@Component({
  selector: 'app-status-badge',
  template: `<span class="badge badge-sm capitalize" [class]="style()">{{ status() }}</span>`,
})
export class StatusBadge {
  readonly status = input.required<OrderStatus>();
  protected readonly style = computed(() => STYLES[this.status()]);
}
