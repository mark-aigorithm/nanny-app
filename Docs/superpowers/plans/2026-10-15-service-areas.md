# Service Areas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mothers can book only when the booking's address is inside an active, admin-drawn service area. The admin starts each area from an OpenStreetMap border looked up by name.

**Architecture:**
- **Storage:** a `service_areas` table holds GeoJSON polygons.
- **Shared code:** `@nanny-app/shared` owns the polygon schema, the point-in-polygon test and the refusal message, so the backend, admin and mobile agree.
- **Backend:**
  - Refuses `POST /bookings` outside every active area.
  - Marks each of the mother's addresses `inServiceArea`.
  - Publishes the area names in booking options.
  - Proxies the Nominatim lookup for the console.
- **Console:** a table page plus a map editor that uses Google Maps' editable `Polygon`.
- **App:** the booking "Where" step tags an outside address and blocks Continue.

**Tech Stack:** Prisma 7 + Postgres, Express, Zod 3, React 19 + `@vis.gl/react-google-maps` (admin), Expo / React Native (mobile), Jest, Vitest + MSW, Maestro.

**Spec:** `Docs/superpowers/specs/2026-10-15-service-areas-design.md`

## Global Constraints

- **No active areas = unrestricted.** Deploying changes nothing until an admin switches an area on.
- **What is checked:** the booking's address (`addressId`, or her default for old builds), by latitude/longitude only. Typed `area`/`governorate` text is never consulted.
- **Polygon format:** GeoJSON `Polygon`, `[lng, lat]` order, one closed outer ring, 4–500 positions, no holes.
- **Simplifying a lookup result:** about 25 m tolerance, at most 150 positions.
- **Refusal copy, one source** (`outsideServiceAreaMessage`): `We don't serve this area yet. We're currently in: <names joined by ", ">.` With no names: `We don't serve this area yet.`
- **Address tag copy:** `Not in our service area yet`.
- **Console section:** key `serviceAreas`, label `Service Areas`, path `/service-areas`. Reads need VIEW and writes and the lookup need MANAGE.
- **Nominatim:**
  - Called only by the backend.
  - Sends a `User-Agent` that names the app.
  - At most 1 request/second, with a 10 s timeout.
  - `countrycodes=eg`.
- **Repo conventions apply:**
  - Soft delete only.
  - No `any`.
  - Mobile uses theme tokens only and `Text` from `@mobile/components/ui/text`.
  - Admin uses CSS tokens in `global.css` and the shared ui barrel.
  - Every admin route gets a row in `ADMIN_ROUTE_PERMISSIONS`.
- Commits name files explicitly (never `git add -A`) and end with the session's attribution trailer.

## Review Focus

1. **A malformed polygon in the DB** (hand-edited row, older shape) must not take down booking or the address list. It is skipped, and the remaining areas still apply. Tested in Task 2.
2. **An area switched off or soft-deleted** stops restricting immediately. With only inactive areas, everyone can book. Tested in Task 4.
3. **Nominatim down, slow or returning HTML/429** gives a 502 with a "draw it by hand" message, never a 500. Tested in Task 3.
4. **A MultiPolygon result** (a district split by a highway, an exclave) uses the largest ring, not the first. Tested in Task 3.
5. **The mother adds a new address on the "Where" step while an area is active.** The new card shows the tag and Continue updates without leaving the screen. Tested in Task 7.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/shared/src/service-area.ts` (new) | Polygon/area schemas, `isPointInPolygon`, `polygonAreaKm2`, `outsideServiceAreaMessage` |
| `packages/shared/src/__tests__/service-area.test.ts` (new) | Vitest for the above |
| `packages/shared/src/address.ts` | `AddressSchema.inServiceArea` (optional) |
| `packages/shared/src/booking.ts` | `BookingOptionsSchema.serviceAreaNames` |
| `packages/shared/src/operator.ts` | `serviceAreas` section |
| `packages/shared/src/index.ts` | export `./service-area` |
| `apps/backend/prisma/schema.prisma` + migration | `ServiceArea` model |
| `apps/backend/src/lib/polygon-simplify.ts` (new) | Douglas–Peucker for a closed ring |
| `apps/backend/src/services/service-area.service.ts` (new) | CRUD, active-area check, mother pins |
| `apps/backend/src/services/service-area-lookup.service.ts` (new) | Nominatim call, throttle, result → lookup |
| `apps/backend/src/routes/admin.routes.ts`, `src/lib/admin-permissions.ts` | Admin routes + permission rows |
| `apps/backend/src/services/booking.service.ts` | Enforcement in `createBooking`; `serviceAreaNames` in options |
| `apps/backend/src/services/address.service.ts` | `inServiceArea` on the caller's own addresses |
| `apps/backend/src/__integration__/journeys/a34-service-areas.test.ts` (new) | HTTP contract |
| `apps/admin/src/lib/api.ts` | Service-area endpoint functions |
| `apps/admin/src/pages/service-areas-page.tsx` (new) | Table page |
| `apps/admin/src/features/service-areas/service-area-table.tsx` (new) | Rows, toggle, delete |
| `apps/admin/src/features/service-areas/service-area-form.tsx` (new) | Add/edit `FormModal`: name, Find, map, coverage |
| `apps/admin/src/features/service-areas/area-map.tsx` (new) | Google map + editable polygon + draw mode + pins |
| `apps/admin/src/app.tsx`, `components/admin-layout.tsx`, `styles/global.css` | Route, nav item, styles |
| `apps/mobile/src/components/BookingLocationSection.tsx` (+ styles) | Tag, note, `onOutsideAreaChange` |
| `apps/mobile/src/screens/parent/BookingDatePickerScreen.tsx` | Blocks Continue |
| `apps/backend/test/e2e/seed-mobile.ts`, `apps/mobile/e2e/scripts/advance.js`, `apps/mobile/e2e/flows/c19-service-area.yaml` | Device test |

---

### Task 1: Shared schemas and geometry

**Files:**
- Create: `packages/shared/src/service-area.ts`
- Create: `packages/shared/src/__tests__/service-area.test.ts`
- Modify: `packages/shared/src/index.ts`, `packages/shared/src/address.ts:78-83`, `packages/shared/src/booking.ts:579-607`, `packages/shared/src/operator.ts:19-104`

**Interfaces:**
- Produces:
  - `Position = [number, number]`
  - `PolygonSchema` / `Polygon`
  - `ServiceAreaSourceSchema` (`'osm' | 'bbox' | 'drawn'`)
  - `ServiceAreaSchema` / `ServiceArea` = `{ id: number; name: string; polygon: Polygon; isActive: boolean; source: ServiceAreaSource; updatedAt: string }`
  - `CreateServiceAreaSchema` / `CreateServiceAreaInput`
  - `UpdateServiceAreaSchema` / `UpdateServiceAreaInput`
  - `ServiceAreaLookupSchema` / `ServiceAreaLookup` = `{ displayName: string; polygon: Polygon; source: 'osm' | 'bbox' }`
  - `MotherPin = { latitude: number; longitude: number }`
  - `isPointInPolygon(lat: number, lng: number, polygon: Polygon): boolean`
  - `polygonAreaKm2(polygon: Polygon): number`
  - `outsideServiceAreaMessage(names: string[]): string`
  - `Address.inServiceArea?: boolean`
  - `BookingOptions.serviceAreaNames: string[]`
  - `AdminSection` includes `'serviceAreas'`

- [ ] **Step 1: Write the failing tests**

`packages/shared/src/__tests__/service-area.test.ts`:

```ts
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
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm --filter @nanny-app/shared test -- service-area`
Expected: FAIL, "Failed to resolve import ../service-area".

- [ ] **Step 3: Implement `packages/shared/src/service-area.ts`**

```ts
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
```

- [ ] **Step 4: Wire it into the existing schemas**

In `packages/shared/src/index.ts`, add `export * from './service-area';` next to `export * from './address';`.

In `packages/shared/src/address.ts`, extend `AddressSchema`:

```ts
export const AddressSchema = AddressInputSchema.omit({ isDefault: true }).extend({
  id: z.number().int(),
  isDefault: z.boolean(),
  createdAt: z.string(),
  /**
   * Whether a booking may be made here: inside an active service area, or
   * true when no area is active. Set only on the mother's own address book
   * (the /addresses routes); absent elsewhere.
   */
  inServiceArea: z.boolean().optional(),
});
```

In `packages/shared/src/booking.ts`, add to `BookingOptionsSchema` after `earliestStartWallClock`:

```ts
  /**
   * Names of the active service areas, in creation order, for the "Where"
   * step's note. Empty means booking is unrestricted.
   */
  serviceAreaNames: z.array(z.string()),
```

In `packages/shared/src/operator.ts`:
- Append `'serviceAreas'` to `ADMIN_SECTIONS` (after `'settings'`).
- Add `serviceAreas: 'Service Areas'` to `ADMIN_SECTION_LABELS`.
- Add `serviceAreas: '/service-areas'` to `ADMIN_SECTION_PATHS`.
- Add `serviceAreas: AdminAccessLevelSchema.optional(),` to `OperatorPermissionsSchema`.

- [ ] **Step 5: Run the tests and the typecheck**

Run: `pnpm --filter @nanny-app/shared test && pnpm typecheck`
Expected:
- Shared tests: PASS.
- Typecheck: FAILS in backend `getBookingOptions` (missing `serviceAreaNames`) and in any admin/mobile fixture that builds `BookingOptions` or a full `OperatorPermissions`/section record.
- Note those failures. Task 4 fixes the backend one, and Tasks 5 and 7 fix the fixtures they touch. Fix any *other* fixture now by adding `serviceAreaNames: []`.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/service-area.ts packages/shared/src/__tests__/service-area.test.ts packages/shared/src/index.ts packages/shared/src/address.ts packages/shared/src/booking.ts packages/shared/src/operator.ts
git commit -m "feat(shared): service area schemas and point-in-polygon"
```

---

### Task 2: ServiceArea model and core service

**Files:**
- Modify: `apps/backend/prisma/schema.prisma` (after `model AppSettings`, ~line 577)
- Create: migration `apps/backend/prisma/migrations/<ts>_add_service_areas/migration.sql` (generated)
- Create: `apps/backend/src/services/service-area.service.ts`
- Test: `apps/backend/src/__tests__/service-area.service.test.ts`

**Interfaces:**
- Consumes: `PolygonSchema`, `isPointInPolygon`, `outsideServiceAreaMessage`, `ServiceArea`, `CreateServiceAreaInput`, `UpdateServiceAreaInput`, `MotherPin` (Task 1).
- Produces:
  - `type ActiveArea = { name: string; polygon: Polygon }`
  - `getActiveServiceAreas(): Promise<ActiveArea[]>` (creation order; malformed rows skipped)
  - `isInAnyArea(lat: number, lng: number, areas: ActiveArea[]): boolean` (true when `areas` is empty)
  - `assertInServiceArea(lat: number, lng: number): Promise<void>` (throws 400 with `outsideServiceAreaMessage`)
  - `listServiceAreas(): Promise<ServiceArea[]>`
  - `createServiceArea(input): Promise<ServiceArea>`
  - `updateServiceArea(id, input): Promise<ServiceArea>`
  - `deleteServiceArea(id): Promise<void>`
  - `listMotherPins(): Promise<MotherPin[]>`

- [ ] **Step 1: Add the model and generate the migration**

```prisma
/// An area mothers can book in. While at least one is active, a booking's
/// address must fall inside one; with none active, booking is unrestricted.
/// See Docs/superpowers/specs/2026-10-15-service-areas-design.md.
model ServiceArea {
  id        Int       @id @default(autoincrement())
  name      String
  /// GeoJSON Polygon, [lng, lat] order, one closed outer ring.
  polygon   Json
  isActive  Boolean   @default(true) @map("is_active")
  /// 'osm' | 'bbox' | 'drawn' — where the outline started.
  source    String
  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")
  deletedAt DateTime? @map("deleted_at")

  @@index([isActive, deletedAt])
  @@map("service_areas")
}
```

Run (dev DB on 5432 must be up: `docker compose up -d`):
`pnpm --filter @nanny-app/backend db:migrate:dev --name add_service_areas`
Expected: a new migration folder whose SQL only creates `service_areas` and its index. Read the SQL before going on.

- [ ] **Step 2: Write the failing unit test**

`apps/backend/src/__tests__/service-area.service.test.ts`. Mock Prisma the way neighbouring unit tests do (look at `app-settings.service.test.ts` for the `jest.mock('@backend/db/prisma', …)` shape and copy it):

```ts
import { prisma } from '@backend/db/prisma';
import {
  assertInServiceArea,
  getActiveServiceAreas,
  isInAnyArea,
} from '@backend/services/service-area.service';

jest.mock('@backend/db/prisma', () => ({
  prisma: { serviceArea: { findMany: jest.fn() } },
}));

const findMany = prisma.serviceArea.findMany as jest.Mock;

const NEW_CAIRO = {
  type: 'Polygon',
  coordinates: [[[31.40, 29.98], [31.52, 29.98], [31.52, 30.06], [31.40, 30.06], [31.40, 29.98]]],
};
const DOWNTOWN = { lat: 30.0444, lng: 31.2357 };
const FIFTH_SETTLEMENT = { lat: 30.02, lng: 31.47 };

beforeEach(() => findMany.mockReset());

describe('isInAnyArea', () => {
  it('allows everywhere when no area is active', () => {
    expect(isInAnyArea(DOWNTOWN.lat, DOWNTOWN.lng, [])).toBe(true);
  });
  it('allows a point inside an area and refuses one outside', () => {
    const areas = [{ name: 'New Cairo', polygon: NEW_CAIRO as never }];
    expect(isInAnyArea(FIFTH_SETTLEMENT.lat, FIFTH_SETTLEMENT.lng, areas)).toBe(true);
    expect(isInAnyArea(DOWNTOWN.lat, DOWNTOWN.lng, areas)).toBe(false);
  });
});

describe('getActiveServiceAreas', () => {
  it('asks only for live, active rows in creation order', async () => {
    findMany.mockResolvedValue([]);
    await getActiveServiceAreas();
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true, deletedAt: null },
        orderBy: { id: 'asc' },
      }),
    );
  });
  it('skips a row whose polygon is malformed instead of failing', async () => {
    findMany.mockResolvedValue([
      { name: 'Broken', polygon: { type: 'Polygon', coordinates: [[[1, 2]]] } },
      { name: 'New Cairo', polygon: NEW_CAIRO },
    ]);
    const areas = await getActiveServiceAreas();
    expect(areas.map((a) => a.name)).toEqual(['New Cairo']);
  });
});

describe('assertInServiceArea', () => {
  it('passes with no active areas', async () => {
    findMany.mockResolvedValue([]);
    await expect(assertInServiceArea(DOWNTOWN.lat, DOWNTOWN.lng)).resolves.toBeUndefined();
  });
  it('refuses outside with the served names', async () => {
    findMany.mockResolvedValue([{ name: 'New Cairo', polygon: NEW_CAIRO }]);
    await expect(assertInServiceArea(DOWNTOWN.lat, DOWNTOWN.lng)).rejects.toMatchObject({
      statusCode: 400,
      message: "We don't serve this area yet. We're currently in: New Cairo.",
    });
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `pnpm --filter @nanny-app/backend test:unit -- service-area.service`
Expected: FAIL, "Cannot find module '@backend/services/service-area.service'".

- [ ] **Step 4: Implement `apps/backend/src/services/service-area.service.ts`**

```ts
import {
  PolygonSchema,
  Role,
  isPointInPolygon,
  outsideServiceAreaMessage,
  type CreateServiceAreaInput,
  type MotherPin,
  type Polygon,
  type ServiceArea,
  type ServiceAreaSource,
  type UpdateServiceAreaInput,
} from '@nanny-app/shared';
import type { Prisma, ServiceArea as ServiceAreaRow } from '@prisma/client';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';

/**
 * Where mothers can book. While at least one area is active, a booking's
 * address must fall inside one; with none active, booking is unrestricted —
 * so the feature is off until an admin switches an area on.
 */

export type ActiveArea = { name: string; polygon: Polygon };

/**
 * Active areas, oldest first (the order their names are listed in). A row
 * whose polygon no longer parses is skipped and logged rather than failing
 * every booking and address list.
 */
export async function getActiveServiceAreas(): Promise<ActiveArea[]> {
  const rows = await prisma.serviceArea.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: { id: 'asc' },
    select: { id: true, name: true, polygon: true },
  });
  const areas: ActiveArea[] = [];
  for (const row of rows) {
    const parsed = PolygonSchema.safeParse(row.polygon);
    if (parsed.success) areas.push({ name: row.name, polygon: parsed.data });
    else console.warn(`[service-area] skipping area ${row.id ?? row.name}: malformed polygon`);
  }
  return areas;
}

/** True when no area is active, or the point is inside any of them. */
export function isInAnyArea(lat: number, lng: number, areas: ActiveArea[]): boolean {
  return areas.length === 0 || areas.some((a) => isPointInPolygon(lat, lng, a.polygon));
}

/** Throws the refusal mothers see when the point is outside every active area. */
export async function assertInServiceArea(lat: number, lng: number): Promise<void> {
  const areas = await getActiveServiceAreas();
  if (!isInAnyArea(lat, lng, areas)) {
    throw errors.badRequest(outsideServiceAreaMessage(areas.map((a) => a.name)));
  }
}

// ── Admin ─────────────────────────────────────────────────────────────────────

function toDto(row: ServiceAreaRow): ServiceArea {
  return {
    id: row.id,
    name: row.name,
    polygon: PolygonSchema.parse(row.polygon),
    isActive: row.isActive,
    source: row.source as ServiceAreaSource,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listServiceAreas(): Promise<ServiceArea[]> {
  const rows = await prisma.serviceArea.findMany({
    where: { deletedAt: null },
    orderBy: { id: 'desc' },
  });
  return rows.map(toDto);
}

export async function createServiceArea(input: CreateServiceAreaInput): Promise<ServiceArea> {
  const row = await prisma.serviceArea.create({
    data: {
      name: input.name,
      polygon: input.polygon as Prisma.InputJsonValue,
      isActive: input.isActive ?? true,
      source: input.source,
    },
  });
  return toDto(row);
}

async function requireArea(id: number): Promise<void> {
  const found = await prisma.serviceArea.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!found) throw errors.notFound('Service area not found.');
}

export async function updateServiceArea(id: number, input: UpdateServiceAreaInput): Promise<ServiceArea> {
  await requireArea(id);
  const row = await prisma.serviceArea.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.polygon !== undefined ? { polygon: input.polygon as Prisma.InputJsonValue } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.source !== undefined ? { source: input.source } : {}),
    },
  });
  return toDto(row);
}

export async function deleteServiceArea(id: number): Promise<void> {
  await requireArea(id);
  await prisma.serviceArea.update({ where: { id }, data: { deletedAt: new Date() } });
}

/** Every live mother's default address as a bare point — no names, no ids. */
export async function listMotherPins(): Promise<MotherPin[]> {
  const rows = await prisma.address.findMany({
    where: { isDefault: true, deletedAt: null, user: { role: Role.MOTHER, deletedAt: null } },
    select: { latitude: true, longitude: true },
  });
  return rows.map((r) => ({ latitude: Number(r.latitude), longitude: Number(r.longitude) }));
}
```

(`Role` is exported by `@nanny-app/shared`, as `address.service.ts` already imports it. If the `user` relation filter name differs, use the `Address.user` relation name from the schema.)

- [ ] **Step 5: Run the test and the typecheck**

Run: `pnpm --filter @nanny-app/backend test:unit -- service-area.service && pnpm --filter @nanny-app/backend typecheck`
Expected:
- Unit test: PASS.
- Typecheck: only the known `getBookingOptions` `serviceAreaNames` error remains, which Task 4 fixes.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/prisma/schema.prisma apps/backend/prisma/migrations/*_add_service_areas apps/backend/src/services/service-area.service.ts apps/backend/src/__tests__/service-area.service.test.ts
git commit -m "feat(backend): service_areas table and the in-area check"
```

---

### Task 3: Border lookup (Nominatim + simplification)

**Files:**
- Create: `apps/backend/src/lib/polygon-simplify.ts`
- Create: `apps/backend/src/services/service-area-lookup.service.ts`
- Create: `apps/backend/src/__tests__/polygon-simplify.test.ts`
- Create: `apps/backend/src/__tests__/service-area-lookup.service.test.ts`
- Create: `apps/backend/src/__tests__/fixtures/nominatim-new-cairo.json` (recorded response, trimmed)

**Interfaces:**
- Consumes: `Position`, `Polygon`, `ServiceAreaLookup` (Task 1); `AppError`, `errors`.
- Produces:
  - `simplifyRing(ring: Position[], toleranceM?: number, maxPositions?: number): Position[]`
  - `toLookup(query: string, hits: NominatimHit[]): ServiceAreaLookup` (exported for tests)
  - `lookupServiceArea(query: string): Promise<ServiceAreaLookup>`

- [ ] **Step 1: Record the fixture**

Run it once from the host, saving the polygon-bearing hit:

```bash
curl -s -G -A "NannyNow-admin/1.0 (service-area lookup)" "https://nominatim.openstreetmap.org/search" \
  --data-urlencode "q=New Cairo" --data-urlencode "countrycodes=eg" --data-urlencode "format=jsonv2" \
  --data-urlencode "polygon_geojson=1" --data-urlencode "limit=5" \
  > apps/backend/src/__tests__/fixtures/nominatim-new-cairo.json
python3 -c "import json;d=json.load(open('apps/backend/src/__tests__/fixtures/nominatim-new-cairo.json'));print(d[0]['geojson']['type'], len(d[0]['geojson']['coordinates'][0]))"
```

Expected: `Polygon 319` (or close to it). Commit the file as recorded.

- [ ] **Step 2: Write the failing tests**

`apps/backend/src/__tests__/polygon-simplify.test.ts`:

```ts
import type { Position } from '@nanny-app/shared';

import { simplifyRing } from '@backend/lib/polygon-simplify';

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
```

`apps/backend/src/__tests__/service-area-lookup.service.test.ts`:

```ts
import { PolygonSchema } from '@nanny-app/shared';

import { lookupServiceArea, toLookup, type NominatimHit } from '@backend/services/service-area-lookup.service';

import newCairo from './fixtures/nominatim-new-cairo.json';

const hits = newCairo as NominatimHit[];

describe('toLookup', () => {
  it('turns the real New Cairo border into a valid, simplified polygon', () => {
    const out = toLookup('New Cairo', hits);
    expect(out.source).toBe('osm');
    expect(PolygonSchema.safeParse(out.polygon).success).toBe(true);
    expect(out.polygon.coordinates[0].length).toBeLessThanOrEqual(150);
    expect(out.polygon.coordinates[0].length).toBeLessThan(hits[0]!.geojson!.coordinates[0]!.length as number);
  });

  it('uses the largest ring of a multipolygon', () => {
    const small = [[31.0, 30.0], [31.01, 30.0], [31.01, 30.01], [31.0, 30.0]];
    const big = [[31.4, 30.0], [31.5, 30.0], [31.5, 30.1], [31.4, 30.1], [31.4, 30.0]];
    const out = toLookup('x', [
      { display_name: 'X', boundingbox: ['30', '30.1', '31', '31.5'], geojson: { type: 'MultiPolygon', coordinates: [[small], [big]] } },
    ]);
    expect(out.polygon.coordinates[0]).toContainEqual([31.5, 30.1]);
  });

  it('falls back to the bounding box when no hit has a border', () => {
    const out = toLookup('Fifth Settlement', [
      { display_name: 'A shop', boundingbox: ['30.01', '30.03', '31.46', '31.48'], geojson: { type: 'Point', coordinates: [31.47, 30.02] } },
    ]);
    expect(out).toMatchObject({ source: 'bbox', displayName: 'A shop' });
    expect(out.polygon.coordinates[0]).toEqual([[31.46, 30.01], [31.48, 30.01], [31.48, 30.03], [31.46, 30.03], [31.46, 30.01]]);
  });

  it('is a 404 when nothing matches', () => {
    expect(() => toLookup('Atlantis', [])).toThrow(expect.objectContaining({ statusCode: 404 }));
  });
});

describe('lookupServiceArea', () => {
  afterEach(() => jest.restoreAllMocks());

  it('names the app and restricts to Egypt', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(hits)));
    await lookupServiceArea('New Cairo');
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('countrycodes=eg');
    expect(url).toContain('polygon_geojson=1');
    expect((init.headers as Record<string, string>)['User-Agent']).toMatch(/NannyNow/);
  });

  it('is a 502 telling the admin to draw by hand when Nominatim fails', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>busy</html>', { status: 429 }));
    await expect(lookupServiceArea('New Cairo')).rejects.toMatchObject({
      statusCode: 502,
      message: expect.stringMatching(/draw the area by hand/i),
    });
  });

  it('is a 502 when the network call throws (timeout)', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new DOMException('timed out', 'TimeoutError'));
    await expect(lookupServiceArea('New Cairo')).rejects.toMatchObject({ statusCode: 502 });
  });
});
```

If the backend's tsconfig lacks `resolveJsonModule`, read the fixture with `JSON.parse(readFileSync(path.join(__dirname, 'fixtures/nominatim-new-cairo.json'), 'utf8'))` instead of importing it.

- [ ] **Step 3: Run them and confirm they fail**

Run: `pnpm --filter @nanny-app/backend test:unit -- polygon-simplify service-area-lookup`
Expected: FAIL (modules not found).

- [ ] **Step 4: Implement `apps/backend/src/lib/polygon-simplify.ts`**

```ts
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
```

- [ ] **Step 5: Implement `apps/backend/src/services/service-area-lookup.service.ts`**

```ts
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
  boundingbox: [string, string, string, string];
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
    return ((geojson.coordinates as Position[][])[0] ?? null);
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
```

The throttle adds up to 1.1 s between consecutive calls in the test file. To keep the tests fast, `jest.useFakeTimers()` is not needed: the three `lookupServiceArea` tests make three calls (about 2 s). That's acceptable. If it isn't, export a `resetLookupThrottleForTests()` that sets `lastCallAt = 0` and call it in `beforeEach`.

- [ ] **Step 6: Run the tests**

Run: `pnpm --filter @nanny-app/backend test:unit -- polygon-simplify service-area-lookup`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/lib/polygon-simplify.ts apps/backend/src/services/service-area-lookup.service.ts apps/backend/src/__tests__/polygon-simplify.test.ts apps/backend/src/__tests__/service-area-lookup.service.test.ts apps/backend/src/__tests__/fixtures/nominatim-new-cairo.json
git commit -m "feat(backend): look an area's border up on OpenStreetMap"
```

---

### Task 4: Enforcement, address flag, booking options, admin routes

**Files:**
- Modify: `apps/backend/src/services/booking.service.ts`: after the `home` lookup (~line 1192) and in `getBookingOptions` (~line 1366)
- Modify: `apps/backend/src/services/address.service.ts`: `listMyAddresses`, `createMyAddress`, `updateMyAddress`, `setMyDefaultAddress`, `deleteMyAddress` (~lines 260-293)
- Modify: `apps/backend/src/routes/admin.routes.ts` (new block after Skills, ~line 870)
- Modify: `apps/backend/src/lib/admin-permissions.ts` (new rows after Skills, ~line 151)
- Create: `apps/backend/src/__integration__/journeys/a34-service-areas.test.ts`
- Modify: `apps/backend/CLAUDE.md` (Known Gotchas)

**Interfaces:**
- Consumes: Task 2's service functions and Task 3's `lookupServiceArea`.
- Produces (HTTP):
  - `GET/POST /admin/service-areas`, `PATCH/DELETE /admin/service-areas/:id`
  - `GET /admin/service-areas/lookup?q=` → `ServiceAreaLookup`
  - `GET /admin/service-areas/mother-pins` → `MotherPin[]`
  - `GET /addresses` items carry `inServiceArea`
  - `GET /bookings/options` carries `serviceAreaNames`
  - `POST /bookings` → 400 outside

- [ ] **Step 1: Write the failing integration test**

`apps/backend/src/__integration__/journeys/a34-service-areas.test.ts`:

```ts
/**
 * A34 — service areas. While at least one area is active, a mother can book
 * only at an address inside one; with none active (or only inactive ones),
 * booking is unrestricted. Her address book says which addresses qualify, and
 * booking options name the areas for the app's note.
 */
import request from 'supertest';

import { app } from '@backend/app';

import { authHeader } from '../../../test/auth';
import { makeAdmin, makeMother, makeOperator } from '../../../test/factories';
import { createBookingViaApi, wallClockTomorrow } from '../../../test/journeys/booking';

// makeMother places her at 30.0444, 31.2357 (downtown Cairo).
const NEW_CAIRO = {
  type: 'Polygon',
  coordinates: [[[31.40, 29.98], [31.52, 29.98], [31.52, 30.06], [31.40, 30.06], [31.40, 29.98]]],
};
const AROUND_DOWNTOWN = {
  type: 'Polygon',
  coordinates: [[[31.20, 30.02], [31.26, 30.02], [31.26, 30.07], [31.20, 30.07], [31.20, 30.02]]],
};

async function addArea(adminToken: string, name: string, polygon: unknown, isActive = true) {
  const res = await request(app)
    .post('/admin/service-areas')
    .set(...authHeader(adminToken))
    .send({ name, polygon, isActive, source: 'drawn' });
  expect(res.status).toBe(201);
  return res.body.data as { id: number };
}

function bookAt(motherToken: string, addressId: number) {
  return request(app)
    .post('/bookings')
    .set(...authHeader(motherToken))
    .send({
      startTime: wallClockTomorrow(10),
      endTime: wallClockTomorrow(14),
      children: [{ name: null, ageYears: 3, allergies: null }],
      addressId,
    });
}

describe('A34 — booking is limited to active service areas', () => {
  it('books anywhere while no area exists', async () => {
    const mother = await makeMother();
    await expect(createBookingViaApi(mother.token)).resolves.toBeDefined();
    const options = await request(app).get('/bookings/options').set(...authHeader(mother.token));
    expect(options.body.data.serviceAreaNames).toEqual([]);
  });

  it('refuses an address outside every active area, naming the areas', async () => {
    const admin = await makeAdmin();
    const mother = await makeMother();
    await addArea(admin.token, 'New Cairo', NEW_CAIRO);

    const res = await bookAt(mother.token, mother.addressId!);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("We don't serve this area yet. We're currently in: New Cairo.");
  });

  it('books at an address inside an active area', async () => {
    const admin = await makeAdmin();
    const mother = await makeMother();
    await addArea(admin.token, 'New Cairo', NEW_CAIRO);
    await addArea(admin.token, 'Downtown', AROUND_DOWNTOWN);

    const res = await bookAt(mother.token, mother.addressId!);

    expect(res.status).toBe(201);
  });

  it('stops restricting once the only area is switched off or deleted', async () => {
    const admin = await makeAdmin();
    const mother = await makeMother();
    const area = await addArea(admin.token, 'New Cairo', NEW_CAIRO);

    await request(app).patch(`/admin/service-areas/${area.id}`).set(...authHeader(admin.token)).send({ isActive: false });
    expect((await bookAt(mother.token, mother.addressId!)).status).toBe(201);

    const second = await addArea(admin.token, 'New Cairo again', NEW_CAIRO);
    await request(app).delete(`/admin/service-areas/${second.id}`).set(...authHeader(admin.token));
    const list = await request(app).get('/admin/service-areas').set(...authHeader(admin.token));
    expect(list.body.data.map((a: { id: number }) => a.id)).not.toContain(second.id);
    const options = await request(app).get('/bookings/options').set(...authHeader(mother.token));
    expect(options.body.data.serviceAreaNames).toEqual([]);
  });

  it('marks each of her addresses in or out, and names the areas in booking options', async () => {
    const admin = await makeAdmin();
    const mother = await makeMother();
    await addArea(admin.token, 'New Cairo', NEW_CAIRO);
    await request(app)
      .post('/addresses')
      .set(...authHeader(mother.token))
      .send({ label: 'Work', formattedAddress: '90th St, New Cairo', latitude: 30.02, longitude: 31.47 });

    const list = await request(app).get('/addresses').set(...authHeader(mother.token));
    const byLabel = Object.fromEntries(
      (list.body.data as Array<{ label: string; inServiceArea: boolean }>).map((a) => [a.label, a.inServiceArea]),
    );
    expect(byLabel).toEqual({ Home: false, Work: true });

    const options = await request(app).get('/bookings/options').set(...authHeader(mother.token));
    expect(options.body.data.serviceAreaNames).toEqual(['New Cairo']);
  });
});

describe('A34 — the console manages areas', () => {
  it('refuses an operator without the section and lets a granted one read', async () => {
    const none = await makeOperator({});
    const viewer = await makeOperator({ serviceAreas: 'VIEW' });

    expect((await request(app).get('/admin/service-areas').set(...authHeader(none.token))).status).toBe(403);
    expect((await request(app).get('/admin/service-areas').set(...authHeader(viewer.token))).status).toBe(200);
    const write = await request(app)
      .post('/admin/service-areas')
      .set(...authHeader(viewer.token))
      .send({ name: 'X', polygon: NEW_CAIRO, source: 'drawn' });
    expect(write.status).toBe(403);
  });

  it('refuses an open outline', async () => {
    const admin = await makeAdmin();
    const res = await request(app)
      .post('/admin/service-areas')
      .set(...authHeader(admin.token))
      .send({ name: 'Bad', polygon: { type: 'Polygon', coordinates: [NEW_CAIRO.coordinates[0]!.slice(0, -1)] }, source: 'drawn' });
    expect(res.status).toBe(400);
  });

  it('lists mothers’ default addresses as bare points', async () => {
    const admin = await makeAdmin();
    await makeMother();
    const res = await request(app).get('/admin/service-areas/mother-pins').set(...authHeader(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ latitude: 30.0444, longitude: 31.2357 }]);
  });

  it('looks a name up (Nominatim stubbed — no network in CI)', async () => {
    const admin = await makeAdmin();
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify([
        { display_name: 'New Cairo', boundingbox: ['29.98', '30.06', '31.40', '31.52'], geojson: NEW_CAIRO },
      ])),
    );
    const res = await request(app)
      .get('/admin/service-areas/lookup')
      .query({ q: 'New Cairo' })
      .set(...authHeader(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ source: 'osm', displayName: 'New Cairo' });
    jest.restoreAllMocks();
  });
});
```

Caution: supertest and the Firebase emulator calls also use `fetch` inside the test process. The lookup test therefore stubs with `mockResolvedValueOnce` *after* the admin is made, and the next `fetch` the route makes is Nominatim. If the auth middleware's token verification also goes through global `fetch` (the Admin SDK uses its own HTTP client, so it shouldn't), switch to stubbing `lookupServiceArea`'s fetch via a module-level `fetchImpl` the service exports for tests.

- [ ] **Step 2: Run it and confirm it fails**

Make sure the test stack is up (`pnpm test:env`, already running in tmux `nanny-app-testenv`).
Run: `pnpm --filter @nanny-app/backend test:integration -- a34`
Expected: FAIL. The admin routes return 403/404 (no route-table row), and options lack `serviceAreaNames`.

- [ ] **Step 3: Enforce in `createBooking`**

In `booking.service.ts`, import `assertInServiceArea, getActiveServiceAreas` from `@backend/services/service-area.service`. Right after the `if (!home) { … }` block:

```ts
  // Only inside an active service area (no active area = anywhere). Checked
  // on the address the booking is made at, by its pin — the typed area name
  // is the mother's to edit and Google's to spell.
  await assertInServiceArea(Number(home.latitude), Number(home.longitude));
```

In `getBookingOptions`, compute the areas before the `return` and add the field:

```ts
  const areas = await getActiveServiceAreas();
  …
    serviceAreaNames: areas.map((a) => a.name),
```

- [ ] **Step 4: Mark addresses in `address.service.ts`**

Import `getActiveServiceAreas, isInAnyArea` from `@backend/services/service-area.service`. Add a helper above `listMyAddresses` and route each "My" function's result through it:

```ts
/** Adds `inServiceArea` to the caller's own addresses, for the booking picker. */
async function withServiceArea(list: AddressDto[]): Promise<AddressDto[]> {
  const areas = await getActiveServiceAreas();
  return list.map((a) => ({ ...a, inServiceArea: isInAnyArea(a.latitude, a.longitude, areas) }));
}
```

- `listMyAddresses`, `setMyDefaultAddress`, `deleteMyAddress`: `return withServiceArea(await …)`.
- `createMyAddress`, `updateMyAddress`: `const [marked] = await withServiceArea([await …]); return marked as AddressDto;`.

- [ ] **Step 5: Admin routes and permission rows**

In `admin-permissions.ts`, after the Skills rows:

```ts
  // ── Service areas (where mothers can book) ──────────────────
  { method: 'GET', pattern: '/service-areas', requires: section('serviceAreas', 'VIEW') },
  { method: 'GET', pattern: '/service-areas/mother-pins', requires: section('serviceAreas', 'VIEW') },
  // Calls OpenStreetMap on the platform's behalf — writers only.
  { method: 'GET', pattern: '/service-areas/lookup', requires: section('serviceAreas', 'MANAGE') },
  { method: 'POST', pattern: '/service-areas', requires: section('serviceAreas', 'MANAGE') },
  { method: 'PATCH', pattern: '/service-areas/:id', requires: section('serviceAreas', 'MANAGE') },
  { method: 'DELETE', pattern: '/service-areas/:id', requires: section('serviceAreas', 'MANAGE') },
```

In `admin.routes.ts`, import `CreateServiceAreaSchema, UpdateServiceAreaSchema` from `@nanny-app/shared`, the five service functions, and `lookupServiceArea`. Add after the Skills block:

```ts
// ── Service areas (where mothers can book) ─────────────────────

adminRouter.get('/service-areas', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(ok(await listServiceAreas()));
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/service-areas/mother-pins', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(ok(await listMotherPins()));
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/service-areas/lookup', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q === '' || q.length > 100) throw errors.badRequest('Type an area name to look up.');
    res.json(ok(await lookupServiceArea(q)));
  } catch (err) {
    next(err);
  }
});

adminRouter.post(
  '/service-areas',
  validateBody(CreateServiceAreaSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(201).json(ok(await createServiceArea(req.body)));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.patch(
  '/service-areas/:id',
  validateBody(UpdateServiceAreaSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await updateServiceArea(routeIdParam(req.params.id), req.body)));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.delete('/service-areas/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await deleteServiceArea(routeIdParam(req.params.id));
    res.json(ok(null));
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 6: Run the integration test, the permission walk, and the related suites**

Run:

```bash
pnpm --filter @nanny-app/backend test:integration -- a34 a21 a01
pnpm --filter @nanny-app/backend test:unit -- admin-permissions booking address
pnpm --filter @nanny-app/backend typecheck
```

Expected: all PASS. `admin-permissions.test.ts` walks the router and passes only with the six rows. Existing booking/address unit tests that mock Prisma may now need `serviceArea: { findMany: jest.fn().mockResolvedValue([]) }` in their mock; add it where a test fails on `prisma.serviceArea` being undefined.

- [ ] **Step 7: Note the gotcha in `apps/backend/CLAUDE.md`**

Add under Known Gotchas:

```markdown
**Booking is limited to active service areas**
`POST /bookings` refuses an address outside every active `service_areas` polygon
(`assertInServiceArea`, checked on the address's pin, never its typed area). With no active
area, booking is unrestricted — that is the off switch, and the state every test starts in.
The console's border lookup calls OpenStreetMap Nominatim from the backend (1 req/s,
identified `User-Agent`); its results are starting shapes, and informal names can be badly
off. See `Docs/superpowers/specs/2026-10-15-service-areas-design.md`.
```

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/services/booking.service.ts apps/backend/src/services/address.service.ts apps/backend/src/routes/admin.routes.ts apps/backend/src/lib/admin-permissions.ts apps/backend/src/__integration__/journeys/a34-service-areas.test.ts apps/backend/CLAUDE.md
# plus any unit test whose Prisma mock gained serviceArea
git commit -m "feat(backend): limit booking to active service areas"
```

---

### Task 5: Admin — Service Areas table page

**Files:**
- Modify: `apps/admin/src/lib/api.ts` (after the skills functions, ~line 199)
- Create: `apps/admin/src/pages/service-areas-page.tsx`
- Create: `apps/admin/src/features/service-areas/service-area-table.tsx`
- Modify: `apps/admin/src/app.tsx` (route), `apps/admin/src/components/admin-layout.tsx:46-56` (nav item)
- Test: `apps/admin/src/pages/__tests__/service-areas-page.test.tsx`

**Interfaces:**
- Consumes: `ServiceArea`, `CreateServiceAreaInput`, `UpdateServiceAreaInput`, `ServiceAreaLookup`, `MotherPin`, `polygonAreaKm2` (Task 1); HTTP from Task 4.
- Produces:
  - `fetchServiceAreas()`, `createServiceArea(input)`, `updateServiceArea(id, input)`, `deleteServiceArea(id)`, `lookupServiceArea(q): Promise<ServiceAreaLookup>`, `fetchMotherPins(): Promise<MotherPin[]>`
  - Query key `['service-areas']`
  - `ServiceAreaFormModal` is imported from `@admin/features/service-areas/service-area-form` (Task 6 creates it; this task adds a stub so the page compiles).

- [ ] **Step 1: Write the failing page test**

`apps/admin/src/pages/__tests__/service-areas-page.test.tsx`:

```tsx
/**
 * Service Areas is the Skills-style table over the areas mothers can book in.
 * Pinned here: the empty state explains that booking is open everywhere, the
 * Active toggle saves a real boolean, and delete confirms first.
 */
import type { AdminUser, ServiceArea } from '@nanny-app/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { PermissionsProvider } from '@admin/lib/permissions';
import { ServiceAreasPage } from '@admin/pages/service-areas-page';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

const ok = <T,>(data: T) => HttpResponse.json({ data, error: null });

const ADMIN: AdminUser = {
  id: 1, name: 'Ops Admin', email: 'ops@example.com', role: 'ADMIN',
  permissions: {}, isActive: true, createdAt: '2026-01-01T00:00:00.000Z',
};

const NEW_CAIRO: ServiceArea = {
  id: 7,
  name: 'New Cairo',
  isActive: true,
  source: 'osm',
  updatedAt: '2026-10-15T10:00:00.000Z',
  polygon: {
    type: 'Polygon',
    coordinates: [[[31.4, 30.0], [31.5, 30.0], [31.5, 30.1], [31.4, 30.1], [31.4, 30.0]]],
  },
};

function renderPage() {
  return renderWithProviders(
    <ToastProvider>
      <PermissionsProvider>
        <ServiceAreasPage />
      </PermissionsProvider>
    </ToastProvider>,
  );
}

describe('ServiceAreasPage', () => {
  it('says booking is open everywhere when there are no areas', async () => {
    server.use(http.get('/api/admin/me', () => ok(ADMIN)), http.get('/api/admin/service-areas', () => ok([])));
    renderPage();
    expect(await screen.findByText(/mothers can book anywhere/i)).toBeInTheDocument();
  });

  it('lists an area with its size and status', async () => {
    server.use(http.get('/api/admin/me', () => ok(ADMIN)), http.get('/api/admin/service-areas', () => ok([NEW_CAIRO])));
    renderPage();
    expect(await screen.findByText('New Cairo')).toBeInTheDocument();
    expect(screen.getByText(/10\d\.\d km²/)).toBeInTheDocument();
    expect(screen.getByText(/1 active area/i)).toBeInTheDocument();
  });

  it('deactivates through the action menu, sending a boolean', async () => {
    let body: unknown;
    server.use(
      http.get('/api/admin/me', () => ok(ADMIN)),
      http.get('/api/admin/service-areas', () => ok([NEW_CAIRO])),
      http.patch('/api/admin/service-areas/7', async ({ request }) => {
        body = await request.json();
        return ok({ ...NEW_CAIRO, isActive: false });
      }),
    );
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /actions for new cairo/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /deactivate/i }));
    await waitFor(() => expect(body).toEqual({ isActive: false }));
  });

  it('asks before deleting', async () => {
    let deleted = false;
    server.use(
      http.get('/api/admin/me', () => ok(ADMIN)),
      http.get('/api/admin/service-areas', () => ok([NEW_CAIRO])),
      http.delete('/api/admin/service-areas/7', () => {
        deleted = true;
        return ok(null);
      }),
    );
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /actions for new cairo/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /delete/i }));
    expect(deleted).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: /delete area/i }));
    await waitFor(() => expect(deleted).toBe(true));
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm --filter @nanny-app/admin test -- service-areas-page`
Expected: FAIL (module not found).

- [ ] **Step 3: API functions in `lib/api.ts`**

```ts
export async function fetchServiceAreas(): Promise<ServiceArea[]> {
  const res = await apiClient.get<ApiEnvelope<ServiceArea[]>>('/admin/service-areas');
  return res.data.data;
}

export async function createServiceArea(input: CreateServiceAreaInput): Promise<ServiceArea> {
  const res = await apiClient.post<ApiEnvelope<ServiceArea>>('/admin/service-areas', input);
  return res.data.data;
}

export async function updateServiceArea(id: number, input: UpdateServiceAreaInput): Promise<ServiceArea> {
  const res = await apiClient.patch<ApiEnvelope<ServiceArea>>(`/admin/service-areas/${id}`, input);
  return res.data.data;
}

export async function deleteServiceArea(id: number): Promise<void> {
  await apiClient.delete(`/admin/service-areas/${id}`);
}

export async function lookupServiceArea(q: string): Promise<ServiceAreaLookup> {
  const res = await apiClient.get<ApiEnvelope<ServiceAreaLookup>>('/admin/service-areas/lookup', { params: { q } });
  return res.data.data;
}

export async function fetchMotherPins(): Promise<MotherPin[]> {
  const res = await apiClient.get<ApiEnvelope<MotherPin[]>>('/admin/service-areas/mother-pins');
  return res.data.data;
}
```

Add the types to the file's `@nanny-app/shared` type import.

- [ ] **Step 4: Table — `features/service-areas/service-area-table.tsx`**

Model it on `features/skills/skill-table.tsx` (same imports, `useClientSort`, `ActionMenu`, `ConfirmDialog`), with:
- `canManage = useCanManage('serviceAreas')`, query key `['service-areas']`.
- Sort keys `'id' | 'name' | 'size' | 'status'`, with `size: (a) => polygonAreaKm2(a.polygon)`.
- Columns:
  - `idColumn`.
  - Name (`width: '45%'`).
  - Size, rendered as `` `${polygonAreaKm2(a.polygon).toFixed(1)} km²` ``.
  - Started from: `{ osm: 'Map border', bbox: 'Rough box', drawn: 'Drawn' }[a.source]`.
  - Status: a `Badge`, success for Active and neutral for Inactive.
  - `actionsColumn` with Edit (sets `editing`), Activate/Deactivate (`updateServiceArea(id, { isActive: !a.isActive })`), separator, then Delete (danger).
- Toast titles: `Area updated`, `Area deleted`, `Couldn’t update area`, `Couldn’t delete area`.
- `ConfirmDialog`:
  - Title `Delete area`, confirm label `Delete area`, danger.
  - Message: `` `Delete “${a.name}”? Mothers there can no longer book unless another active area covers them — or everyone can, if it was the last active one.` ``
- `Table` `empty` text: `No areas yet — mothers can book anywhere until you add one.`
- Edit renders `<ServiceAreaFormModal area={editing} onClose={…} />`.

- [ ] **Step 5: Page — `pages/service-areas-page.tsx`**

Copy `skills-page.tsx`'s structure, with these differences:
- Title `Service Areas`.
- Subtitle: `Mothers can book only at an address inside an active area. With no active area, booking is open everywhere.`
- Action button `Add area` (Plus icon) opens `<ServiceAreaFormModal onClose={…} />`.
- Query `['service-areas']` / `fetchServiceAreas`.
- Above the table, when data is loaded, show `<p className="service-areas-summary">`:
  - With n ≥ 1 active areas: `` `${n} active area${n === 1 ? '' : 's'} — booking is limited to ${n === 1 ? 'it' : 'them'}.` ``
  - With none active: `No active area — mothers can book anywhere.`

Create a temporary `features/service-areas/service-area-form.tsx` exporting `ServiceAreaFormModal({ area, onClose }: { area?: ServiceArea; onClose: () => void })` that renders `null`. Task 6 replaces it.

- [ ] **Step 6: Route and nav**

`app.tsx`: import `ServiceAreasPage`, and add next to the settings route:

```tsx
<Route
  path="service-areas"
  element={
    <Guarded section="serviceAreas">
      <ServiceAreasPage />
    </Guarded>
  }
/>
```

`admin-layout.tsx`: import `MapPin` from `./ui` and add after Booking Options:

```ts
  { to: '/service-areas', label: 'Service Areas', icon: MapPin, section: 'serviceAreas' },
```

`global.css`, in the page-specific section:

```css
/* Service Areas — the one-line state of the restriction above the table. */
.service-areas-summary {
  margin: 0 0 var(--space-3, 12px);
  color: var(--color-text-muted);
}
```

(Use the spacing/colour variable names `global.css` actually defines; check with `grep -n "^  --" src/styles/global.css | head -60`.)

- [ ] **Step 7: Run tests and typecheck**

Run: `pnpm --filter @nanny-app/admin test && pnpm --filter @nanny-app/admin typecheck`
Expected: PASS. If an existing test enumerates nav items or sections (e.g. operator permission matrix tests), update it to include Service Areas.

- [ ] **Step 8: Commit**

```bash
git add apps/admin/src/lib/api.ts apps/admin/src/pages/service-areas-page.tsx apps/admin/src/features/service-areas/service-area-table.tsx apps/admin/src/features/service-areas/service-area-form.tsx apps/admin/src/app.tsx apps/admin/src/components/admin-layout.tsx apps/admin/src/styles/global.css apps/admin/src/pages/__tests__/service-areas-page.test.tsx
git commit -m "feat(admin): Service Areas page"
```

---

### Task 6: Admin — the area editor (lookup, editable map, coverage)

**Files:**
- Replace: `apps/admin/src/features/service-areas/service-area-form.tsx`
- Create: `apps/admin/src/features/service-areas/area-map.tsx`
- Modify: `apps/admin/src/styles/global.css`
- Test: `apps/admin/src/features/service-areas/__tests__/service-area-form.test.tsx`

**Interfaces:**
- Consumes: `lookupServiceArea`, `createServiceArea`, `updateServiceArea`, `fetchMotherPins` (Task 5); `CreateServiceAreaSchema`, `isPointInPolygon`, `Polygon`, `Position`, `ServiceArea`, `ServiceAreaSource` (Task 1); `mapsApiKey`, `isMapsAvailable` (`lib/maps.ts`).
- Produces:
  - `AreaMap` with props `{ polygon: Polygon | null; drawing: boolean; pins: MotherPin[]; onChange: (polygon: Polygon | null) => void }`
  - `ServiceAreaFormModal` with props `{ area?: ServiceArea; onClose: () => void }`

- [ ] **Step 1: Write the failing form test (map mocked: jsdom can't run Google Maps)**

```tsx
/**
 * The editor's non-map behaviour: Find fills the outline from the lookup, a
 * lookup with no result says to draw by hand, the coverage count follows the
 * outline, and Save sends a closed polygon with its source. The map itself is
 * Google's and is replaced by a stub that reports what it was given.
 */
import type { AdminUser, MotherPin, Polygon, ServiceAreaLookup } from '@nanny-app/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { ServiceAreaFormModal } from '@admin/features/service-areas/service-area-form';
import { PermissionsProvider } from '@admin/lib/permissions';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

vi.mock('@admin/lib/maps', () => ({ isMapsAvailable: () => true, mapsApiKey: () => 'test' }));
vi.mock('@admin/features/service-areas/area-map', () => ({
  AreaMap: ({ polygon }: { polygon: Polygon | null }) => (
    <div data-testid="area-map">{polygon ? `${polygon.coordinates[0].length - 1} corners` : 'no outline'}</div>
  ),
}));

const ok = <T,>(data: T) => HttpResponse.json({ data, error: null });
const ADMIN: AdminUser = {
  id: 1, name: 'Ops', email: 'ops@example.com', role: 'ADMIN',
  permissions: {}, isActive: true, createdAt: '2026-01-01T00:00:00.000Z',
};
const SQUARE: Polygon = {
  type: 'Polygon',
  coordinates: [[[31.4, 30.0], [31.5, 30.0], [31.5, 30.1], [31.4, 30.1], [31.4, 30.0]]],
};
const PINS: MotherPin[] = [
  { latitude: 30.05, longitude: 31.45 }, // inside
  { latitude: 30.0444, longitude: 31.2357 }, // downtown, outside
];

function renderForm() {
  return renderWithProviders(
    <ToastProvider>
      <PermissionsProvider>
        <ServiceAreaFormModal onClose={() => {}} />
      </PermissionsProvider>
    </ToastProvider>,
  );
}

describe('ServiceAreaFormModal', () => {
  it('fills the outline from a lookup and counts mothers inside', async () => {
    const found: ServiceAreaLookup = { displayName: 'New Cairo, Cairo', polygon: SQUARE, source: 'osm' };
    server.use(
      http.get('/api/admin/me', () => ok(ADMIN)),
      http.get('/api/admin/service-areas/mother-pins', () => ok(PINS)),
      http.get('/api/admin/service-areas/lookup', () => ok(found)),
    );
    renderForm();
    await userEvent.type(screen.getByLabelText(/area name/i), 'New Cairo');
    await userEvent.click(screen.getByRole('button', { name: /find on map/i }));
    expect(await screen.findByText('4 corners')).toBeInTheDocument();
    expect(screen.getByText(/1 of 2 mothers’ addresses are inside/i)).toBeInTheDocument();
    expect(screen.getByText(/check the border before saving/i)).toBeInTheDocument();
  });

  it('says to draw by hand when the lookup finds nothing', async () => {
    server.use(
      http.get('/api/admin/me', () => ok(ADMIN)),
      http.get('/api/admin/service-areas/mother-pins', () => ok(PINS)),
      http.get('/api/admin/service-areas/lookup', () =>
        HttpResponse.json({ data: null, error: 'Nothing called “Atlantis” was found on the map. Draw the area by hand.' }, { status: 404 }),
      ),
    );
    renderForm();
    await userEvent.type(screen.getByLabelText(/area name/i), 'Atlantis');
    await userEvent.click(screen.getByRole('button', { name: /find on map/i }));
    expect(await screen.findByText(/draw the area by hand/i)).toBeInTheDocument();
  });

  it('saves the name, the closed polygon and where it came from', async () => {
    let body: unknown;
    server.use(
      http.get('/api/admin/me', () => ok(ADMIN)),
      http.get('/api/admin/service-areas/mother-pins', () => ok(PINS)),
      http.get('/api/admin/service-areas/lookup', () => ok({ displayName: 'New Cairo', polygon: SQUARE, source: 'osm' })),
      http.post('/api/admin/service-areas', async ({ request }) => {
        body = await request.json();
        return ok({ id: 1, name: 'New Cairo', polygon: SQUARE, isActive: true, source: 'osm', updatedAt: '' });
      }),
    );
    renderForm();
    await userEvent.type(screen.getByLabelText(/area name/i), 'New Cairo');
    await userEvent.click(screen.getByRole('button', { name: /find on map/i }));
    await screen.findByText('4 corners');
    await userEvent.click(screen.getByRole('button', { name: /add area/i }));
    await waitFor(() =>
      expect(body).toEqual({ name: 'New Cairo', polygon: SQUARE, source: 'osm', isActive: true }),
    );
  });

  it('will not save without an outline', async () => {
    server.use(http.get('/api/admin/me', () => ok(ADMIN)), http.get('/api/admin/service-areas/mother-pins', () => ok(PINS)));
    renderForm();
    await userEvent.type(screen.getByLabelText(/area name/i), 'New Cairo');
    expect(screen.getByRole('button', { name: /add area/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm --filter @nanny-app/admin test -- service-area-form`
Expected: FAIL (the stub renders nothing).

- [ ] **Step 3: Implement `area-map.tsx`**

```tsx
import { useEffect, useRef } from 'react';

import { APIProvider, Map, useMap } from '@vis.gl/react-google-maps';
import type { MotherPin, Polygon, Position } from '@nanny-app/shared';
import { isPointInPolygon } from '@nanny-app/shared';

import { mapsApiKey } from '@admin/lib/maps';

/** New Cairo, where the first area is expected. */
const DEFAULT_CENTER = { lat: 30.02, lng: 31.47 };

type AreaMapProps = {
  polygon: Polygon | null;
  /** Each map click adds a corner (the outline closes itself from 3). */
  drawing: boolean;
  pins: MotherPin[];
  onChange: (polygon: Polygon | null) => void;
};

/**
 * The outline on Google's map as an editable polygon: drag a corner to move
 * it, drag a midpoint to add one, right-click a corner to remove it. Mothers'
 * default addresses are drawn as dots, green inside the outline, grey outside.
 */
export function AreaMap(props: AreaMapProps) {
  return (
    <APIProvider apiKey={mapsApiKey()}>
      <div className="area-map">
        <Map
          className="area-map-canvas"
          defaultCenter={DEFAULT_CENTER}
          defaultZoom={11}
          gestureHandling="greedy"
          disableDefaultUI
          clickableIcons={false}
          draggableCursor={props.drawing ? 'crosshair' : undefined}
        />
        <EditablePolygon {...props} />
        <Pins pins={props.pins} polygon={props.polygon} />
      </div>
    </APIProvider>
  );
}

function toPath(polygon: Polygon): google.maps.LatLngLiteral[] {
  return polygon.coordinates[0].slice(0, -1).map(([lng, lat]) => ({ lat, lng }));
}

function fromPath(path: google.maps.MVCArray<google.maps.LatLng>): Polygon | null {
  const ring: Position[] = path.getArray().map((p) => [p.lng(), p.lat()]);
  if (ring.length < 3) return null;
  return { type: 'Polygon', coordinates: [[...ring, ring[0] as Position]] };
}

function EditablePolygon({ polygon, drawing, onChange }: AreaMapProps) {
  const map = useMap();
  const shape = useRef<google.maps.Polygon | null>(null);
  const draft = useRef<google.maps.LatLngLiteral[]>([]);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Draw (or redraw) the outline whenever it changes from outside — a lookup,
  // "Clear", opening an existing area. Edits made on the map report through
  // onChange and come back here as the same path, which is a cheap no-op.
  useEffect(() => {
    if (!map) return;
    shape.current?.setMap(null);
    if (!polygon) {
      shape.current = null;
      return;
    }
    const p = new google.maps.Polygon({
      map,
      paths: toPath(polygon),
      editable: true,
      strokeColor: getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || undefined,
      strokeWeight: 2,
      fillOpacity: 0.15,
    });
    const path = p.getPath();
    const report = () => onChangeRef.current(fromPath(path));
    const listeners = [
      path.addListener('set_at', report),
      path.addListener('insert_at', report),
      path.addListener('remove_at', report),
      p.addListener('contextmenu', (e: google.maps.PolyMouseEvent) => {
        if (e.vertex !== undefined && path.getLength() > 3) path.removeAt(e.vertex);
      }),
    ];
    shape.current = p;
    const bounds = new google.maps.LatLngBounds();
    toPath(polygon).forEach((pt) => bounds.extend(pt));
    map.fitBounds(bounds, 40);
    return () => {
      listeners.forEach((l) => l.remove());
      p.setMap(null);
    };
    // Only a new outline from outside redraws; map edits keep the same object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, polygon === null ? null : polygon.coordinates[0].length, drawing]);

  // Draw mode: each click adds a corner; from three corners the outline exists.
  useEffect(() => {
    if (!map || !drawing) return;
    draft.current = [];
    const listener = map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      draft.current = [...draft.current, { lat: e.latLng.lat(), lng: e.latLng.lng() }];
      if (draft.current.length >= 3) {
        const ring: Position[] = draft.current.map(({ lat, lng }) => [lng, lat]);
        onChangeRef.current({ type: 'Polygon', coordinates: [[...ring, ring[0] as Position]] });
      }
    });
    return () => listener.remove();
  }, [map, drawing]);

  return null;
}

function Pins({ pins, polygon }: { pins: MotherPin[]; polygon: Polygon | null }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const dots = pins.map(
      (pin) =>
        new google.maps.Circle({
          map,
          center: { lat: pin.latitude, lng: pin.longitude },
          radius: 60,
          strokeWeight: 0,
          fillOpacity: 0.9,
          fillColor:
            polygon && isPointInPolygon(pin.latitude, pin.longitude, polygon)
              ? getComputedStyle(document.documentElement).getPropertyValue('--color-success').trim()
              : getComputedStyle(document.documentElement).getPropertyValue('--color-text-muted').trim(),
          clickable: false,
        }),
    );
    return () => dots.forEach((d) => d.setMap(null));
  }, [map, pins, polygon]);
  return null;
}
```

Notes for the implementer:
- Google Maps takes colours as strings, so they are read from the CSS tokens at runtime. That keeps literals out of components; confirm the token names in `global.css`.
- The redraw dependency is deliberately coarse. In particular, the outline must not be redrawn on every corner drag, which would interrupt the drag. Check by hand (Step 6) that:
  - dragging a corner works;
  - "Find" replaces the outline;
  - "Clear" removes it.

  If a Find result happens to have the same corner count as the current outline, add a `version` counter prop bumped by the form on Find/Clear/open and depend on that instead.

- [ ] **Step 4: Implement `service-area-form.tsx`**

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import {
  CreateServiceAreaSchema,
  isPointInPolygon,
  polygonAreaKm2,
  type Polygon,
  type ServiceArea,
  type ServiceAreaSource,
} from '@nanny-app/shared';

import { Button, Field, FormModal, Input, Select, useToast } from '@admin/components/ui';
import { AreaMap } from '@admin/features/service-areas/area-map';
import { createServiceArea, fetchMotherPins, lookupServiceArea, updateServiceArea } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { firstIssueMessage } from '@admin/lib/form-errors';
import { isMapsAvailable } from '@admin/lib/maps';

type Props = {
  /** The area to edit; omit to add one. */
  area?: ServiceArea;
  onClose: () => void;
};

/**
 * Add or edit a service area. Find looks the name up on OpenStreetMap and draws
 * its border as a starting shape — which can be badly off for informal names,
 * so the dialog says to check it — and the admin drags corners or draws by
 * hand. The coverage line counts mothers' default addresses inside.
 */
export function ServiceAreaFormModal({ area, onClose }: Props) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(area?.name ?? '');
  const [polygon, setPolygon] = useState<Polygon | null>(area?.polygon ?? null);
  const [source, setSource] = useState<ServiceAreaSource>(area?.source ?? 'drawn');
  const [isActive, setIsActive] = useState(area?.isActive ?? true);
  const [drawing, setDrawing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const mapsAvailable = isMapsAvailable();

  const { data: pins = [] } = useQuery({ queryKey: ['service-area-pins'], queryFn: fetchMotherPins });

  const inside = useMemo(
    () => (polygon ? pins.filter((p) => isPointInPolygon(p.latitude, p.longitude, polygon)).length : 0),
    [pins, polygon],
  );

  const find = useMutation({
    mutationFn: () => lookupServiceArea(name.trim()),
    onSuccess: (found) => {
      setDrawing(false);
      setPolygon(found.polygon);
      setSource(found.source);
      setNotice(
        found.source === 'osm'
          ? `Found “${found.displayName}”. Check the border before saving — informal names can be off.`
          : `No border is mapped for “${found.displayName}”, so this is a rough box. Drag the corners to fit.`,
      );
    },
    onError: (err) => setNotice(apiErrorMessage(err)),
  });

  const save = useMutation({
    mutationFn: (run: () => Promise<ServiceArea>) => run(),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['service-areas'] });
      toast.success(area ? 'Area updated' : 'Area added', saved.name);
      onClose();
    },
    onError: (err) => setFormError(apiErrorMessage(err)),
  });

  function submit() {
    setFormError(null);
    const parsed = CreateServiceAreaSchema.safeParse({ name: name.trim(), polygon, source, isActive });
    if (!parsed.success) return setFormError(firstIssueMessage(parsed.error));
    save.mutate(() => (area ? updateServiceArea(area.id, parsed.data) : createServiceArea(parsed.data)));
  }

  return (
    <FormModal
      title={area ? 'Edit area' : 'Add area'}
      submitLabel={area ? 'Save changes' : 'Add area'}
      busy={save.isPending}
      submitDisabled={name.trim() === '' || polygon === null}
      error={formError}
      onSubmit={submit}
      onClose={onClose}
    >
      <div className="area-form-find">
        <Field label="Area name">
          <Input value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="New Cairo" />
        </Field>
        <Button
          variant="secondary"
          disabled={name.trim() === '' || find.isPending || !mapsAvailable}
          onClick={() => find.mutate()}
        >
          Find on map
        </Button>
      </div>
      {notice && <p className="area-form-notice">{notice}</p>}

      {mapsAvailable ? (
        <>
          <AreaMap polygon={polygon} drawing={drawing} pins={pins} onChange={(p) => { setPolygon(p); if (p && drawing) setSource('drawn'); }} />
          <div className="area-form-tools">
            <Button
              variant="secondary"
              onClick={() => {
                setPolygon(null);
                setDrawing(true);
                setNotice('Click the map to place each corner. From three corners the outline appears; drag corners to adjust.');
              }}
            >
              Draw by hand
            </Button>
            <span className="area-form-hint">Drag a corner to move it, a midpoint to add one; right-click a corner to remove it.</span>
          </div>
          {polygon && (
            <p className="area-form-coverage">
              {polygonAreaKm2(polygon).toFixed(1)} km² · {inside} of {pins.length} mothers’ addresses are inside
            </p>
          )}
        </>
      ) : (
        <p className="area-form-notice">Drawing an area needs the Google Maps key (VITE_GOOGLE_MAPS_API_KEY). You can still switch existing areas on and off.</p>
      )}

      <Field label="Status" hint="Only active areas limit booking.">
        <Select
          value={isActive ? 'active' : 'inactive'}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ]}
          onChange={(v) => setIsActive(v === 'active')}
        />
      </Field>
    </FormModal>
  );
}
```

Check that `Button` supports `variant="secondary"` (see `components/ui/button.tsx`) and adjust to its real prop names. The test expects the POST body to be exactly `{ name, polygon, source, isActive }`, which is what `CreateServiceAreaSchema` parses to.

- [ ] **Step 5: Styles in `global.css`**

```css
/* Service area editor — Find row, map, tools and coverage line. */
.area-form-find { display: flex; gap: var(--space-2, 8px); align-items: flex-end; }
.area-form-find .field { flex: 1; }
.area-form-notice { margin: var(--space-2, 8px) 0; color: var(--color-text-muted); }
.area-map-canvas { height: 420px; border-radius: var(--radius-md); overflow: hidden; }
.area-form-tools { display: flex; flex-wrap: wrap; gap: var(--space-2, 8px); align-items: center; margin-top: var(--space-2, 8px); }
.area-form-hint { color: var(--color-text-muted); font-size: 0.875rem; }
.area-form-coverage { margin: var(--space-2, 8px) 0 0; font-weight: 600; }
```

Replace the variable names with the ones `global.css` defines (check `.address-map-canvas` for the matching map rule).

- [ ] **Step 6: Run the tests, then try it by hand**

Run: `pnpm --filter @nanny-app/admin test && pnpm --filter @nanny-app/admin typecheck`
Expected: PASS.

By hand, this needs a Google Maps browser key in `apps/admin/.env.local` (`VITE_GOOGLE_MAPS_API_KEY`). If there is none on this machine, ask the user for one or skip and say so.
1. Run `pnpm --filter @nanny-app/admin dev` in tmux `nanny-app-admin-dev` against the test backend.
2. Sign in as the seeded admin.
3. Add "New Cairo" → Find → drag a corner → right-click a corner → save.
4. Toggle it off and on, and delete a second area.
5. Screenshot the editor with the outline and pins for the user.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/features/service-areas/service-area-form.tsx apps/admin/src/features/service-areas/area-map.tsx apps/admin/src/features/service-areas/__tests__/service-area-form.test.tsx apps/admin/src/styles/global.css
git commit -m "feat(admin): draw a service area from its OpenStreetMap border"
```

---

### Task 7: Mobile — block Continue on an outside address

**Files:**
- Modify: `apps/mobile/src/components/BookingLocationSection.tsx`
- Modify: `apps/mobile/src/components/styles/booking-location-section.styles.ts`
- Modify: `apps/mobile/src/screens/parent/BookingDatePickerScreen.tsx:352-366, 579-586, 617`
- Test: `apps/mobile/src/components/__tests__/BookingLocationSection.test.tsx`
- Fix fixtures: any mobile test/preview building `BookingOptions` gets `serviceAreaNames: []` (`grep -rln "earliestStartWallClock" apps/mobile/src`)

**Interfaces:**
- Consumes: `Address.inServiceArea`, `BookingOptions.serviceAreaNames`, `outsideServiceAreaMessage` (Task 1).
- Produces: new props on `BookingLocationSection`:
  - `serviceAreaNames?: string[]`
  - `onOutsideAreaChange?: (outside: boolean) => void`, called with whether the selected address is outside.

- [ ] **Step 1: Write the failing tests**

Append to `BookingLocationSection.test.tsx`. Extend `Host` to pass the new props through:

```tsx
function OutsideHost({ onOutside, names = ['New Cairo'] }: { onOutside: (o: boolean) => void; names?: string[] }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  return (
    <BookingLocationSection
      selectedId={selectedId}
      onSelect={setSelectedId}
      serviceAreaNames={names}
      onOutsideAreaChange={onOutside}
    />
  );
}

function renderOutside(onOutside: (o: boolean) => void, names?: string[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <OutsideHost onOutside={onOutside} names={names} />
    </QueryClientProvider>,
  );
}

describe('BookingLocationSection — service areas', () => {
  it('tags an outside address and explains when it is selected', async () => {
    mockApi.get.mockReturnValue(envelope([
      address({ id: 1, inServiceArea: false }),
      address({ id: 2, isDefault: false, label: 'Work', inServiceArea: true }),
    ]));
    const onOutside = jest.fn();

    const { getByText, queryByText } = renderOutside(onOutside);

    await waitFor(() => expect(getByText('Not in our service area yet')).toBeTruthy());
    expect(getByText("We don't serve this area yet. We're currently in: New Cairo.")).toBeTruthy();
    await waitFor(() => expect(onOutside).toHaveBeenLastCalledWith(true));

    fireEvent.press(getByText('Work'));

    await waitFor(() => expect(onOutside).toHaveBeenLastCalledWith(false));
    expect(queryByText(/We don't serve this area yet/)).toBeNull();
  });

  it('treats an address with no flag as inside (older backend)', async () => {
    mockApi.get.mockReturnValue(envelope([address({ id: 1 })]));
    const onOutside = jest.fn();
    const { queryByText } = renderOutside(onOutside, []);
    await waitFor(() => expect(onOutside).toHaveBeenLastCalledWith(false));
    expect(queryByText('Not in our service area yet')).toBeNull();
  });

  it('re-checks when she adds an address that is outside', async () => {
    mockApi.get.mockReturnValueOnce(envelope([address({ id: 1, inServiceArea: true })]));
    mockApi.post.mockReturnValue(envelope(address({ id: 9, label: 'Work', isDefault: false, inServiceArea: false })));
    mockApi.get.mockReturnValue(envelope([
      address({ id: 1, inServiceArea: true }),
      address({ id: 9, label: 'Work', isDefault: false, inServiceArea: false }),
    ]));
    const onOutside = jest.fn();
    const { getByText } = renderOutside(onOutside);

    await waitFor(() => expect(onOutside).toHaveBeenLastCalledWith(false));
    fireEvent.press(getByText('Add new'));
    fireEvent.press(getByText('submit stub'));

    await waitFor(() => expect(onOutside).toHaveBeenLastCalledWith(true));
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm --filter @nanny-app/mobile test -- BookingLocationSection`
Expected: FAIL (no tag text; `onOutsideAreaChange` never called).

- [ ] **Step 3: Implement in `BookingLocationSection.tsx`**

Add the props and import `outsideServiceAreaMessage` from `@nanny-app/shared`:

```tsx
type Props = {
  /** The address the booking will be made at; null until one is chosen. */
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  /** Active service areas, for the note under an outside address. */
  serviceAreaNames?: string[];
  /** Whether the selected address is outside every active area — Continue waits on it. */
  onOutsideAreaChange?: (outside: boolean) => void;
};
```

In the body:

```tsx
  // An address the backend marks outside every active area can't be booked at.
  // No flag (an older backend) reads as inside; the server checks regardless.
  const selected = addresses?.find((a) => a.id === selectedId);
  const selectedOutside = selected?.inServiceArea === false;
  useEffect(() => {
    onOutsideAreaChange?.(selectedOutside);
  }, [selectedOutside, onOutsideAreaChange]);
```

(Place this effect before the `if (!addresses) return null;` early return, next to the preselect effect.)

Inside each card's `cardBody`, after the area line:

```tsx
                  {address.inServiceArea === false && (
                    <View style={styles.outsideTag}>
                      <Text style={styles.outsideTagText}>Not in our service area yet</Text>
                    </View>
                  )}
```

After the list (before `<AddressFormSheet …/>`):

```tsx
      {selectedOutside && (
        <View style={styles.outsideNote} accessibilityRole="alert">
          <Ionicons name="information-circle-outline" size={18} color={colors.error} />
          <Text style={styles.outsideNoteText}>{outsideServiceAreaMessage(serviceAreaNames)}</Text>
        </View>
      )}
```

Destructure `serviceAreaNames = []` in the parameters. Check `useCreateAddress` invalidates the addresses query on success, so the new card arrives with its flag. If it doesn't, add `queryClient.invalidateQueries({ queryKey: [addresses key] })` there.

Styles (`booking-location-section.styles.ts`), theme tokens only:

```ts
  // An address outside every active service area.
  outsideTag: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.errorLight,
  },
  outsideTagText: {
    ...typeScale.caption,
    color: colors.error,
  },
  outsideNote: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.errorLight,
  },
  outsideNoteText: {
    ...typeScale.bodySm,
    color: colors.textPrimary,
    flex: 1,
  },
```

(Confirm the `spacing`/`borderRadius`/`typeScale` keys exist; e.g. `typeScale.bodySm` may be called something else. Use the closest existing token, never a literal.)

- [ ] **Step 4: Block Continue in `BookingDatePickerScreen.tsx`**

```tsx
  const [addressOutside, setAddressOutside] = useState(false);
  …
  const canContinue =
    !!options &&
    !!startWall &&
    !!endWall &&
    durationMinutes !== null &&
    durationMinutes > 0 &&
    !missingLocation &&
    !addressOutside;
```

In `ctaLabel`, after the `missingLocation` branch:

```tsx
      : missingLocation
        ? 'Add your address'
        : addressOutside
          ? 'Choose an address we serve'
          : breakdown
```

At line ~617:

```tsx
<BookingLocationSection
  selectedId={addressId}
  onSelect={handleSelectAddress}
  serviceAreaNames={options?.serviceAreaNames ?? []}
  onOutsideAreaChange={setAddressOutside}
/>
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `pnpm --filter @nanny-app/mobile test -- BookingLocationSection BookingDatePicker && pnpm --filter @nanny-app/mobile typecheck`
Expected:
- All PASS.
- Fix fixtures that build `BookingOptions` (add `serviceAreaNames: []`) if the typecheck lists them.
- Then run the whole mobile suite: `pnpm --filter @nanny-app/mobile test` (`layout-guards` must still pass).

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/BookingLocationSection.tsx apps/mobile/src/components/styles/booking-location-section.styles.ts apps/mobile/src/screens/parent/BookingDatePickerScreen.tsx apps/mobile/src/components/__tests__/BookingLocationSection.test.tsx
# plus fixtures that gained serviceAreaNames
git commit -m "feat(mobile): say when a booking address is outside the service area"
```

---

### Task 8: Device test, sweep, docs

**Files:**
- Modify: `apps/backend/test/e2e/seed-mobile.ts` (clear service areas every seed)
- Modify: `apps/mobile/e2e/scripts/advance.js` (`service-area-set`, `service-area-clear`)
- Create: `apps/mobile/e2e/flows/c19-service-area.yaml`
- Modify: `apps/mobile/e2e/README.md` (flow list + steps)

**Interfaces:**
- Consumes: the admin HTTP routes (Task 4) and the mobile copy (Task 7).
- Produces: flow C19.

- [ ] **Step 1: The seeder leaves no area behind**

In `seed-mobile.ts`, where it soft-deletes earlier runs' rows (near the `booking.updateMany` at ~line 329), add:

```ts
  // Every flow starts unrestricted; C19 is the only one that draws an area,
  // and a run that dies mid-flow must not leave the rest of the suite blocked.
  await prisma.serviceArea.updateMany({ where: { deletedAt: null }, data: { deletedAt: new Date() } });
```

- [ ] **Step 2: advance.js steps**

Before the `STEPS` table:

```js
/**
 * An active service area around New Cairo — away from the seeded mother's
 * address (downtown, 30.0444, 31.2357), so her booking is refused. The seeder
 * clears every area before each flow; `service-area-clear` does it sooner.
 */
function serviceAreaSet() {
  var adminToken = signIn(ADMIN_EMAIL, ADMIN_PASSWORD);
  var area = call('POST', adminToken, '/admin/service-areas', {
    name: 'New Cairo',
    source: 'drawn',
    isActive: true,
    polygon: {
      type: 'Polygon',
      coordinates: [[[31.40, 29.98], [31.52, 29.98], [31.52, 30.06], [31.40, 30.06], [31.40, 29.98]]],
    },
  });
  output.areaId = String(area.id);
}

function serviceAreaClear() {
  var adminToken = signIn(ADMIN_EMAIL, ADMIN_PASSWORD);
  var areas = call('GET', adminToken, '/admin/service-areas');
  for (var i = 0; i < areas.length; i++) {
    call('DELETE', adminToken, '/admin/service-areas/' + areas[i].id);
  }
}
```

Register `'service-area-set': serviceAreaSet, 'service-area-clear': serviceAreaClear,` in `STEPS`.

- [ ] **Step 3: The flow `c19-service-area.yaml`**

```yaml
# C19 — booking is limited to the admin's service areas. With an active area
# around New Cairo, the seeded mother's downtown address is tagged on the
# "Where" step, the note names the area, and Continue stays disabled. The area
# is drawn over HTTP as the admin; the app only ever acts as the mother.
#
# Every other flow books with no area at all — the seeder clears them before
# each flow — so this one also clears its own on the way out.
appId: com.nannyapp.mobile
onFlowComplete:
  - runScript:
      file: ../scripts/advance.js
      env:
        ADVANCE: service-area-clear
---
- runScript:
    file: ../scripts/advance.js
    env:
      ADVANCE: service-area-set

- runFlow: _launch.yaml

- tapOn: 'Book care'
- extendedWaitUntil:
    visible: 'Pick a day'
    timeout: 30000
- tapOn:
    id: 'booking.day'
    index: 0

- scrollUntilVisible:
    element: 'Not in our service area yet'
    direction: DOWN
    centerElement: true
- assertVisible: "We don't serve this area yet. We're currently in: New Cairo."
- assertVisible: 'Choose an address we serve'
- assertVisible:
    id: 'booking.cta'
    enabled: false
```

The `Book care` / `booking.day` steps mirror `_book-to-review.yaml`. If `assertVisible` with `enabled: false` isn't supported by the lab's Maestro version, assert the CTA label instead (already done) and tap it, then assert `Who needs care?` is **not** visible (`assertNotVisible`).

- [ ] **Step 4: Run C19 twice, then a booking flow to prove nothing leaked**

Lab services must be up (see `apps/mobile/e2e/README.md`). In tmux:

```bash
tmux kill-session -t nanny-app-c19 2>/dev/null
tmux new -d -s nanny-app-c19 "cd /home/mark/projects/nanny-app && ANDROID_SERIAL=emulator-5562 E2E_METRO_PORT=8090 PATH=\$HOME/Android/Sdk/platform-tools:\$PATH pnpm test:e2e:mobile --paymob=fake c19-service-area c19-service-area a01-booking-happy-path 2>&1 | tee ~/logs/nanny-app-c19.log"
```

The backend in tmux `nanny-app-backend` must be restarted first, so it carries Tasks 2–4 and the migration (`start:test` applies migrations on start; check its log).
Expected: `3/3 flows passed`. If C19 fails, read the failure screenshot under `~/.maestro/tests/<ts>/` before changing anything.

- [ ] **Step 5: UI sweep of the "Where" step with the tag**

The booking date-picker sweep flow is the one that shows the "Where" step. Find it with `grep -ln "Pick a day" apps/mobile/e2e/flows/sweep/*.yaml`. Then:
- Add `service-area-set` at its start and `service-area-clear` in its `onFlowComplete`, so the tagged state is captured.
- Run the worst cell:

`node apps/mobile/e2e/ui-sweep.mjs --paymob=fake --cells=small-1.3-3btn --flows=<that flow>` (in tmux `nanny-app-sweep-area`)

Look at the shots. The tag and the note must wrap, not truncate, at 360dp/1.3×, and the CTA label must fit.

- [ ] **Step 6: README**

In `apps/mobile/e2e/README.md`:
- Add C19 to the flow list: "Service areas: an active area away from the mother blocks the Where step."
- Add `service-area-set` / `service-area-clear` to the `advance.js` step catalogue.
- Note that the seeder clears all areas before every flow.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/test/e2e/seed-mobile.ts apps/mobile/e2e/scripts/advance.js apps/mobile/e2e/flows/c19-service-area.yaml apps/mobile/e2e/README.md
# plus the sweep flow if changed
git commit -m "test(mobile): e2e flow for service areas"
```

---

## Done when

- Shared, backend unit, backend integration (`a34`, `a21`, `a01`), admin and mobile suites pass, and `pnpm typecheck` passes.
- C19 passes twice in a row, and A01 passes after it (no leaked restriction).
- The sweep shot of the tagged "Where" step reads correctly at small-1.3.
- The admin editor has been tried by hand with a Maps key (or the user was told it couldn't be).
- Deploy note for the user: the migration `add_service_areas` must be applied to the production DB (`pnpm db:migrate`) before the backend that reads it ships.
