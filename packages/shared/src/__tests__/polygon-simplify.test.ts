import { describe, expect, it } from 'vitest';

import { simplifyPolygon, simplifyRing } from '../polygon-simplify';
import type { Polygon, Position } from '../service-area';

/** A circle of `n` points, ~5 km radius around New Cairo, closed. */
function circle(n: number): Position[] {
  const ring: Position[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * 2 * Math.PI;
    ring.push([31.47 + 0.05 * Math.cos(t), 30.02 + 0.045 * Math.sin(t)]);
  }
  ring.push(ring[0] as Position);
  return ring;
}

describe('simplifyRing', () => {
  it('keeps the ring closed', () => {
    const out = simplifyRing(circle(400));
    expect(out[0]).toEqual(out[out.length - 1]);
  });
  it('drops collinear points on a straight edge', () => {
    const square: Position[] = [[31.4, 30], [31.45, 30], [31.5, 30], [31.5, 30.1], [31.4, 30.1], [31.4, 30]];
    expect(simplifyRing(square)).toEqual([[31.4, 30], [31.5, 30], [31.5, 30.1], [31.4, 30.1], [31.4, 30]]);
  });
  it('caps a dense ring at the maximum', () => {
    expect(simplifyRing(circle(2000), 1, 150).length).toBeLessThanOrEqual(150);
  });
  it('never collapses below a triangle', () => {
    expect(simplifyRing(circle(50), 100_000).length).toBeGreaterThanOrEqual(4);
  });
});

describe('simplifyPolygon', () => {
  const polygon = (ring: Position[]): Polygon => ({ type: 'Polygon', coordinates: [ring] });

  it('thins a dense outline to at most 30 corners, still closed', () => {
    const ring = simplifyPolygon(polygon(circle(150))).coordinates[0]!;
    expect(ring.length - 1).toBeLessThanOrEqual(30);
    expect(ring.length - 1).toBeGreaterThanOrEqual(3);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });
  it('returns a small outline unchanged', () => {
    const small = polygon(circle(12));
    expect(simplifyPolygon(small)).toBe(small);
  });
});
