import { TestBed } from '@angular/core/testing';

import { ThemeService } from './theme.service';

const root = () => document.documentElement;

/** A stand-in for the device's colour-scheme setting that tests can flip. */
function fakeDevice(dark: boolean) {
  let listener: ((e: { matches: boolean }) => void) | undefined;
  vi.stubGlobal('matchMedia', () => ({
    matches: dark,
    addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => (listener = fn),
  }));
  return { change: (nowDark: boolean) => listener?.({ matches: nowDark }) };
}

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    root().removeAttribute('data-theme');
    root().removeAttribute('data-design');
    vi.unstubAllGlobals();
  });
  afterEach(() => vi.unstubAllGlobals());

  function create(): ThemeService {
    TestBed.resetTestingModule();
    const service = TestBed.inject(ThemeService);
    TestBed.tick(); // run the effect that applies the theme
    return service;
  }
  const applied = () => [root().getAttribute('data-design'), root().getAttribute('data-theme')];

  it('starts as Editorial, following a light device', () => {
    fakeDevice(false);
    const service = create();
    expect([service.design(), service.mode()]).toEqual(['editorial', 'system']);
    expect(applied()).toEqual(['editorial', 'haven']);
  });

  it('follows a dark device while the mode is System, and notices when it changes', () => {
    const device = fakeDevice(true);
    create();
    expect(applied()).toEqual(['editorial', 'haven-dark']);

    device.change(false);
    TestBed.tick();
    expect(applied()).toEqual(['editorial', 'haven']);
  });

  it('combines every design with light and dark', () => {
    fakeDevice(false);
    const service = create();
    const expected = {
      editorial: ['haven', 'haven-dark'],
      friendly: ['friendly', 'friendly-dark'],
      bold: ['bold', 'bold-dark'],
    } as const;

    for (const [design, [light, dark]] of Object.entries(expected)) {
      service.setDesign(design as keyof typeof expected);
      service.setMode('light');
      TestBed.tick();
      expect(applied()).toEqual([design, light]);

      service.setMode('dark');
      TestBed.tick();
      expect(applied()).toEqual([design, dark]);
    }
  });

  it('an explicit mode wins over the device', () => {
    fakeDevice(true);
    const service = create();
    service.setMode('light');
    TestBed.tick();
    expect(applied()[1]).toBe('haven');
  });

  it('remembers both choices, and forgets them when they go back to the defaults', () => {
    fakeDevice(false);
    const service = create();

    service.setDesign('bold');
    service.setMode('dark');
    expect(localStorage.getItem('haven.design')).toBe('"bold"');
    expect(localStorage.getItem('haven.theme')).toBe('"dark"');

    service.setDesign('editorial');
    service.setMode('system');
    expect(localStorage.getItem('haven.design')).toBeNull();
    expect(localStorage.getItem('haven.theme')).toBeNull();
  });

  it('restores the saved choices on the next visit', () => {
    fakeDevice(false);
    localStorage.setItem('haven.design', '"friendly"');
    localStorage.setItem('haven.theme', '"dark"');
    const service = create();
    expect([service.design(), service.mode()]).toEqual(['friendly', 'dark']);
    expect(applied()).toEqual(['friendly', 'friendly-dark']);
  });

  it('ignores saved values it does not recognise', () => {
    fakeDevice(false);
    localStorage.setItem('haven.design', '"neon"');
    localStorage.setItem('haven.theme', 'not json at all');
    const service = create();
    expect([service.design(), service.mode()]).toEqual(['editorial', 'system']);
  });
});
