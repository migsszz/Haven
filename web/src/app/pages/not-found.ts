import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  template: `
    <div class="py-20 text-center">
      <p class="eyebrow">404</p>
      <h1 class="mt-3 text-5xl">Page not found.</h1>
      <p class="mt-3 text-muted">That page doesn't exist or has moved.</p>
      <a routerLink="/" class="btn btn-primary mt-8">Back to the store</a>
    </div>
  `,
})
export class NotFoundPage {}
