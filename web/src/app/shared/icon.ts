import { Component, input } from '@angular/core';

export type IconName = 'search' | 'menu' | 'close' | 'sparkle' | 'bag' | 'plus' | 'minus' | 'arrow-left' | 'arrow-right' | 'check' | 'upload' | 'sun' | 'moon' | 'monitor' | 'palette';

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
        @case ('sun') { <circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /> }
        @case ('moon') { <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" /> }
        @case ('monitor') { <rect x="3.5" y="5" width="17" height="11" rx="1.5" /><path d="M9 20h6M12 16v4" /> }
        @case ('palette') { <path d="M12 4a8 8 0 1 0 0 16c1.1 0 1.8-.9 1.4-1.9-.4-1 .3-2.1 1.4-2.1H16a4 4 0 0 0 4-4c0-4.4-3.6-8-8-8z" /><circle cx="8" cy="11" r=".9" /><circle cx="12" cy="8" r=".9" /><circle cx="16" cy="11" r=".9" /> }
        @case ('upload') { <path d="M12 16V5m-4.5 4.5L12 5l4.5 4.5M5 19h14" /> }
      }
    </svg>
  `,
  host: { class: 'inline-flex' },
})
export class Icon {
  readonly name = input.required<IconName>();
}
