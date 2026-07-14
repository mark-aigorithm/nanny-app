/**
 * Great-circle distance helpers for radius-filtering the nanny broadcast.
 * Pure math (haversine) over plain lat/lng pairs — booking and user
 * coordinates are stored as Decimal columns, so no PostGIS round trip is
 * needed to filter the small in-memory candidate lists these feed.
 */

export type LatLng = { latitude: number; longitude: number };

const EARTH_RADIUS_KM = 6371;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Haversine distance between two points, in kilometres. */
export function distanceKm(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Normalizes nullable Prisma Decimal / number coordinates into a LatLng.
 * Returns null unless BOTH coordinates convert to finite numbers.
 */
export function toLatLng(latitude: unknown, longitude: unknown): LatLng | null {
  if (latitude == null || longitude == null) return null;
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { latitude: lat, longitude: lng };
}

/**
 * True when b is within radiusKm of a. Missing coordinates on either side or
 * a non-positive radius always match — distance filtering is an optimization,
 * never a reason to hide a request (see design spec: notify-all fallback).
 */
export function isWithinRadius(
  a: LatLng | null,
  b: LatLng | null,
  radiusKm: number,
): boolean {
  if (radiusKm <= 0 || a === null || b === null) return true;
  return distanceKm(a, b) <= radiusKm;
}
