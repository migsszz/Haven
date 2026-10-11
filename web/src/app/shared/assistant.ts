import { HttpClient } from '@angular/common/http';
import { afterRenderEffect, Component, effect, ElementRef, inject, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiService, apiErrorMessage } from '../core/api.service';
import { AssistantService } from '../core/assistant.service';
import { AuthService } from '../core/auth.service';
import { CartService } from '../core/cart.service';
import { AssistantAction, AssistantReply, Product } from '../core/models';
import { ChatText } from './chat-text';
import { Icon } from './icon';
import { MoneyPipe } from './money.pipe';
import { ProductImage } from './product-image';

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
  imports: [FormsModule, RouterLink, MoneyPipe, ProductImage, ChatText, Icon],
  template: `
    @if (assistant.enabled() && assistant.open()) {
      <section
        class="fixed inset-x-0 bottom-0 z-40 flex h-[85dvh] flex-col border border-base-300 bg-base-100 shadow-2xl sm:inset-x-auto sm:right-6 sm:bottom-6 sm:h-[36rem] sm:w-[24rem] sm:rounded-box"
        aria-label="Shopping assistant"
      >
        <header class="flex items-start gap-3 border-b border-base-300 px-5 py-4">
          <div class="mr-auto">
            <h2 class="font-display text-xl leading-none">Ask Haven</h2>
            <p class="mt-1.5 text-xs text-muted">Finds products, fills your cart, checks orders.</p>
          </div>
          <button class="btn btn-ghost btn-sm btn-square -mt-1 -mr-2" (click)="assistant.close()" aria-label="Close assistant">
            <app-icon name="close" />
          </button>
        </header>

        <div #scroller class="flex-1 space-y-4 overflow-y-auto px-5 py-4" aria-live="polite">
          @for (m of messages(); track $index) {
            <div class="flex" [class.justify-end]="m.role === 'user'">
              <div
                class="max-w-[88%] rounded-box px-3.5 py-2.5 text-sm leading-relaxed"
                [class.bg-primary]="m.role === 'user'"
                [class.text-primary-content]="m.role === 'user'"
                [class.bg-base-200]="m.role === 'assistant'"
              >
                @if (m.role === 'assistant') {
                  <app-chat-text [text]="m.text" />
                } @else {
                  <span class="whitespace-pre-line">{{ m.text }}</span>
                }
              </div>
            </div>

            @for (p of m.products ?? []; track p.id) {
              <div class="flex items-center gap-3 border-t border-base-300 pt-3 text-sm">
                <app-product-image class="size-12 shrink-0 rounded-sm" [name]="p.name" [category]="p.category.slug" [src]="p.imageUrl" />
                <div class="min-w-0 flex-1">
                  <a [routerLink]="['/products', p.slug]" class="block truncate font-medium link-quiet" (click)="assistant.close()">{{ p.name }}</a>
                  <span class="tabular text-muted">{{ p.priceCents | money }}</span>
                </div>
                <button
                  class="btn btn-outline btn-sm"
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
                  <p class="flex items-center gap-2 text-xs text-success">
                    <app-icon name="check" /> Added {{ a.quantity }} &times; {{ a.product.name }} to your cart
                    <a routerLink="/cart" class="ml-auto underline underline-offset-2" (click)="assistant.close()">View cart</a>
                  </p>
                }
                @case ('set_cart_quantity') {
                  <p class="flex items-center gap-2 text-xs text-success">
                    <app-icon name="check" />
                    {{ a.quantity === 0 ? 'Removed ' + a.name + ' from your cart' : 'Now ' + a.quantity + ' × ' + a.name + ' in your cart' }}
                    <a routerLink="/cart" class="ml-auto underline underline-offset-2" (click)="assistant.close()">View cart</a>
                  </p>
                }
                @case ('confirm_cancel_order') {
                  <div class="flex items-center gap-3 border border-error/40 px-3 py-2 text-sm">
                    <span class="flex-1">Cancel order #{{ a.orderId }}?</span>
                    <button class="btn btn-error btn-sm" [disabled]="cancelled().has(a.orderId)" (click)="confirmCancel(a.orderId)">
                      {{ cancelled().has(a.orderId) ? 'Cancelled' : 'Confirm cancel' }}
                    </button>
                  </div>
                }
              }
            }
          }

          @if (sending()) {
            <div class="flex">
              <div class="rounded-box bg-base-200 px-3.5 py-2.5"><span class="loading loading-dots loading-sm"></span></div>
            </div>
          }

          @if (messages().length === 1) {
            <div class="flex flex-wrap gap-2 pt-1">
              @for (s of suggestions; track s) {
                <button class="rounded-full border border-base-300 px-3 py-1.5 text-xs hover:border-base-content" (click)="send(s)">
                  {{ s }}
                </button>
              }
            </div>
          }
        </div>

        <form class="flex gap-2 border-t border-base-300 p-3" (ngSubmit)="send(draft())">
          <label class="sr-only" for="assistant-input">Message the assistant</label>
          <input
            id="assistant-input"
            class="input flex-1"
            placeholder="Ask about products or orders"
            maxlength="1000"
            autocomplete="off"
            name="draft"
            [ngModel]="draft()"
            (ngModelChange)="draft.set($event)"
          />
          <button class="btn btn-primary" [disabled]="sending() || !draft().trim()">Send</button>
        </form>
      </section>
    }
  `,
})
export class Assistant {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  protected readonly cart = inject(CartService);

  protected readonly assistant = inject(AssistantService);
  protected readonly suggestions = SUGGESTIONS;
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

    // A question asked from elsewhere on the site (e.g. "Ask Haven about this" on a product page).
    effect(() => {
      const question = this.assistant.pendingQuestion();
      if (question && this.assistant.enabled() && !this.sending()) {
        untracked(() => {
          this.assistant.pendingQuestion.set(null);
          void this.send(question);
        });
      }
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
