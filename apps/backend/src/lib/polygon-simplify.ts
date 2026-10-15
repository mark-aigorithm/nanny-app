import type { Position } from '@nanny-app/shared';

const METRES_PER_DEGREE = 111_320;

type XY = [number, number];

/** Distance from p to segment a–b, in the projected metres. */
function segmentDistance(p: XY, a: XY, b: XY): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSq));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function markKept(points: XY[], first: number, last: number, tolerance: number, keep: boolean[]): void {
  let farthest = -1;
  let maxDistance = 0;
  for (let i = first + 1; i < last; i++) {
    const d = segmentDistance(points[i] as XY, points[first] as XY, points[last] as XY);
    if (d > maxDistance) {
      maxDistance = d;
      farthest = i;
    }
  }
  if (farthest !== -1 && maxDistance > tolerance) {
    keep[farthest] = true;
    markKept(points, first, farthest, tolerance, keep);
    markKept(points, farthest, last, tolerance, keep);
  }
}

/**
 * Douglas–Peucker on a closed ring, so an OpenStreetMap border of hundreds of
 * points becomes one an admin can drag. Works in metres (longitude scaled by
 * the latitude's cosine). Doubles the tolerance until the ring fits
 * `maxPositions`; never returns fewer than a triangle — if simplifying would,
 * the input ring is returned unchanged.
 */
export function simplifyRing(ring: Position[], toleranceM = 25, maxPositions = 150): Position[] {
  if (ring.length <= 4) return ring;
  const cosLat = Math.cos((((ring[0] as Position)[1]) * Math.PI) / 180);
  const projected: XY[] = ring.map(([lng, lat]) => [lng * cosLat * METRES_PER_DEGREE, lat * METRES_PER_DEGREE]);

  let tolerance = toleranceM;
  for (;;) {
    const keep = ring.map((_, i) => i === 0 || i === ring.length - 1);
    // The ring starts and ends on the same point, so the first split finds the
    // point farthest from it and both halves simplify from there.
    markKept(projected, 0, ring.length - 1, tolerance, keep);
    const out = ring.filter((_, i) => keep[i]);
    if (out.length < 4) return ring;
    if (out.length <= maxPositions) return out;
    tolerance *= 2;
  }
}
