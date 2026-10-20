/** Where a section sits inside a ScrollView's content (from its `onLayout`). */
export interface SectionRect {
  y: number;
  height: number;
}

/**
 * The scroll offset that shows a section whose input has focus.
 *
 * The section opens from its top (its title in view) when it fits in the
 * visible part of the scroll. When it doesn't, which happens on a small phone
 * at large text once the keyboard and a sticky footer take their share, its
 * bottom is lined up with the bottom of the view instead: the input sits at
 * the bottom of the section, and the field being typed in matters more than
 * its title.
 */
export function sectionScrollTarget(
  section: SectionRect,
  viewportHeight: number,
  margin: number,
): number {
  const showTop = section.y - margin;
  const showBottom = section.y + section.height + margin - viewportHeight;
  return Math.max(0, showTop, showBottom);
}
