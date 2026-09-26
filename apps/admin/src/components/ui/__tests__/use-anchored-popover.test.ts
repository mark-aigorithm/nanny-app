import { describe, expect, it } from 'vitest';

import { computePopoverPosition } from '../use-anchored-popover';

const viewport = { width: 1200, height: 800 };
const menu = { width: 200, height: 100 };

/** A 32px kebab button whose top edge sits at `top`, right edge at `right`. */
function trigger(top: number, right = 1100) {
  return { top, bottom: top + 32, left: right - 32, right, width: 32 };
}

describe('computePopoverPosition', () => {
  it('opens below and aligns to the trigger when there is room', () => {
    expect(computePopoverPosition(trigger(100), menu, viewport, 'bottom-end')).toEqual({
      top: 138,
      left: 900,
      maxHeight: null,
    });
  });

  it('flips above the trigger on a row near the bottom of the screen', () => {
    // The Packages table's last row: 40px of room below, 700 above.
    const position = computePopoverPosition(trigger(728), menu, viewport, 'bottom-end');
    expect(position.top).toBe(728 - 6 - 100);
    expect(position.top + menu.height).toBeLessThanOrEqual(viewport.height);
    expect(position.maxHeight).toBeNull();
  });

  it('stays inside the viewport horizontally on a narrow screen', () => {
    const phone = { width: 400, height: 800 };
    // A kebab near the left edge would push an end-aligned menu off-screen.
    const position = computePopoverPosition(trigger(100, 60), menu, phone, 'bottom-end');
    expect(position.left).toBe(8);
    // And one flush with the right edge is pulled back in.
    const right = computePopoverPosition(trigger(100, 400), menu, phone, 'bottom-start');
    expect(right.left + menu.width).toBeLessThanOrEqual(phone.width - 8);
  });

  it('caps the height to the roomier side when neither side fits', () => {
    const tall = { width: 200, height: 900 };
    const position = computePopoverPosition(trigger(500), tall, viewport, 'bottom-start');
    // 500 - 6 - 8 above beats 800 - 532 - 6 - 8 below.
    expect(position.maxHeight).toBe(486);
    expect(position.top).toBe(8);
  });

  it('honours a top placement when it fits', () => {
    const position = computePopoverPosition(trigger(700), menu, viewport, 'top-start');
    expect(position.top).toBe(594);
  });
});
