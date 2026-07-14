import { distanceKm, isWithinRadius, toLatLng } from '@backend/lib/geo';

const CAIRO = { latitude: 30.0444, longitude: 31.2357 };
const ALEXANDRIA = { latitude: 31.2001, longitude: 29.9187 };
const NEAR_CAIRO = { latitude: 30.05, longitude: 31.24 }; // < 1 km from CAIRO

describe('distanceKm', () => {
  it('is ~180 km between Cairo and Alexandria', () => {
    const d = distanceKm(CAIRO, ALEXANDRIA);
    expect(d).toBeGreaterThan(170);
    expect(d).toBeLessThan(190);
  });

  it('is 0 for the same point', () => {
    expect(distanceKm(CAIRO, CAIRO)).toBeCloseTo(0, 6);
  });

  it('is symmetric', () => {
    expect(distanceKm(CAIRO, ALEXANDRIA)).toBeCloseTo(distanceKm(ALEXANDRIA, CAIRO), 6);
  });
});

describe('toLatLng', () => {
  it('returns null when either coordinate is missing', () => {
    expect(toLatLng(null, 31.2)).toBeNull();
    expect(toLatLng(30.0, null)).toBeNull();
    expect(toLatLng(null, null)).toBeNull();
    expect(toLatLng(undefined, undefined)).toBeNull();
  });

  it('converts numeric and Decimal-like values', () => {
    expect(toLatLng(30.0444, 31.2357)).toEqual(CAIRO);
    // Prisma Decimal stringifies to its numeric value.
    expect(toLatLng('30.0444', '31.2357')).toEqual(CAIRO);
  });

  it('returns null for non-numeric values', () => {
    expect(toLatLng('abc', 31.2)).toBeNull();
  });
});

describe('isWithinRadius', () => {
  it('includes a point inside the radius', () => {
    expect(isWithinRadius(CAIRO, NEAR_CAIRO, 10)).toBe(true);
  });

  it('excludes a point outside the radius', () => {
    expect(isWithinRadius(CAIRO, ALEXANDRIA, 10)).toBe(false);
  });

  it('always includes when either point is missing (fallback)', () => {
    expect(isWithinRadius(null, ALEXANDRIA, 10)).toBe(true);
    expect(isWithinRadius(CAIRO, null, 10)).toBe(true);
  });

  it('always includes when the radius is 0 (filtering disabled)', () => {
    expect(isWithinRadius(CAIRO, ALEXANDRIA, 0)).toBe(true);
  });
});
