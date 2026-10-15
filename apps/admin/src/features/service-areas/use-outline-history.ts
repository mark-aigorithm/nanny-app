import { useCallback, useState } from 'react';

import type { Polygon, ServiceAreaSource } from '@nanny-app/shared';

/** The outline being edited and where it came from (saved with it). */
export type Outline = { polygon: Polygon | null; source: ServiceAreaSource };

/** Steps Undo can go back; older ones are dropped. */
const MAX_STEPS = 100;

type History = { past: Outline[]; present: Outline; future: Outline[] };

/**
 * Undo/redo over the area editor's outline. Every change — a corner dragged,
 * added or removed on the map, Find, Draw by hand, Fewer corners — goes
 * through `set`, so Undo takes back whichever came last.
 */
export function useOutlineHistory(initial: Outline) {
  const [history, setHistory] = useState<History>({ past: [], present: initial, future: [] });

  const set = useCallback((next: Outline) => {
    setHistory((h) =>
      next.polygon === h.present.polygon && next.source === h.present.source
        ? h
        : { past: [...h.past, h.present].slice(-MAX_STEPS), present: next, future: [] },
    );
  }, []);

  const undo = useCallback(() => {
    setHistory((h) => {
      const previous = h.past[h.past.length - 1];
      if (!previous) return h;
      return { past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future] };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((h) => {
      const [next, ...rest] = h.future;
      if (!next) return h;
      return { past: [...h.past, h.present], present: next, future: rest };
    });
  }, []);

  return {
    outline: history.present,
    set,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
