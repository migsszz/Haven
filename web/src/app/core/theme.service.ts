import { effect, Injectable, signal } from '@angular/core';

import { readStorage, writeStorage } from './storage';

export type ThemeMode = 'system' | 'light' | 'dark';

const KEY = 'haven.theme';
const THEMES: Record<Exclude<ThemeMode, 'system'>, string> = { light: 'haven', dark: 'haven-dark' };

/**
 * Light, dark, or follow the device. "System" sets no theme at all, so the stylesheet's own
 * prefers-color-scheme rule decides. The choice is remembered in the browser, and index.html
 * applies it before the first paint so a dark-mode shopper never sees a flash of light.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<ThemeMode>(this.stored());

  constructor() {
    effect(() => {
      const root = document.documentElement;
      const mode = this.mode();
      if (mode === 'system') root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', THEMES[mode]);
    });
  }

  set(mode: ThemeMode): void {
    this.mode.set(mode);
    writeStorage(KEY, mode === 'system' ? null : mode);
  }

  private stored(): ThemeMode {
    const value = readStorage<unknown>(KEY, 'system');
    return value === 'light' || value === 'dark' ? value : 'system';
  }
}
