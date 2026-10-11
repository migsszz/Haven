import { Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { apiErrorMessage } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { safeReturnUrl } from './login';

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="mx-auto max-w-sm py-6 sm:py-12">
      <p class="eyebrow">Join Haven</p>
      <h1 class="mt-3 text-4xl">Create an account</h1>

      <form [formGroup]="form" (ngSubmit)="submit()" class="mt-8" novalidate>
        <fieldset class="fieldset">
          <label class="label" for="name">Name</label>
          <input id="name" class="input w-full" formControlName="name" autocomplete="name" />
          <label class="label mt-2" for="email">Email</label>
          <input id="email" type="email" class="input w-full" formControlName="email" autocomplete="email" />
          <label class="label mt-2" for="password">Password</label>
          <input
            id="password"
            type="password"
            class="input w-full"
            formControlName="password"
            autocomplete="new-password"
          />
          <p class="label">At least 8 characters.</p>
        </fieldset>

        @if (error()) {
          <div role="alert" class="alert alert-error alert-soft mt-4 text-sm">{{ error() }}</div>
        }

        <button class="btn btn-primary mt-6 w-full" [disabled]="submitting()">
          @if (submitting()) {
            <span class="loading loading-spinner loading-sm"></span>
          }
          Create account
        </button>
      </form>

      <p class="mt-8 border-t border-base-300 pt-6 text-center text-sm text-muted">
        Already have an account?
        <a routerLink="/login" [queryParams]="{ returnUrl: returnUrl() }" class="link-quiet font-medium text-base-content underline">Sign in</a>
      </p>
    </div>
  `,
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly returnUrl = input<string>();

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128)]],
  });
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async submit(): Promise<void> {
    const { name, email, password } = this.form.controls;
    if (this.form.invalid) {
      this.error.set(
        name.invalid
          ? 'Enter your name.'
          : email.invalid
            ? 'Enter a valid email address.'
            : 'Use a password of at least 8 characters.',
      );
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    try {
      await this.auth.register(name.value.trim(), email.value, password.value);
      this.router.navigateByUrl(safeReturnUrl(this.returnUrl()));
    } catch (err) {
      this.error.set(apiErrorMessage(err));
    } finally {
      this.submitting.set(false);
    }
  }
}
