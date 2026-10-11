import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input } from '@angular/core';

export interface Span {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

export type Block = { type: 'p'; spans: Span[] } | { type: 'ul' | 'ol'; items: Span[][] };

// **bold** or *italic*. The markers must touch their text, so a lone "*" (as in "2 * 3") is left alone.
const INLINE = /(\*\*[^*\s](?:[^*\n]*[^*\s])?\*\*|\*[^*\s](?:[^*\n]*[^*\s])?\*)/;
const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;

export function parseInline(text: string): Span[] {
  return text
    .split(INLINE)
    .filter((part) => part !== '')
    .map((part) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return { text: part.slice(2, -2), bold: true };
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return { text: part.slice(1, -1), italic: true };
      return { text: part };
    });
}

/**
 * The few Markdown shapes models habitually produce (bold, italics, bullet and numbered lists,
 * headings), turned into plain data. Anything else shows as the text it is. Nothing here ever
 * becomes HTML: the component below renders spans as text nodes, so the model, or a product
 * description it quotes, can't inject markup.
 */
export function parseChatText(text: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { type: 'ul' | 'ol'; items: Span[][] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: 'p', spans: parseInline(paragraph.join('\n')) });
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push(list);
    list = null;
  };

  for (const line of text.split('\n')) {
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    const heading = bullet || numbered ? null : HEADING.exec(line);
    const item = bullet ?? numbered;

    if (item) {
      flushParagraph();
      const type = bullet ? 'ul' : 'ol';
      if (list && list.type !== type) flushList();
      list ??= { type, items: [] };
      list.items.push(parseInline(item[1]));
    } else if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'p', spans: parseInline(heading[1]).map((s) => ({ ...s, bold: true })) });
    } else if (line.trim() === '') {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}

@Component({
  selector: 'app-chat-text',
  imports: [NgTemplateOutlet],
  template: `
    @for (block of blocks(); track $index) {
      @switch (block.type) {
        @case ('p') {
          <p class="whitespace-pre-line">
            @for (s of block.spans; track $index) {
              <ng-container [ngTemplateOutlet]="span" [ngTemplateOutletContext]="{ $implicit: s }" />
            }
          </p>
        }
        @case ('ul') {
          <ul class="list-disc space-y-1 pl-5">
            @for (item of block.items; track $index) {
              <li>
                @for (s of item; track $index) {
                  <ng-container [ngTemplateOutlet]="span" [ngTemplateOutletContext]="{ $implicit: s }" />
                }
              </li>
            }
          </ul>
        }
        @case ('ol') {
          <ol class="list-decimal space-y-1 pl-5">
            @for (item of block.items; track $index) {
              <li>
                @for (s of item; track $index) {
                  <ng-container [ngTemplateOutlet]="span" [ngTemplateOutletContext]="{ $implicit: s }" />
                }
              </li>
            }
          </ol>
        }
      }
    }
    <ng-template #span let-s>
      @if (s.bold) {
        <strong>{{ s.text }}</strong>
      } @else if (s.italic) {
        <em>{{ s.text }}</em>
      } @else {
        <span>{{ s.text }}</span>
      }
    </ng-template>
  `,
  host: { class: 'block space-y-2' },
})
export class ChatText {
  readonly text = input.required<string>();
  protected readonly blocks = computed(() => parseChatText(this.text()));
}
