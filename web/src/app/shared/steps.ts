import { Component, input } from '@angular/core';

const STEPS = ['Cart', 'Details', 'Confirmed'];

/** "1 Cart — 2 Details — 3 Confirmed" shown above the cart, checkout and order confirmation. */
@Component({
  selector: 'app-steps',
  template: `
    <ol class="flex items-center gap-3 text-sm" aria-label="Checkout progress">
      @for (label of steps; track label; let i = $index) {
        <li class="flex items-center gap-3" [attr.aria-current]="i + 1 === current() ? 'step' : null">
          <span
            class="flex items-center gap-2"
            [class.text-muted]="i + 1 !== current()"
            [class.font-medium]="i + 1 === current()"
          >
            <span
              class="step-dot tabular grid size-6 place-items-center rounded-full border text-xs"
              [class.border-primary]="i + 1 <= current()"
              [class.bg-primary]="i + 1 === current()"
              [class.text-primary-content]="i + 1 === current()"
              [class.border-base-300]="i + 1 > current()"
            >
              {{ i + 1 }}
            </span>
            {{ label }}
          </span>
          @if (i < steps.length - 1) {
            <span class="h-px w-6 bg-base-300 sm:w-10" aria-hidden="true"></span>
          }
        </li>
      }
    </ol>
  `,
})
export class Steps {
  readonly current = input.required<1 | 2 | 3>();
  protected readonly steps = STEPS;
}
