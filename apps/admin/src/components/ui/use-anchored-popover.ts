import { useLayoutEffect, type RefObject } from 'react';

export type PopoverPlacement = 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end';

/** How the popover's width relates to its trigger's. */
export type PopoverWidth = 'auto' | 'match' | 'min';

type Rect = { top: number; bottom: number; left: number; right: number; width: number };
type Size = { width: number; height: number };
type Viewport = { width: number; height: number };

export type PopoverPosition = { top: number; left: number; maxHeight: number | null };

/** Gap (px) between the trigger and its popover. */
const OFFSET = 6;
/** Closest (px) the popover may come to a viewport edge. */
const MARGIN = 8;

/**
 * Where to put a popover of `size` next to `trigger` so it stays on screen.
 *
 * Opens on the preferred side when it fits; otherwise on whichever side has
 * more room, capped to that room (the popover scrolls). Horizontally it is
 * aligned to the preferred edge, then nudged back inside the viewport.
 */
export function computePopoverPosition(
  trigger: Rect,
  size: Size,
  viewport: Viewport,
  placement: PopoverPlacement,
): PopoverPosition {
  const below = viewport.height - trigger.bottom - OFFSET - MARGIN;
  const above = trigger.top - OFFSET - MARGIN;
  const prefersBelow = placement.startsWith('bottom');
  const preferred = prefersBelow ? below : above;
  const opensBelow = size.height <= preferred ? prefersBelow : below >= above;
  const room = Math.max(opensBelow ? below : above, 0);
  const height = Math.min(size.height, room);

  const top = opensBelow ? trigger.bottom + OFFSET : trigger.top - OFFSET - height;
  const preferredLeft = placement.endsWith('end') ? trigger.right - size.width : trigger.left;
  const maxLeft = viewport.width - size.width - MARGIN;
  const left = Math.max(MARGIN, Math.min(preferredLeft, maxLeft));

  return { top, left, maxHeight: size.height > room ? room : null };
}

type Options = {
  open: boolean;
  triggerRef: RefObject<HTMLElement | null>;
  popoverRef: RefObject<HTMLElement | null>;
  placement: PopoverPlacement;
  width?: PopoverWidth;
};

/**
 * Keeps a portaled, `position: fixed` popover anchored to its trigger while
 * open — flipped above it when there's no room below and kept inside the
 * viewport — so neither an ancestor's `overflow` nor the window edge can hide
 * it. Styles are written straight to the node, before paint, on open, scroll
 * and resize.
 */
export function useAnchoredPopover({
  open,
  triggerRef,
  popoverRef,
  placement,
  width = 'auto',
}: Options): void {
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const trigger = triggerRef.current;
      const popover = popoverRef.current;
      if (!trigger || !popover) return;
      const rect = trigger.getBoundingClientRect();
      popover.style.width = width === 'match' ? `${rect.width}px` : '';
      popover.style.minWidth = width === 'min' ? `${rect.width}px` : '';
      // Measure at natural height (CSS max-height still applies), not at the
      // height a previous placement capped it to.
      popover.style.maxHeight = '';
      const position = computePopoverPosition(
        rect,
        { width: popover.offsetWidth, height: popover.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
        placement,
      );
      popover.style.top = `${position.top}px`;
      popover.style.left = `${position.left}px`;
      popover.style.maxHeight = position.maxHeight == null ? '' : `${position.maxHeight}px`;
    };
    const onScroll = (event: Event) => {
      // Scrolling the popover's own list doesn't move the trigger.
      if (event.target instanceof Node && popoverRef.current?.contains(event.target)) return;
      place();
    };
    place();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', place);
    };
  }, [open, triggerRef, popoverRef, placement, width]);
}
