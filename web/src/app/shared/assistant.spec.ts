import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { CartService } from '../core/cart.service';
import { AssistantReply, Product } from '../core/models';
import { Assistant } from './assistant';

const mug: Product = {
  id: 7,
  slug: 'travel-mug',
  name: 'Travel Mug',
  description: '',
  priceCents: 1500,
  stock: 10,
  imageUrl: null,
  isActive: true,
  category: { slug: 'home-kitchen', name: 'Home & Kitchen' },
};

describe('Assistant', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  async function ask(message: string, reply: AssistantReply) {
    const fixture = TestBed.createComponent(Assistant);
    fixture.detectChanges();
    http.expectOne('/api/assistant/status').flush({ enabled: true });
    const sending = (fixture.componentInstance as unknown as { send(m: string): Promise<void> }).send(message);
    const req = http.expectOne('/api/assistant/chat');
    req.flush(reply);
    await sending;
    return req.request;
  }

  it("sends the shopper's cart along with the message", async () => {
    TestBed.inject(CartService).add(mug, 3);
    const request = await ask("what's in my cart?", { reply: 'Three mugs.', products: [], actions: [] });
    expect(request.body).toEqual({
      message: "what's in my cart?",
      history: [],
      cart: [{ productId: 7, quantity: 3 }],
    });
  });

  it('applies cart changes the assistant makes', async () => {
    const cart = TestBed.inject(CartService);
    cart.add(mug, 3);
    await ask('make it one', {
      reply: 'Done.',
      products: [],
      actions: [{ type: 'set_cart_quantity', productId: 7, name: 'Travel Mug', quantity: 1 }],
    });
    expect(cart.quantityOf(7)).toBe(1);

    await ask('remove it', {
      reply: 'Removed.',
      products: [],
      actions: [{ type: 'set_cart_quantity', productId: 7, name: 'Travel Mug', quantity: 0 }],
    });
    expect(cart.isEmpty()).toBe(true);
  });

  it('adds products the assistant adds', async () => {
    const cart = TestBed.inject(CartService);
    await ask('add a mug', { reply: 'Added.', products: [], actions: [{ type: 'add_to_cart', product: mug, quantity: 2 }] });
    expect(cart.quantityOf(7)).toBe(2);
  });
});
