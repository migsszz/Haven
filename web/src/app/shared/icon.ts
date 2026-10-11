import { Component, input } from '@angular/core';

export type IconName = 'search' | 'menu' | 'close' | 'sparkle' | 'bag' | 'plus' | 'minus' | 'arrow-left' | 'arrow-right' | 'check' | 'upload';

/** The handful of line icons the site uses, drawn inline so they follow the text colour and need no requests. */
@Component({
  selector: 'app-icon',
  template: `
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="size-5"
      aria-hidden="true"
    >
      @switch (name()) {
        @case ('search') { <circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /> }
        @case ('menu') { <path d="M4 7h16M4 12h16M4 17h16" /> }
        @case ('close') { <path d="M6 6l12 12M18 6 6 18" /> }
        @case ('sparkle') { <path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.5l-1.9-5.7L4.5 10.9 10.1 9z" /><path d="M18.5 3v3M17 4.5h3" /> }
        @case ('bag') { <path d="M5.5 8h13l-1 11.5h-11z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /> }
        @case ('plus') { <path d="M12 5v14M5 12h14" /> }
        @case ('minus') { <path d="M5 12h14" /> }
        @case ('arrow-left') { <path d="M19 12H5m6-6-6 6 6 6" /> }
        @case ('arrow-right') { <path d="M5 12h14m-6-6 6 6-6 6" /> }
        @case ('check') { <path d="m5 12.5 4.5 4.5L19 7.5" /> }
        @case ('upload') { <path d="M12 16V5m-4.5 4.5L12 5l4.5 4.5M5 19h14" /> }
      }
    </svg>
  `,
  host: { class: 'inline-flex' },
})
export class Icon {
  readonly name = input.required<IconName>();
}
