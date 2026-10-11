import { Component, inject } from '@angular/core';

import { ThemeMode, ThemeService } from '../core/theme.service';
import { Icon, IconName } from './icon';

const OPTIONS: { value: ThemeMode; label: string; icon: IconName }[] = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'system', label: 'System', icon: 'monitor' },
];

/** Light, Dark, or System, as three buttons. */
@Component({
  selector: 'app-theme-switch',
  imports: [Icon],
  template: `
    <div role="radiogroup" aria-label="Colour theme" class="grid grid-cols-3 gap-1 rounded-sm border border-base-300 p-1">
      @for (option of options; track option.value) {
        <button
          type="button"
          role="radio"
          class="flex flex-col items-center gap-1 rounded-sm px-2 py-2 text-xs transition-colors"
          [class]="theme.mode() === option.value ? 'bg-primary text-primary-content' : 'hover:bg-base-200'"
          [attr.aria-checked]="theme.mode() === option.value"
          (click)="theme.set(option.value)"
        >
          <app-icon [name]="option.icon" />
          {{ option.label }}
        </button>
      }
    </div>
  `,
})
export class ThemeSwitch {
  protected readonly theme = inject(ThemeService);
  protected readonly options = OPTIONS;
}
