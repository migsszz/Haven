import { Component, computed, input } from '@angular/core';

// Placeholder tiles for products without a photo, one gradient per category.
const GRADIENTS: Record<string, string> = {
  electronics: 'from-indigo-500 to-sky-400',
  'home-kitchen': 'from-amber-500 to-orange-400',
  fashion: 'from-fuchsia-500 to-pink-400',
  'sports-outdoors': 'from-emerald-500 to-teal-400',
  'books-stationery': 'from-slate-600 to-slate-400',
  'toys-games': 'from-rose-500 to-amber-400',
};

@Component({
  selector: 'app-product-image',
  template: `
    @if (src()) {
      <img [src]="src()" [alt]="name()" class="h-full w-full object-cover" loading="lazy" />
    } @else {
      <div
        class="flex h-full w-full items-center justify-center bg-linear-to-br text-white/90"
        [class]="gradient()"
        role="img"
        [attr.aria-label]="name()"
      >
        <span class="font-semibold tracking-wide" [class]="large() ? 'text-5xl' : 'text-2xl'">{{ initials() }}</span>
      </div>
    }
  `,
  host: { class: 'block overflow-hidden' },
})
export class ProductImage {
  readonly name = input.required<string>();
  readonly category = input<string>('');
  readonly src = input<string | null>(null);
  readonly large = input(false);

  protected readonly gradient = computed(() => GRADIENTS[this.category()] ?? 'from-slate-500 to-slate-400');
  protected readonly initials = computed(() =>
    this.name()
      .split(/\s+/)
      .filter((w) => /^[A-Za-z]/.test(w))
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join(''),
  );
}
