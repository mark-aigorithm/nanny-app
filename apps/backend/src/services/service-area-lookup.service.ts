import type { Polygon, Position, ServiceAreaLookup } from '@nanny-app/shared';

import { AppError, errors } from '@backend/lib/errors';
import { simplifyRing } from '@backend/lib/polygon-simplify';

/**
 * Looks an area's name up on OpenStreetMap and returns its border as a
 * starting outline for the admin to check — Google's APIs return only a
 * viewport. Nominatim's usage policy asks for an identified client and at most
 * one request a second, which an admin-only lookup comfortably keeps to.
 *
 * Informal names can be badly off ("التجمع الخامس" is mapped as a 10 km² block
 * in a much larger settlement), which is why the console never saves a lookup
 * unseen.
 */

const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'NannyNow-admin/1.0 (service-area lookup)';
const MIN_INTERVAL_MS = 1_100;
const TIMEOUT_MS = 10_000;
const UNAVAILABLE = "The map lookup didn't answer. Try again in a moment, or draw the area by hand.";

export type NominatimHit = {
  display_name: string;
  /** [south, north, west, east], as strings. */
  boundingbox: string[];
  /** Shape depends on `type`: a Point, a Polygon's rings, or a MultiPolygon's polygons. */
  geojson?: { type: string; coordinates: unknown };
};

let lastCallAt = 0;

async function throttle(): Promise<void> {
  const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastCallAt = Date.now();
}

function ringArea(ring: Position[]): number {
  let twice = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i] as Position;
    const [x2, y2] = ring[i + 1] as Position;
    twice += x1 * y2 - x2 * y1;
  }
  return Math.abs(twice);
}

/** The outer ring of a Polygon, or the biggest outer ring of a MultiPolygon. */
function outerRing(geojson: NominatimHit['geojson']): Position[] | null {
  if (!geojson) return null;
  if (geojson.type === 'Polygon') {
    return (geojson.coordinates as Position[][])[0] ?? null;
  }
  if (geojson.type === 'MultiPolygon') {
    const rings = (geojson.coordinates as Position[][][]).map((p) => p[0]).filter((r): r is Position[] => !!r);
    return rings.reduce<Position[] | null>((best, r) => (!best || ringArea(r) > ringArea(best) ? r : best), null);
  }
  return null;
}

export function toLookup(query: string, hits: NominatimHit[]): ServiceAreaLookup {
  for (const hit of hits) {
    const ring = outerRing(hit.geojson);
    if (ring && ring.length >= 4) {
      const polygon: Polygon = { type: 'Polygon', coordinates: [simplifyRing(ring)] };
      return { displayName: hit.display_name, polygon, source: 'osm' };
    }
  }
  const first = hits[0];
  if (!first) throw errors.notFound(`Nothing called “${query}” was found on the map. Draw the area by hand.`);
  const [south, north, west, east] = first.boundingbox.map(Number) as [number, number, number, number];
  return {
    displayName: first.display_name,
    source: 'bbox',
    polygon: {
      type: 'Polygon',
      coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
    },
  };
}

export async function lookupServiceArea(query: string): Promise<ServiceAreaLookup> {
  await throttle();
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    polygon_geojson: '1',
    countrycodes: 'eg',
    limit: '5',
  });
  let hits: NominatimHit[];
  try {
    const res = await fetch(`${NOMINATIM_SEARCH}?${params.toString()}`, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    hits = (await res.json()) as NominatimHit[];
  } catch (err) {
    console.warn('[service-area] lookup failed:', err instanceof Error ? err.message : err);
    throw new AppError(UNAVAILABLE, 502);
  }
  return toLookup(query, hits);
}
