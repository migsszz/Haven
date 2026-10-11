import { TestBed } from '@angular/core/testing';

import { ThemeService } from '../core/theme.service';
import { DesignSwitch } from './design-switch';

describe('DesignSwitch', () => {
  beforeEach(() => localStorage.clear());

  function render() {
    const fixture = TestBed.createComponent(DesignSwitch);
    fixture.detectChanges();
    const radios = [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    return { fixture, radios, checked: () => radios.filter((r) => r.getAttribute('aria-checked') === 'true').map((r) => r.textContent?.trim()) };
  }

  it('offers the three designs, with the current one selected', () => {
    const { radios, checked } = render();
    expect(radios.map((r) => r.textContent?.trim())).toEqual(['Editorial', 'Friendly', 'Bold']);
    expect(checked()).toEqual(['Editorial']);
  });

  it('changes the design when a button is pressed', () => {
    const { fixture, radios, checked } = render();
    radios[2].click();
    fixture.detectChanges();

    expect(TestBed.inject(ThemeService).design()).toBe('bold');
    expect(checked()).toEqual(['Bold']);
  });

  it('is a labelled radio group, so a screen reader can announce it', () => {
    const { fixture } = render();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="radiogroup"]')?.getAttribute('aria-label')).toBe('Design');
  });
});
