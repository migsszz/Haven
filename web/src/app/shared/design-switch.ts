import { Component, inject } from '@angular/core';

import { DesignName, ThemeService } from '../core/theme.service';

const OPTIONS: { value: DesignName; label: string; swatches: string[] }[] = [
  { value: 'editorial', label: 'Editorial', swatches: ['#1c1a17', '#a8481f', '#f2eee7'] },
  { value: 'friendly', label: 'Friendly', swatches: ['#5b3fd9', '#cf3a2c', '#ffd166'] },
  { value: 'bold', label: 'Bold', swatches: ['#0b0b0f', '#2433ff', '#dfff2e'] },
];

/** Picks the look of the site, with a little swatch of each so the choice is easy to read. */
@Component({
  selector: 'app-design-switch',
  template: `
    <div role="radiogroup" aria-label="Design" class="grid grid-cols-3 gap-1 rounded-field border border-base-300 p-1">
      @for (option of options; track option.value) {
        <button
          type="button"
          role="radio"
          class="flex flex-col items-center gap-1.5 rounded-field px-1 py-2 text-xs transition-colors"
          [class]="theme.design() === option.value ? 'bg-primary text-primary-content' : 'hover:bg-base-200'"
          [attr.aria-checked]="theme.design() === option.value"
          (click)="theme.setDesign(option.value)"
        >
          <span class="flex" aria-hidden="true">
            @for (colour of option.swatches; track colour) {
              <span class="-ml-1 size-3.5 rounded-full border border-base-100 first:ml-0" [style.background]="colour"></span>
            }
          </span>
          {{ option.label }}
        </button>
      }
    </div>
  `,
})
export class DesignSwitch {
  protected readonly theme = inject(ThemeService);
  protected readonly options = OPTIONS;
}
