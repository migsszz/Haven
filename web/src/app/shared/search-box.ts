import { Component, inject, input, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { Icon } from './icon';

/** Header search. Submitting shows results in the catalog, with the current query kept in the box. */
@Component({
  selector: 'app-search-box',
  imports: [Icon],
  template: `
    <form role="search" class="w-full" (submit)="submit($event)">
      <label class="input flex w-full items-center gap-2" [class.input-sm]="compact()">
        <span class="text-muted"><app-icon name="search" /></span>
        <span class="sr-only">Search products</span>
        <input
          #field
          type="search"
          name="q"
          placeholder="Search products"
          autocomplete="off"
          class="grow"
          [value]="value()"
          (input)="value.set(field.value)"
        />
      </label>
    </form>
  `,
  host: { class: 'block' },
})
export class SearchBox {
  private readonly router = inject(Router);
  readonly compact = input(false);
  protected readonly value = signal(this.currentQuery());

  constructor() {
    // Keep the box in step with the address bar (back button, "clear search", shared links).
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.value.set(this.currentQuery()));
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const q = this.value().trim();
    this.router.navigate(['/'], { queryParams: { q: q || null, category: null, page: null }, queryParamsHandling: 'merge' });
  }

  private currentQuery(): string {
    return this.router.parseUrl(this.router.url).queryParams['q'] ?? '';
  }
}
