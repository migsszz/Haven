import { Component, computed, input } from '@angular/core';

import { OrderStatus } from '../core/models';

const STYLES: Record<OrderStatus, string> = {
  placed: 'border-accent text-accent',
  shipped: 'border-info text-info',
  delivered: 'border-success text-success',
  cancelled: 'border-base-300 text-muted',
};

/** Order status as a small outlined label. Colour is never the only cue: the word is always shown. */
@Component({
  selector: 'app-status-badge',
  template: `<span
    class="status-pill inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-wide whitespace-nowrap capitalize"
    [class]="style()"
    >{{ status() }}</span
  >`,
})
export class StatusBadge {
  readonly status = input.required<OrderStatus>();
  protected readonly style = computed(() => STYLES[this.status()]);
}
