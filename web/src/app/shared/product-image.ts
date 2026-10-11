import { Component, computed, input } from '@angular/core';

// Placeholder tiles take their colour from --tone-<category> in the stylesheet, so each design can restyle them.
const KNOWN = new Set(['electronics', 'home-kitchen', 'fashion', 'sports-outdoors', 'books-stationery', 'toys-games']);

@Component({
  selector: 'app-product-image',
  template: `
    @if (src()) {
      <img [src]="src()" [alt]="name()" class="h-full w-full object-cover" loading="lazy" />
    } @else {
      <div
        class="flex h-full w-full items-center justify-center text-base-content/55"
        [style.background]="background()"
        role="img"
        [attr.aria-label]="name()"
      >
        <span class="font-display font-light tracking-wide" [class]="large() ? 'text-6xl' : 'text-3xl'">{{ initials() }}</span>
      </div>
    }
  `,
  host: { class: 'block overflow-hidden bg-base-200' },
})
export class ProductImage {
  readonly name = input.required<string>();
  readonly category = input<string>('');
  readonly src = input<string | null>(null);
  readonly large = input(false);

  // Mixed into the page colour, so the tint also works in the dark themes.
  protected readonly background = computed(
    () =>
      `color-mix(in oklab, var(--tone-${KNOWN.has(this.category()) ? this.category() : 'default'}) var(--haven-tone-mix, 55%), var(--color-base-200))`,
  );
  protected readonly initials = computed(() =>
    this.name()
      .split(/\s+/)
      .filter((w) => /^[A-Za-z]/.test(w))
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join(''),
  );
}
