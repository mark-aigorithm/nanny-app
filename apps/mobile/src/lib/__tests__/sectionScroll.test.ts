import { sectionScrollTarget } from '../sectionScroll';

describe('sectionScrollTarget', () => {
  it('opens a section that fits from its top', () => {
    expect(sectionScrollTarget({ y: 900, height: 120 }, 400, 8)).toBe(892);
  });

  it('lines up the bottom of a section taller than the view, so its input shows', () => {
    // The instructions section on a small phone at 1.3x with the keyboard up:
    // title, two rows of chips and the box, in about 150dp of scroll.
    expect(sectionScrollTarget({ y: 900, height: 260 }, 150, 8)).toBe(1018);
  });

  it('never scrolls above the top of the content', () => {
    expect(sectionScrollTarget({ y: 4, height: 60 }, 400, 8)).toBe(0);
  });
});
