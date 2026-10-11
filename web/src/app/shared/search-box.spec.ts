import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { SearchBox } from './search-box';

describe('SearchBox', () => {
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: '**', children: [] }]), provideHttpClient(), provideHttpClientTesting()],
    });
    router = TestBed.inject(Router);
  });

  function render() {
    const fixture = TestBed.createComponent(SearchBox);
    fixture.detectChanges();
    return fixture;
  }

  function type(fixture: ReturnType<typeof render>, text: string) {
    const input = (fixture.nativeElement as HTMLElement).querySelector('input')!;
    input.value = text;
    input.dispatchEvent(new Event('input'));
    return input;
  }

  it('shows results in the catalog when submitted, clearing any category filter', async () => {
    await router.navigateByUrl('/products/travel-mug?category=home-kitchen&page=3');
    const fixture = render();

    type(fixture, '  desk lamp ');
    (fixture.nativeElement as HTMLElement).querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    const url = router.parseUrl(router.url);
    expect(url.root.children['primary']?.segments.length ?? 0).toBe(0); // the catalog, at "/"
    expect(url.queryParams).toEqual({ q: 'desk lamp' });
  });

  it('starts with the current query and follows the address bar', async () => {
    await router.navigateByUrl('/?q=lamp');
    const fixture = render();
    const input = (fixture.nativeElement as HTMLElement).querySelector('input')!;
    expect(input.value).toBe('lamp');

    await router.navigateByUrl('/?q=mug');
    fixture.detectChanges();
    expect(input.value).toBe('mug');

    await router.navigateByUrl('/'); // e.g. "Clear search"
    fixture.detectChanges();
    expect(input.value).toBe('');
  });

  it('searching for nothing just goes to the catalog', async () => {
    await router.navigateByUrl('/?q=old');
    const fixture = render();
    type(fixture, '   ');
    (fixture.nativeElement as HTMLElement).querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(router.parseUrl(router.url).queryParams).toEqual({});
  });
});
