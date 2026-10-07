import { HttpClient, httpResource } from '@angular/common/http';
import { afterRenderEffect, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiService, apiErrorMessage } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { CartService } from '../core/cart.service';
import { AssistantAction, AssistantReply, Product } from '../core/models';
import { MoneyPipe } from './money.pipe';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  products?: Product[];
  actions?: AssistantAction[];
  /** Local notes (greeting, errors, confirmations) that aren't sent back as history. */
  local?: boolean;
}

const HISTORY_LIMIT = 20;
const SUGGESTIONS = ['Gift ideas under $40', "What's in my cart?", "Where's my latest order?"];

@Component({
  selector: 'app-assistant',
  imports: [FormsModule, RouterLink, MoneyPipe],
  template: `
    @if (status.value()?.enabled) {
      @if (open()) {
        <section
          class="fixed inset-x-0 bottom-0 z-40 flex h-[85vh] flex-col border border-base-300 bg-base-100 shadow-2xl sm:inset-x-auto sm:bottom-4 sm:right-4 sm:h-[34rem] sm:w-96 sm:rounded-box"
          aria-label="Shopping assistant"
        >
          <header class="flex items-center gap-2 border-b border-base-300 px-4 py-3">
            <span class="grid size-7 place-items-center rounded-full bg-primary text-xs font-bold text-primary-content">AI</span>
            <div class="mr-auto">
              <h2 class="text-sm font-semibold">Haven assistant</h2>
              <p class="text-xs text-base-content/60">Finds products, fills your cart, checks orders</p>
            </div>
            <button class="btn btn-ghost btn-sm btn-square" (click)="open.set(false)" aria-label="Close assistant">✕</button>
          </header>

          <div #scroller class="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
            @for (m of messages(); track $index) {
              <div class="chat" [class.chat-end]="m.role === 'user'" [class.chat-start]="m.role === 'assistant'">
                <div
                  class="chat-bubble whitespace-pre-line text-sm"
                  [class.chat-bubble-primary]="m.role === 'user'"
                >{{ m.text }}</div>
              </div>

              @for (p of m.products ?? []; track p.id) {
                <div class="ml-2 flex items-center gap-2 rounded-lg border border-base-300 p-2 text-sm">
                  <a [routerLink]="['/products', p.slug]" class="min-w-0 flex-1 truncate hover:underline">{{ p.name }}</a>
                  <span class="font-semibold">{{ p.priceCents | money }}</span>
                  <button
                    class="btn btn-primary btn-xs"
                    [disabled]="p.stock === 0 || cart.quantityOf(p.id) >= cart.maxFor(p.stock)"
                    (click)="cart.add(p)"
                  >
                    {{ p.stock === 0 ? 'Sold out' : 'Add' }}
                  </button>
                </div>
              }

              @for (a of m.actions ?? []; track $index) {
                @switch (a.type) {
                  @case ('add_to_cart') {
                    <div class="ml-2 flex items-center gap-2 rounded-lg bg-success/10 p-2 text-sm">
                      <span class="flex-1">Added {{ a.quantity }} &times; {{ a.product.name }} to your cart</span>
                      <a routerLink="/cart" class="btn btn-ghost btn-xs">View cart</a>
                    </div>
                  }
                  @case ('set_cart_quantity') {
                    <div class="ml-2 flex items-center gap-2 rounded-lg bg-success/10 p-2 text-sm">
                      <span class="flex-1">
                        {{ a.quantity === 0 ? 'Removed ' + a.name + ' from your cart' : 'Now ' + a.quantity + ' × ' + a.name + ' in your cart' }}
                      </span>
                      <a routerLink="/cart" class="btn btn-ghost btn-xs">View cart</a>
                    </div>
                  }
                  @case ('confirm_cancel_order') {
                    <div class="ml-2 flex items-center gap-2 rounded-lg bg-error/10 p-2 text-sm">
                      <span class="flex-1">Cancel order #{{ a.orderId }}?</span>
                      <button
                        class="btn btn-error btn-xs"
                        [disabled]="cancelled().has(a.orderId)"
                        (click)="confirmCancel(a.orderId)"
                      >
                        {{ cancelled().has(a.orderId) ? 'Cancelled' : 'Confirm cancel' }}
                      </button>
                    </div>
                  }
                }
              }
            }

            @if (sending()) {
              <div class="chat chat-start">
                <div class="chat-bubble"><span class="loading loading-dots loading-sm"></span></div>
              </div>
            }

            @if (messages().length === 1) {
              <div class="flex flex-wrap gap-2 pt-1">
                @for (s of suggestions; track s) {
                  <button class="btn btn-outline btn-xs" (click)="send(s)">{{ s }}</button>
                }
              </div>
            }
          </div>

          <form class="flex gap-2 border-t border-base-300 p-3" (ngSubmit)="send(draft())">
            <label class="sr-only" for="assistant-input">Message the assistant</label>
            <input
              id="assistant-input"
              class="input input-sm flex-1"
              placeholder="Ask about products or orders"
              maxlength="1000"
              autocomplete="off"
              name="draft"
              [ngModel]="draft()"
              (ngModelChange)="draft.set($event)"
            />
            <button class="btn btn-primary btn-sm" [disabled]="sending() || !draft().trim()">Send</button>
          </form>
        </section>
      } @else {
        <button
          class="btn btn-primary fixed bottom-4 right-4 z-40 shadow-lg"
          (click)="open.set(true)"
          aria-label="Open shopping assistant"
        >
          Ask Haven
        </button>
      }
    }
  `,
})
export class Assistant {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  protected readonly cart = inject(CartService);

  protected readonly status = httpResource<{ enabled: boolean }>(() => '/api/assistant/status');
  protected readonly suggestions = SUGGESTIONS;
  protected readonly open = signal(false);
  protected readonly sending = signal(false);
  protected readonly draft = signal('');
  protected readonly cancelled = signal(new Set<number>());
  protected readonly messages = signal<ChatMessage[]>([
    {
      role: 'assistant',
      text: "Hi! I can help you find something, add it to your cart, or check on an order. What are you looking for?",
      local: true,
    },
  ]);

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  constructor() {
    // Keep the newest message in view.
    afterRenderEffect(() => {
      this.messages();
      this.sending();
      const el = this.scroller()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  protected async send(text: string): Promise<void> {
    const message = text.trim();
    if (!message || this.sending()) return;

    const history = this.messages()
      .filter((m) => !m.local)
      .slice(-HISTORY_LIMIT)
      .map((m) => ({ role: m.role, text: m.text }));
    this.messages.update((list) => [...list, { role: 'user', text: message }]);
    this.draft.set('');
    this.sending.set(true);

    try {
      // The cart lives in the browser, so the assistant only knows it because we send it.
      const cart = this.cart.lines().map((l) => ({ productId: l.productId, quantity: l.quantity }));
      const res = await firstValueFrom(
        this.http.post<AssistantReply>('/api/assistant/chat', { message, history, cart }),
      );
      for (const action of res.actions) {
        if (action.type === 'add_to_cart') this.cart.add(action.product, action.quantity);
        else if (action.type === 'set_cart_quantity') this.cart.setQuantity(action.productId, action.quantity);
      }
      this.messages.update((list) => [
        ...list,
        { role: 'assistant', text: res.reply, products: res.products, actions: res.actions },
      ]);
    } catch (err) {
      this.messages.update((list) => [...list, { role: 'assistant', text: apiErrorMessage(err), local: true }]);
    } finally {
      this.sending.set(false);
    }
  }

  protected async confirmCancel(orderId: number): Promise<void> {
    if (!this.auth.isSignedIn()) return;
    try {
      await this.api.cancelOrder(orderId);
      this.cancelled.update((s) => new Set(s).add(orderId));
      this.messages.update((list) => [
        ...list,
        { role: 'assistant', text: `Order #${orderId} is cancelled, and its items went back into stock.`, local: true },
      ]);
    } catch (err) {
      this.messages.update((list) => [...list, { role: 'assistant', text: apiErrorMessage(err), local: true }]);
    }
  }
}
