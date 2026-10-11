import { Component, input, output } from '@angular/core';

import { Icon } from './icon';

/** A small − 1 + control. It only reports the new number; the page decides what that means. */
@Component({
  selector: 'app-quantity',
  imports: [Icon],
  template: `
    <div class="inline-flex items-center rounded-sm border border-base-300" role="group" [attr.aria-label]="label()">
      <button
        type="button"
        class="btn btn-ghost btn-square btn-sm"
        [attr.aria-label]="decreaseLabel()"
        [disabled]="value() <= min()"
        (click)="changed.emit(value() - 1)"
      >
        <app-icon name="minus" />
      </button>
      <span class="tabular w-9 text-center text-sm" aria-live="polite">{{ value() }}</span>
      <button
        type="button"
        class="btn btn-ghost btn-square btn-sm"
        aria-label="Increase"
        [disabled]="value() >= max()"
        (click)="changed.emit(value() + 1)"
      >
        <app-icon name="plus" />
      </button>
    </div>
  `,
})
export class Quantity {
  readonly value = input.required<number>();
  readonly min = input(1);
  readonly max = input(20);
  readonly label = input('Quantity');
  readonly decreaseLabel = input('Decrease');
  readonly changed = output<number>();
}
