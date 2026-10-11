import { TestBed } from '@angular/core/testing';

import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  function create(): ThemeService {
    TestBed.resetTestingModule();
    const service = TestBed.inject(ThemeService);
    TestBed.tick(); // run the effect that applies the theme
    return service;
  }

  it('follows the device by default: no theme is set', () => {
    const service = create();
    expect(service.mode()).toBe('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('applies and remembers an explicit choice', () => {
    const service = create();

    service.set('dark');
    TestBed.tick();
    expect(document.documentElement.getAttribute('data-theme')).toBe('haven-dark');
    expect(localStorage.getItem('haven.theme')).toBe('"dark"');

    service.set('light');
    TestBed.tick();
    expect(document.documentElement.getAttribute('data-theme')).toBe('haven');
  });

  it('going back to system removes the theme and forgets the choice', () => {
    const service = create();
    service.set('dark');
    TestBed.tick();

    service.set('system');
    TestBed.tick();

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem('haven.theme')).toBeNull();
  });

  it('restores the saved choice on the next visit', () => {
    localStorage.setItem('haven.theme', '"dark"');
    const service = create();
    expect(service.mode()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('haven-dark');
  });

  it('ignores a saved value it does not recognise', () => {
    localStorage.setItem('haven.theme', '"neon"');
    expect(create().mode()).toBe('system');
    localStorage.setItem('haven.theme', 'not json at all');
    expect(create().mode()).toBe('system');
  });
});
