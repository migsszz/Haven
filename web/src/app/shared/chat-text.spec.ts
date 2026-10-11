import { TestBed } from '@angular/core/testing';

import { ChatText, parseChatText, parseInline } from './chat-text';

describe('parseInline', () => {
  it('finds bold and italic spans and leaves the rest alone', () => {
    expect(parseInline('Try the **Power Bank** for *travel* today')).toEqual([
      { text: 'Try the ' },
      { text: 'Power Bank', bold: true },
      { text: ' for ' },
      { text: 'travel', italic: true },
      { text: ' today' },
    ]);
  });

  it('does not treat stray asterisks as formatting', () => {
    expect(parseInline('2 * 3 * 4 and ** nothing **')).toEqual([{ text: '2 * 3 * 4 and ** nothing **' }]);
    expect(parseInline('an unclosed **bold')).toEqual([{ text: 'an unclosed **bold' }]);
  });
});

describe('parseChatText', () => {
  const reply = [
    'Here are a few options:',
    '',
    '- **Portable Power Bank 20,000mAh** — $39; 45W USB-C fast charging.',
    '- **Pour-Over Coffee Set** — $34; carafe and filters.',
    '',
    'Want me to add one?',
  ].join('\n');

  it('turns a bulleted reply with bold names into a paragraph, a list, and a paragraph', () => {
    const blocks = parseChatText(reply);
    expect(blocks.map((b) => b.type)).toEqual(['p', 'ul', 'p']);
    const list = blocks[1] as { items: { text: string; bold?: boolean }[][] };
    expect(list.items).toHaveLength(2);
    expect(list.items[0][0]).toEqual({ text: 'Portable Power Bank 20,000mAh', bold: true });
    expect(list.items[0][1].text).toContain('$39');
  });

  it('handles numbered lists, * bullets, and headings', () => {
    expect(parseChatText('1. First\n2. Second').map((b) => b.type)).toEqual(['ol']);
    expect(parseChatText('* a\n* b')).toEqual([{ type: 'ul', items: [[{ text: 'a' }], [{ text: 'b' }]] }]);
    expect(parseChatText('### Picks')).toEqual([{ type: 'p', spans: [{ text: 'Picks', bold: true }] }]);
  });

  it('keeps single line breaks inside a paragraph', () => {
    expect(parseChatText('one\ntwo')).toEqual([{ type: 'p', spans: [{ text: 'one\ntwo' }] }]);
  });
});

describe('ChatText', () => {
  function render(text: string): HTMLElement {
    const fixture = TestBed.createComponent(ChatText);
    fixture.componentRef.setInput('text', text);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders bold as <strong> and lists as <li>, with no asterisks left over', () => {
    const el = render('- **Wooden Puzzle Box** — $30\n- **Dotted Notebook** — $18');
    expect([...el.querySelectorAll('strong')].map((s) => s.textContent)).toEqual(['Wooden Puzzle Box', 'Dotted Notebook']);
    expect(el.querySelectorAll('li')).toHaveLength(2);
    expect(el.textContent).not.toContain('*');
  });

  it('never turns text into markup', () => {
    const el = render('**<img src=x onerror=alert(1)>** and <script>alert(1)</script>');
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('script')).toBeNull();
    expect(el.textContent).toContain('<script>alert(1)</script>');
  });

  it('adds no stray spaces around bold text', () => {
    const el = render('options under **$40**: take your pick');
    expect(el.textContent?.trim()).toBe('options under $40: take your pick');
  });
});
