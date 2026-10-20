import { useEffect, useRef } from 'react';

/**
 * Keeps a sticky column no taller than the screen space below where it
 * currently starts, via `--fit-top` on the element. Before the page scrolls
 * the column starts under the page header, so a plain `100vh` cap would push
 * its bottom (the save actions) off-screen until the admin scrolls.
 */
export function useFitToViewport<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      el.style.setProperty('--fit-top', `${Math.max(el.getBoundingClientRect().top, 0)}px`);
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };
    update();
    // Capture: the scrolling element may be the content pane, not the window.
    document.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      document.removeEventListener('scroll', schedule, { capture: true });
      window.removeEventListener('resize', schedule);
      cancelAnimationFrame(frame);
    };
  }, []);
  return ref;
}
