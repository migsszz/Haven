import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  template: `
    <div class="rounded-box bg-base-100 p-10 text-center">
      <h1 class="text-2xl font-bold">Page not found</h1>
      <p class="mt-1 text-base-content/70">That page doesn't exist or has moved.</p>
      <a routerLink="/" class="btn btn-primary btn-sm mt-4">Back to the store</a>
    </div>
  `,
})
export class NotFoundPage {}
