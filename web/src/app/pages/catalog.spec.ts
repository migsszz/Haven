import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { Product } from '../core/models';
import { CatalogPage } from './catalog';

const product = (id: number, name: string, stock: number): Product => ({
  id,
  slug: name.toLowerCase().replace(/\W+/g, '-'),
  name,
  description: '',
  priceCents: 2500,
  stock,
  imageUrl: null,
  isActive: true,
  category: { slug: 'electronics', name: 'Electronics' },
});

const categories = [
  { slug: 'electronics', name: 'Electronics', productCount: 2 },
  { slug: 'fashion', name: 'Fashion', productCount: 0 },
];

describe('CatalogPage', () => {
  let http: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  async function render(inputs: Record<string, unknown> = {}, items: Product[] = [product(1, 'Desk Lamp', 3), product(2, 'Keyboard', 0)]) {
    const fixture = TestBed.createComponent(CatalogPage);
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/categories').flush(categories);
    http.expectOne((r) => r.url === '/api/products').flush({ items, page: 1, pageSize: 12, total: items.length });
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the introduction and category index on the front page', async () => {
    const page = await render();
    expect(page.querySelector('h1')?.textContent).toContain('Everyday things');
    expect(page.querySelector('nav[aria-label="Browse by category"]')).not.toBeNull();
    expect(page.querySelector('#results-heading')?.textContent).toBe('All products');
  });

  it('drops the introduction when searching or filtering, and says what the results are for', async () => {
    const searching = await render({ q: 'lamp' });
    expect(searching.querySelector('h1')).toBeNull();
    expect(searching.querySelector('#results-heading')?.textContent).toBe('Results for “lamp”');
    expect(searching.textContent).toContain('Clear search');
  });

  it('names the category in the heading', async () => {
    const page = await render({ category: 'electronics' });
    expect(page.querySelector('h1')).toBeNull();
    expect(page.querySelector('#results-heading')?.textContent).toBe('Electronics');
  });

  it('marks sold-out products, flags low stock, and keeps the add button reachable by name', async () => {
    const page = await render();
    expect(page.textContent).toContain('Sold out');
    expect(page.textContent).toContain('Only 3 left');
    expect(page.querySelector('button[aria-label="Add Desk Lamp to cart"]')).not.toBeNull();
    expect(page.querySelector('button[aria-label="Add Keyboard to cart"]')).toBeNull(); // sold out
  });

  it('keeps the sort dropdown after the category tabs, so it sits at the right edge', async () => {
    const page = await render();
    const tabs = page.querySelector('[aria-label="Categories"]')!;
    const sort = page.querySelector('select[aria-label="Sort by"]')!;
    expect(tabs.compareDocumentPosition(sort) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('puts the chosen category in the URL, and starts again from page one', async () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const page = await render();
    const tab = [...page.querySelectorAll<HTMLButtonElement>('[aria-label="Categories"] button')].find((b) => b.textContent?.trim() === 'Fashion')!;
    tab.click();
    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { category: 'fashion', page: null } }));
  });

  it('offers a way out of an empty result', async () => {
    const page = await render({ q: 'zzz' }, []);
    expect(page.textContent).toContain('Nothing matches that.');
    expect(page.textContent).toContain('Clear filters');
  });
});
