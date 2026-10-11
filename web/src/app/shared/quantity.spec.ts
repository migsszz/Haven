import { TestBed } from '@angular/core/testing';

import { Quantity } from './quantity';

describe('Quantity', () => {
  function setup(inputs: Record<string, unknown>) {
    const fixture = TestBed.createComponent(Quantity);
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    const emitted: number[] = [];
    fixture.componentInstance.changed.subscribe((n) => emitted.push(n));
    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll('button');
    return { fixture, emitted, minus: buttons[0], plus: buttons[1] };
  }

  it('reports the next number when either button is pressed', () => {
    const { emitted, minus, plus } = setup({ value: 3, min: 1, max: 5 });
    plus.click();
    minus.click();
    expect(emitted).toEqual([4, 2]);
  });

  it('cannot go below the minimum or above the maximum', () => {
    const atMin = setup({ value: 1, min: 1, max: 5 });
    expect(atMin.minus.disabled).toBe(true);
    const atMax = setup({ value: 5, min: 1, max: 5 });
    expect(atMax.plus.disabled).toBe(true);
  });

  it('can count down to zero when the minimum is zero (the cart removes the line)', () => {
    const { emitted, minus } = setup({ value: 1, min: 0, max: 5, decreaseLabel: 'Remove Mug' });
    expect(minus.getAttribute('aria-label')).toBe('Remove Mug');
    minus.click();
    expect(emitted).toEqual([0]);
  });
});
