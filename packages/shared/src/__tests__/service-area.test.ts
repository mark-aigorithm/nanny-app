import { describe, expect, it } from 'vitest';

import {
  PolygonSchema,
  isPointInPolygon,
  outsideServiceAreaMessage,
  polygonAreaKm2,
  type Polygon,
} from '../service-area';

// A concave "C" around New Cairo: the notch on the east side is outside.
const C_SHAPE: Polygon = {
  type: 'Polygon',
  coordinates: [[
    [31.40, 29.98], [31.52, 29.98], [31.52, 30.00], [31.44, 30.00],
    [31.44, 30.04], [31.52, 30.04], [31.52, 30.06], [31.40, 30.06], [31.40, 29.98],
  ]],
};

describe('isPointInPolygon', () => {
  it('finds a point inside', () => {
    expect(isPointInPolygon(30.02, 31.42, C_SHAPE)).toBe(true);
  });
  it('finds a point in the concave notch outside', () => {
    expect(isPointInPolygon(30.02, 31.48, C_SHAPE)).toBe(false);
  });
  it('finds a point far away outside (downtown Cairo)', () => {
    expect(isPointInPolygon(30.0444, 31.2357, C_SHAPE)).toBe(false);
  });
});

describe('PolygonSchema', () => {
  it('accepts a closed ring', () => {
    expect(PolygonSchema.safeParse(C_SHAPE).success).toBe(true);
  });
  it('refuses an open ring', () => {
    const open = { type: 'Polygon', coordinates: [C_SHAPE.coordinates[0].slice(0, -1)] };
    expect(PolygonSchema.safeParse(open).success).toBe(false);
  });
  it('refuses holes', () => {
    const holed = { type: 'Polygon', coordinates: [C_SHAPE.coordinates[0], C_SHAPE.coordinates[0]] };
    expect(PolygonSchema.safeParse(holed).success).toBe(false);
  });
  it('refuses out-of-range coordinates', () => {
    const bad = { type: 'Polygon', coordinates: [[[200, 30], [31, 30], [31, 31], [200, 30]]] };
    expect(PolygonSchema.safeParse(bad).success).toBe(false);
  });
  it('refuses fewer than three corners', () => {
    const line = { type: 'Polygon', coordinates: [[[31, 30], [31.1, 30], [31, 30]]] };
    expect(PolygonSchema.safeParse(line).success).toBe(false);
  });
});

describe('polygonAreaKm2', () => {
  it('measures a 0.1° square near Cairo at about 107 km²', () => {
    const square: Polygon = {
      type: 'Polygon',
      coordinates: [[[31.4, 30.0], [31.5, 30.0], [31.5, 30.1], [31.4, 30.1], [31.4, 30.0]]],
    };
    expect(polygonAreaKm2(square)).toBeGreaterThan(100);
    expect(polygonAreaKm2(square)).toBeLessThan(115);
  });
});

describe('outsideServiceAreaMessage', () => {
  it('names the served areas', () => {
    expect(outsideServiceAreaMessage(['New Cairo', 'Maadi'])).toBe(
      "We don't serve this area yet. We're currently in: New Cairo, Maadi.",
    );
  });
  it('says only the first sentence when no names are known', () => {
    expect(outsideServiceAreaMessage([])).toBe("We don't serve this area yet.");
  });
});
