import { TestBed } from '@angular/core/testing';

import { ThemeService } from '../core/theme.service';
import { ThemeSwitch } from './theme-switch';

describe('ThemeSwitch', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  function render() {
    const fixture = TestBed.createComponent(ThemeSwitch);
    fixture.detectChanges();
    const radios = [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    return { fixture, radios, checked: () => radios.filter((r) => r.getAttribute('aria-checked') === 'true').map((r) => r.textContent?.trim()) };
  }

  it('offers Light, Dark and System, with the current mode selected', () => {
    const { radios, checked } = render();
    expect(radios.map((r) => r.textContent?.trim())).toEqual(['Light', 'Dark', 'System']);
    expect(checked()).toEqual(['System']);
  });

  it('changes the theme when a button is pressed', () => {
    const { fixture, radios, checked } = render();
    radios[1].click();
    fixture.detectChanges();

    expect(TestBed.inject(ThemeService).mode()).toBe('dark');
    expect(checked()).toEqual(['Dark']);
  });
});
