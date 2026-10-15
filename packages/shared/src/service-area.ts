import { z } from 'zod';

// ──────────────────────────────────────────────────────────────
// Service areas — where mothers can book. While at least one area
// is active, a booking's address must fall inside one; with none
// active, booking is unrestricted. Shapes are GeoJSON polygons in
// [lng, lat] order. Imports nothing internal.
// ──────────────────────────────────────────────────────────────

export const SERVICE_AREA_MAX_POSITIONS = 500;

const PositionSchema = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
export type Position = z.infer<typeof PositionSchema>;

/** One closed outer ring; holes and multipolygons are refused. */
export const PolygonSchema = z
  .object({
    type: z.literal('Polygon'),
    coordinates: z.tuple([z.array(PositionSchema).min(4).max(SERVICE_AREA_MAX_POSITIONS)]),
  })
  .refine(
    (p) => {
      const ring = p.coordinates[0];
      const first = ring[0];
      const last = ring[ring.length - 1];
      return !!first && !!last && first[0] === last[0] && first[1] === last[1];
    },
    { message: 'The outline must be closed.' },
  );
export type Polygon = z.infer<typeof PolygonSchema>;

/** Where the outline started: an OpenStreetMap border, its bounding box, or the admin's clicks. */
export const ServiceAreaSourceSchema = z.enum(['osm', 'bbox', 'drawn']);
export type ServiceAreaSource = z.infer<typeof ServiceAreaSourceSchema>;

export const ServiceAreaSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  polygon: PolygonSchema,
  isActive: z.boolean(),
  source: ServiceAreaSourceSchema,
  updatedAt: z.string(),
});
export type ServiceArea = z.infer<typeof ServiceAreaSchema>;

export const CreateServiceAreaSchema = z.object({
  name: z.string().trim().min(1, 'Give the area a name.').max(100),
  polygon: PolygonSchema,
  isActive: z.boolean().optional(),
  source: ServiceAreaSourceSchema,
});
export type CreateServiceAreaInput = z.infer<typeof CreateServiceAreaSchema>;

export const UpdateServiceAreaSchema = CreateServiceAreaSchema.partial().refine(
  (v) => Object.keys(v).length > 0,
  { message: 'Nothing to update.' },
);
export type UpdateServiceAreaInput = z.infer<typeof UpdateServiceAreaSchema>;

/** A name looked up on the map: a starting outline for the admin to check. */
export const ServiceAreaLookupSchema = z.object({
  displayName: z.string(),
  polygon: PolygonSchema,
  source: z.enum(['osm', 'bbox']),
});
export type ServiceAreaLookup = z.infer<typeof ServiceAreaLookupSchema>;

/** A mother's default address as a bare point — the editor's coverage preview. */
/**
 * The page-wide switch. Off lifts the limit for every mother, whatever areas
 * are active; on (the default) limits booking to the active areas, if any.
 */
export const ServiceAreaSettingsSchema = z.object({ enabled: z.boolean() });
export type ServiceAreaSettings = z.infer<typeof ServiceAreaSettingsSchema>;

export const MotherPinSchema = z.object({ latitude: z.number(), longitude: z.number() });
export type MotherPin = z.infer<typeof MotherPinSchema>;

/**
 * Ray casting on the outer ring. Works in raw degrees: areas are a few
 * kilometres across, far too small for the earth's curve to matter.
 */
export function isPointInPolygon(lat: number, lng: number, polygon: Polygon): boolean {
  const ring = polygon.coordinates[0];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as Position;
    const [xj, yj] = ring[j] as Position;
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

const KM_PER_DEGREE = 111.32;

/** Shoelace area on an equirectangular projection centred on the ring — good to about 1% at city size. */
export function polygonAreaKm2(polygon: Polygon): number {
  const ring = polygon.coordinates[0];
  const meanLat = ring.reduce((sum, [, lat]) => sum + lat, 0) / ring.length;
  const kx = KM_PER_DEGREE * Math.cos((meanLat * Math.PI) / 180);
  let twice = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i] as Position;
    const [x2, y2] = ring[i + 1] as Position;
    twice += x1 * kx * (y2 * KM_PER_DEGREE) - x2 * kx * (y1 * KM_PER_DEGREE);
  }
  return Math.abs(twice) / 2;
}

/** The one wording for "outside every area" — the backend's refusal and the app's note. */
export function outsideServiceAreaMessage(names: string[]): string {
  const first = "We don't serve this area yet.";
  return names.length === 0 ? first : `${first} We're currently in: ${names.join(', ')}.`;
}
