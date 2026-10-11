import { Component, inject, OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { apiError, ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { CartService } from '../core/cart.service';
import { MoneyPipe } from '../shared/money.pipe';
import { ProductImage } from '../shared/product-image';
import { Steps } from '../shared/steps';

@Component({
  selector: 'app-checkout',
  imports: [ReactiveFormsModule, RouterLink, MoneyPipe, ProductImage, Steps],
  template: `
    <app-steps [current]="2" />
    <h1 class="mt-8 text-4xl sm:text-5xl">Checkout</h1>

    @if (cart.isEmpty()) {
      <div class="py-20 text-center">
        <p class="font-display text-3xl">Your cart is empty.</p>
        <a routerLink="/" class="btn btn-primary mt-6">Start shopping</a>
      </div>
    } @else {
      <div class="mt-8 grid gap-12 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <form [formGroup]="form" (ngSubmit)="placeOrder()" class="max-w-xl" novalidate>
          <p class="eyebrow border-t border-base-300 pt-6">Shipping</p>
          <fieldset class="fieldset mt-4">
            <label class="label" for="shippingName">Full name</label>
            <input id="shippingName" class="input w-full" formControlName="shippingName" autocomplete="name" />
            @if (form.controls.shippingName.touched && form.controls.shippingName.invalid) {
              <p class="text-sm text-error">Enter the recipient's name.</p>
            }

            <label class="label mt-3" for="shippingAddress">Address</label>
            <textarea
              id="shippingAddress"
              class="textarea w-full"
              rows="3"
              formControlName="shippingAddress"
              autocomplete="street-address"
            ></textarea>
            @if (form.controls.shippingAddress.touched && form.controls.shippingAddress.invalid) {
              <p class="text-sm text-error">Enter a full delivery address.</p>
            }
          </fieldset>

          <p class="eyebrow mt-10 border-t border-base-300 pt-6">Payment</p>
          <p class="mt-4 border border-base-300 p-4 text-sm text-muted">
            This is a demo store, so payment is simulated. No card details are collected.
          </p>

          @if (error()) {
            <div role="alert" class="alert alert-error alert-soft mt-6">
              <div>
                <p>{{ error() }}</p>
                @for (problem of problems(); track problem.productId) {
                  <p class="text-sm">{{ problem.message }}</p>
                }
                @if (problems().length) {
                  <p class="mt-1 text-sm">We've updated your cart. Review it and place the order again.</p>
                }
              </div>
            </div>
          }

          <button class="btn btn-primary mt-8 w-full" [disabled]="submitting()">
            @if (submitting()) {
              <span class="loading loading-spinner loading-sm"></span>
            }
            Place order &middot; {{ cart.subtotalCents() | money }}
          </button>
        </form>

        <aside class="h-fit border-t border-base-300 pt-6 lg:sticky lg:top-24">
          <p class="eyebrow">Order summary</p>
          <ul class="mt-5 space-y-4">
            @for (line of cart.lines(); track line.productId) {
              <li class="flex items-center gap-4 text-sm">
                <span class="relative w-14 shrink-0">
                  <app-product-image class="aspect-[4/5] rounded-sm" [name]="line.name" [category]="line.categorySlug" [src]="line.imageUrl" />
                  <span class="tabular absolute -top-2 -right-2 grid size-5 place-items-center rounded-full bg-primary text-xs text-primary-content">
                    {{ line.quantity }}
                  </span>
                </span>
                <span class="min-w-0 flex-1">{{ line.name }}</span>
                <span class="tabular">{{ line.priceCents * line.quantity | money }}</span>
              </li>
            }
          </ul>
          <dl class="mt-6 space-y-3 border-t border-base-300 pt-5 text-sm">
            <div class="flex justify-between"><dt>Subtotal</dt><dd class="tabular">{{ cart.subtotalCents() | money }}</dd></div>
            <div class="flex justify-between"><dt>Shipping</dt><dd>Free</dd></div>
          </dl>
          <div class="mt-5 flex items-baseline justify-between border-t border-base-300 pt-5">
            <span>Total</span>
            <span class="tabular font-display text-3xl">{{ cart.subtotalCents() | money }}</span>
          </div>
        </aside>
      </div>
    }
  `,
})
export class CheckoutPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly cart = inject(CartService);

  protected readonly form = inject(NonNullableFormBuilder).group({
    shippingName: ['', [Validators.required, Validators.maxLength(120)]],
    shippingAddress: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(500)]],
  });
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly problems = signal<{ productId: number; message: string }[]>([]);

  ngOnInit(): void {
    this.form.patchValue({ shippingName: this.auth.user()?.name ?? '' });
  }

  protected async placeOrder(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    this.problems.set([]);
    try {
      const order = await this.api.placeOrder({
        ...this.form.getRawValue(),
        items: this.cart.lines().map((l) => ({ productId: l.productId, quantity: l.quantity })),
      });
      this.cart.clear();
      this.router.navigate(['/orders', order.id], { queryParams: { placed: 1 } });
    } catch (err) {
      const body = apiError(err);
      this.error.set(body.error);
      if (body.problems) {
        this.problems.set(body.problems);
        this.cart.applyStockProblems(body.problems);
      }
    } finally {
      this.submitting.set(false);
    }
  }
}
