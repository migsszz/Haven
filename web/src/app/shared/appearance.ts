import { Component } from '@angular/core';

import { DesignSwitch } from './design-switch';
import { ThemeSwitch } from './theme-switch';

/** Both appearance choices together: the design, then light or dark. Used in every menu that offers them. */
@Component({
  selector: 'app-appearance',
  imports: [DesignSwitch, ThemeSwitch],
  template: `
    <p class="eyebrow mb-2">Design</p>
    <app-design-switch />
    <p class="eyebrow mt-4 mb-2">Mode</p>
    <app-theme-switch />
  `,
  host: { class: 'block' },
})
export class Appearance {}
