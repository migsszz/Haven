import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { App } from './app';
import { CartService } from './core/cart.service';
import { Product } from './core/models';

const product: Product = {
  id: 1,
  slug: 'travel-mug',
  name: 'Travel Mug',
  description: '',
  priceCents: 1500,
  stock: 3,
  imageUrl: null,
  isActive: true,
  category: { slug: 'home-kitchen', name: 'Home & Kitchen' },
};

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('shows the brand and the cart count', async () => {
    TestBed.inject(CartService).add(product, 2);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne('/api/assistant/status').flush({ enabled: false });
    await fixture.whenStable();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Haven');
    expect(text).toContain('Cart');
    expect(text).toContain('2');
  });
});

describe('CartService', () => {
  let cart: CartService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    cart = TestBed.inject(CartService);
  });

  it('never lets a line exceed available stock', () => {
    cart.add(product, 2);
    cart.add(product, 5);
    expect(cart.quantityOf(product.id)).toBe(3);
    expect(cart.subtotalCents()).toBe(4500);
  });

  it('shrinks or drops lines after a checkout stock rejection', () => {
    cart.add(product, 3);
    cart.add({ ...product, id: 2, slug: 'other' }, 1);
    cart.applyStockProblems([
      { productId: 1, message: 'Only 1 left', available: 1 },
      { productId: 2, message: 'No longer available' },
    ]);
    expect(cart.lines().map((l) => [l.productId, l.quantity])).toEqual([[1, 1]]);
  });
});
