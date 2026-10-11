import { effect, Injectable, signal } from '@angular/core';

import { readStorage, writeStorage } from './storage';

/** Light, dark, or follow the device. */
export type ThemeMode = 'system' | 'light' | 'dark';
/** The look of the site. Each one has a light and a dark version. */
export type DesignName = 'editorial' | 'friendly' | 'bold';

const MODE_KEY = 'haven.theme';
const DESIGN_KEY = 'haven.design';

/** The stylesheet's theme name for each design (editorial predates the others and kept its original name). */
const THEME_BASE: Record<DesignName, string> = { editorial: 'haven', friendly: 'friendly', bold: 'bold' };

/**
 * Two independent choices: the design (Editorial, Friendly or Bold) and the mode (Light, Dark or System).
 * Together they pick one of six stylesheet themes. Both are remembered in the browser, and index.html applies
 * them before the first paint (using the same rule as below) so nobody sees a flash of the wrong look.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<ThemeMode>(this.storedMode());
  readonly design = signal<DesignName>(this.storedDesign());

  /** Whether the device itself is set to dark; only matters while the mode is System. */
  private readonly deviceIsDark = signal(false);

  constructor() {
    const query = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
    if (query) {
      this.deviceIsDark.set(query.matches);
      query.addEventListener('change', (e) => this.deviceIsDark.set(e.matches));
    }

    effect(() => {
      const root = document.documentElement;
      const dark = this.mode() === 'system' ? this.deviceIsDark() : this.mode() === 'dark';
      root.setAttribute('data-design', this.design());
      root.setAttribute('data-theme', THEME_BASE[this.design()] + (dark ? '-dark' : ''));
    });
  }

  setMode(mode: ThemeMode): void {
    this.mode.set(mode);
    writeStorage(MODE_KEY, mode === 'system' ? null : mode);
  }

  setDesign(design: DesignName): void {
    this.design.set(design);
    writeStorage(DESIGN_KEY, design === 'editorial' ? null : design);
  }

  private storedMode(): ThemeMode {
    const value = readStorage<unknown>(MODE_KEY, 'system');
    return value === 'light' || value === 'dark' ? value : 'system';
  }

  private storedDesign(): DesignName {
    const value = readStorage<unknown>(DESIGN_KEY, 'editorial');
    return value === 'friendly' || value === 'bold' ? value : 'editorial';
  }
}
