import { Component, inject, OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { apiError, ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { CartService } from '../core/cart.service';
import { MoneyPipe } from '../shared/money.pipe';

@Component({
  selector: 'app-checkout',
  imports: [ReactiveFormsModule, RouterLink, MoneyPipe],
  template: `
    <h1 class="mb-4 text-2xl font-bold">Checkout</h1>

    @if (cart.isEmpty()) {
      <div class="rounded-box bg-base-100 p-10 text-center">
        <p class="font-medium">Your cart is empty.</p>
        <a routerLink="/" class="btn btn-primary btn-sm mt-3">Start shopping</a>
      </div>
    } @else {
      <div class="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <form [formGroup]="form" (ngSubmit)="placeOrder()" class="rounded-box bg-base-100 p-5 shadow-sm" novalidate>
          <h2 class="mb-3 font-semibold">Shipping</h2>
          <fieldset class="fieldset">
            <label class="label" for="shippingName">Full name</label>
            <input id="shippingName" class="input w-full" formControlName="shippingName" autocomplete="name" />
            @if (form.controls.shippingName.touched && form.controls.shippingName.invalid) {
              <p class="text-error">Enter the recipient's name.</p>
            }

            <label class="label mt-2" for="shippingAddress">Address</label>
            <textarea
              id="shippingAddress"
              class="textarea w-full"
              rows="3"
              formControlName="shippingAddress"
              autocomplete="street-address"
            ></textarea>
            @if (form.controls.shippingAddress.touched && form.controls.shippingAddress.invalid) {
              <p class="text-error">Enter a full delivery address.</p>
            }
          </fieldset>

          <h2 class="mb-2 mt-5 font-semibold">Payment</h2>
          <div class="alert alert-info alert-soft text-sm">
            This is a demo store, so payment is simulated. No card details are collected.
          </div>

          @if (error()) {
            <div role="alert" class="alert alert-error mt-4">
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

          <button class="btn btn-primary mt-5 w-full" [disabled]="submitting()">
            @if (submitting()) {
              <span class="loading loading-spinner loading-sm"></span>
            }
            Place order &middot; {{ cart.subtotalCents() | money }}
          </button>
        </form>

        <aside class="h-fit rounded-box bg-base-100 p-5 shadow-sm">
          <h2 class="mb-3 font-semibold">Order summary</h2>
          <ul class="space-y-2 text-sm">
            @for (line of cart.lines(); track line.productId) {
              <li class="flex justify-between gap-2">
                <span class="truncate">{{ line.quantity }} &times; {{ line.name }}</span>
                <span>{{ line.priceCents * line.quantity | money }}</span>
              </li>
            }
          </ul>
          <div class="divider my-2"></div>
          <div class="flex justify-between font-semibold">
            <span>Total</span>
            <span>{{ cart.subtotalCents() | money }}</span>
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
