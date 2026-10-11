import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AdminSummary } from '../../core/models';
import { AdminPage } from './admin';

const summary: AdminSummary = {
  ordersByStatus: { placed: 3, shipped: 1, delivered: 18, cancelled: 2 },
  revenueCents: 482300,
  liveProducts: 7,
  hiddenProducts: 1,
  lowStockProducts: 2,
};

describe('AdminPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  async function render() {
    const fixture = TestBed.createComponent(AdminPage);
    fixture.detectChanges();
    http.expectOne('/api/admin/summary').flush(summary);
    http.expectOne((r) => r.url === '/api/admin/orders').flush([]);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('shows the headline numbers from the API', async () => {
    const page = (await render()).nativeElement as HTMLElement;
    const tiles = [...page.querySelectorAll('dl > div')].map((tile) => [
      tile.querySelector('dt')?.textContent?.trim(),
      tile.querySelector('dd')?.textContent?.trim(),
    ]);
    expect(tiles).toEqual([
      ['Awaiting shipment', '3'],
      ['In transit', '1'],
      ['Low or out of stock', '2'],
      ['Live products', '7'],
      ['Revenue', '$4,823.00'],
    ]);
  });

  it('highlights the numbers that need attention', async () => {
    const page = (await render()).nativeElement as HTMLElement;
    const flagged = [...page.querySelectorAll('dd.text-accent')].map((d) => d.textContent?.trim());
    expect(flagged).toEqual(['3', '2']); // orders waiting, and low stock
  });

  it('switches between orders and products', async () => {
    const fixture = await render();
    const page = fixture.nativeElement as HTMLElement;
    const tab = (name: string) => [...page.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((t) => t.textContent?.includes(name))!;
    expect(tab('Orders').getAttribute('aria-selected')).toBe('true');

    tab('Products').click();
    fixture.detectChanges();

    expect(tab('Products').getAttribute('aria-selected')).toBe('true');
    expect(tab('Orders').getAttribute('aria-selected')).toBe('false');
  });
});
