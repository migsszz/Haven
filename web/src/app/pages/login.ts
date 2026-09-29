import { booleanAttribute, Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { apiErrorMessage } from '../core/api.service';
import { AuthService } from '../core/auth.service';

/** Only follow same-site paths, so ?returnUrl= can't redirect somewhere else. */
export function safeReturnUrl(url: string | undefined): string {
  return url && url.startsWith('/') && !url.startsWith('//') ? url : '/';
}

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="mx-auto max-w-sm rounded-box bg-base-100 p-6 shadow-sm">
      <h1 class="text-2xl font-bold">Sign in</h1>
      @if (expired()) {
        <div role="status" class="alert alert-warning mt-3 text-sm">Your session expired. Please sign in again.</div>
      }

      <form [formGroup]="form" (ngSubmit)="submit()" class="mt-4" novalidate>
        <fieldset class="fieldset">
          <label class="label" for="email">Email</label>
          <input id="email" type="email" class="input w-full" formControlName="email" autocomplete="email" />
          <label class="label mt-2" for="password">Password</label>
          <input
            id="password"
            type="password"
            class="input w-full"
            formControlName="password"
            autocomplete="current-password"
          />
        </fieldset>

        @if (error()) {
          <div role="alert" class="alert alert-error mt-3 text-sm">{{ error() }}</div>
        }

        <button class="btn btn-primary mt-4 w-full" [disabled]="submitting()">
          @if (submitting()) {
            <span class="loading loading-spinner loading-sm"></span>
          }
          Sign in
        </button>
      </form>

      <p class="mt-4 text-center text-sm">
        New here?
        <a routerLink="/register" [queryParams]="{ returnUrl: returnUrl() }" class="link link-primary">Create an account</a>
      </p>
    </div>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly returnUrl = input<string>();
  readonly expired = input(false, { transform: booleanAttribute });

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.error.set('Enter your email and password.');
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    try {
      const { email, password } = this.form.getRawValue();
      await this.auth.login(email, password);
      this.router.navigateByUrl(safeReturnUrl(this.returnUrl()));
    } catch (err) {
      this.error.set(apiErrorMessage(err));
    } finally {
      this.submitting.set(false);
    }
  }
}
