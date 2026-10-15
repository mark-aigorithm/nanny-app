# Service areas (book only inside admin-drawn areas) — design

**Date:** 2026-10-15
**Status:** approved in chat; awaiting spec review

## Problem

The platform launches in one district — New Cairo / التجمع الخامس — and nannies can only
cover so much ground. Today any mother anywhere in Egypt can request a booking; the request is
broadcast and either goes unanswered or sends a nanny across the city.

## Goal

The admin defines one or more **service areas** as shapes on a map. A mother can book only when
the booking's address lies inside an active area. Adding an area starts from its name: the
console looks the name up and draws the real border, which the admin adjusts by dragging corners.

## Decisions

| Question | Decision |
|---|---|
| What is checked | The **booking's address** (the one picked on the "Where" step), not her default. A New Cairo mother booking at an address in Maadi is refused. |
| How "inside" is decided | Point-in-polygon on the address's latitude/longitude. The typed `area`/`governorate` text is ignored — she can edit it, and Google returns "New Cairo 1/2/3". |
| Where a border comes from | OpenStreetMap Nominatim (`polygon_geojson=1`, `countrycodes=eg`), called by the backend. Google's APIs return only a viewport, never a border. A spike on 2026-10-15 found "New Cairo" returns the official district (319 points); "التجمع الخامس" returns a 10 km² block that misses most of the settlement. So the lookup is **a starting shape the admin must check**, never saved unseen. |
| No border found | Start from the result's bounding box; with no result at all, the admin draws by hand. |
| No active areas | Booking is allowed everywhere. The feature is off until the admin switches an area on, so deploying it changes nothing. |
| Page-wide switch (added 2026-10-15) | "Limit booking to service areas" at the top of the page, stored as `service_areas_enabled` in `app_settings`, default on. Off lifts the limit for everyone while keeping every area and its status; on restores it. |
| Mother outside | Signs up and browses as normal. Blocked on the booking "Where" step with a note listing the served areas. |
| Existing bookings | Never re-checked. The check runs only when a booking is created. |
| Storage of the shape | GeoJSON `Polygon` in a `Json` column, checked in TypeScript. A handful of areas does not need PostGIS geometry, and Prisma has no type for it. |
| Admin access | A new console section `serviceAreas` ("Service Areas", `/service-areas`). ADMIN/SUPERUSER have it; an OPERATOR needs it granted. |

Out of scope: Arabic area names, a "tell me when you're here" waitlist, blocking at sign-up,
restricting nannies by area.

## Backend

### Model (`prisma/schema.prisma`)

```prisma
/// An area mothers can book in. While at least one is active, a booking's
/// address must fall inside one; with none active, booking is unrestricted.
model ServiceArea {
  id        Int       @id @default(autoincrement())
  name      String
  /// GeoJSON Polygon, [lng, lat] order, outer ring only, closed.
  polygon   Json
  isActive  Boolean   @default(true) @map("is_active")
  /// 'osm' when it started from a lookup, 'drawn' when drawn by hand.
  source    String
  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")
  deletedAt DateTime? @map("deleted_at")

  @@index([isActive, deletedAt])
  @@map("service_areas")
}
```

Migration `add_service_areas`. Int ids, like `Address`.

### Shared (`packages/shared/src/service-area.ts`)

- `PolygonSchema`: GeoJSON `{ type: 'Polygon', coordinates: [ring] }` with 4–500 positions, closed
  (first = last), each `[lng, lat]` in range. Holes and MultiPolygons are refused.
- `ServiceAreaSchema` (`id`, `name`, `polygon`, `isActive`, `source`, `updatedAt`),
  `CreateServiceAreaSchema` (`name` 1–100, `polygon`, `isActive?`, `source`),
  `UpdateServiceAreaSchema` (all optional).
- `ServiceAreaLookupSchema`: `{ name, displayName, polygon, source: 'osm' | 'bbox' }`.
- `isPointInPolygon(lat, lng, polygon)`: ray casting. Lives in shared so the admin's mother-pin
  preview and the backend use the same function.
- `AddressSchema` gains `inServiceArea: boolean`.
- `BookingOptions` (`GET /bookings/options`) gains `serviceAreaNames: string[]` (active areas,
  for the mobile note; empty means unrestricted).

### Service (`src/services/service-area.service.ts`)

- `listServiceAreas()`, `createServiceArea()`, `updateServiceArea()`, `deleteServiceArea()` (soft).
- `getActiveServiceAreas()`.
- `isInServiceArea(lat, lng, areas?)`: true when no area is active, or the point is in any active one.
- `lookupServiceArea(query)`:
  - Calls Nominatim with a `User-Agent` naming the app and a 10 s timeout.
  - Takes the first `Polygon`/`MultiPolygon` result (largest ring of a multipolygon).
  - Simplifies it with Douglas–Peucker (tolerance about 25 m, at most 150 points).
  - With no polygon, falls back to the first result's bounding box. With no result at all, returns 404.
  - Nominatim's usage policy (1 req/s, identified client) suits occasional admin lookups. The
    route is admin-only and rate-limited.
- `listMotherPins()`: the latitude/longitude of every live mother's default address, no names or
  ids. Used by the admin page's coverage preview.

### Enforcement (`booking.service.ts` `createBooking`)

- **Where:** right after the `home` address lookup (around line 1192), before the idempotency check.
- **What:** `isInServiceArea(home.latitude, home.longitude)`.
- **On failure:** `errors.badRequest("We don't serve this area yet. We're currently in: New Cairo, ….")`.
  Names are joined in creation order.

### Addresses (`address.service.ts`)

`listAddresses` (and the create/update responses) load the active areas once and set
`inServiceArea` on each address.

### Routes (`admin.routes.ts`, all under the `serviceAreas` section in `ADMIN_ROUTE_PERMISSIONS`)

| Route | Purpose |
|---|---|
| `GET /admin/service-areas` | List (live, newest first) |
| `POST /admin/service-areas` | Create |
| `PATCH /admin/service-areas/:id` | Rename, reshape, switch on/off |
| `DELETE /admin/service-areas/:id` | Soft delete |
| `GET /admin/service-areas/lookup?q=` | Nominatim lookup, returns a `ServiceAreaLookup` |
| `GET /admin/service-areas/mother-pins` | Default-address points for the preview |

`ADMIN_SECTIONS`, `ADMIN_SECTION_LABELS` and `ADMIN_SECTION_PATHS` gain `serviceAreas`.

## Admin console

### Service Areas page (`pages/service-areas-page.tsx`, `features/service-areas/`)

- **List:** name, size in km², source, an active switch, Edit and Delete. An empty state says
  booking is open everywhere until an area is added. A banner says how many areas are active.
- **Editor** (a full-width panel; the console's existing Google map via `@vis.gl/react-google-maps`):
  1. **Find:** a name field and a **Find** button call `lookup`. The result's polygon is drawn as
     an editable `google.maps.Polygon` (`editable: true`). Google gives corner drag, midpoint
     insert and, through a vertex right-click handler, corner removal.
  2. **Draw instead:** clears the shape and adds a corner per map click. The shape closes once it
     has 3 corners.
  3. **Coverage preview:** mother pins are drawn green (inside the shape) or grey (outside), with a
     count, "312 of 340 mothers' addresses are inside". It uses `isPointInPolygon` from shared, so
     it matches the backend.
  4. **Save:** stores the polygon (closed, `[lng, lat]`), the name and the source.
- **Without a Maps key** (`isMapsAvailable()` false): the list and the active switch still work.
  The editor says a Maps key is required to draw.
- **Sidebar:** a "Service Areas" item, gated by `hasSectionAccess` like the rest.

## Mobile

- **`BookingLocationSection`:**
  - An address with `inServiceArea === false` shows a "Not in our service area yet" tag.
  - When the selected address is outside, a note appears under the list: "We don't serve this area
    yet. We're currently in: New Cairo." The names come from `serviceAreaNames` in booking options.
  - The section reports this so `BookingDatePickerScreen` disables Continue.
  - Auto-preselect still picks the default address (she sees why she can't continue), and adding a
    new address re-checks.
- **Stale data:** if the backend still refuses at `POST /bookings`, the existing error display
  shows its message.
- No change to registration or browsing.

## Testing

| Tier | What |
|---|---|
| shared (Vitest) | `isPointInPolygon` (inside, outside, on a concave notch); `PolygonSchema` refuses open rings, holes, out-of-range coordinates |
| backend unit | Douglas–Peucker simplification; Nominatim response → lookup (polygon, multipolygon, bbox fallback, nothing found) from a recorded fixture; `isInServiceArea` with none / inactive / active areas |
| backend integration | `POST /bookings`: inside → 201, outside → 400 with the names, no active areas → 201, inactive-only → 201. `GET /addresses` returns `inServiceArea`. Admin CRUD plus soft delete. `admin-permissions.test.ts` passes with the new rows. The lookup route is tested with Nominatim stubbed (no network in CI) |
| admin (Vitest + MSW) | List renders, toggle calls PATCH, delete confirms, a lookup with no result shows "draw by hand" |
| mobile (Jest) | `BookingLocationSection`: tag on an outside address, note text, Continue disabled; unrestricted when `serviceAreaNames` is empty |
| mobile E2E (Maestro, new `c19-service-area.yaml`) | `advance.js service-area-set` creates an active area away from the seeded mother's address. The flow opens Book, sees the tag and the note, and Continue is disabled. `service-area-clear` then soft-deletes it, and Continue works. A final clear step runs even on failure via `onFlowComplete`, so later flows stay unrestricted |

## Rollout

1. Apply the `add_service_areas` migration to the production database (`pnpm db:migrate` against
   its `DATABASE_URL`) before the backend that reads it deploys — Vercel deploys on merge, and
   without the table every booking, booking-options and address request fails.
2. Deploy with no areas: no behaviour change.
3. Admin adds "New Cairo" (new areas start inactive), checks the coverage preview, trims the edges,
   and switches it on.
4. Mothers outside see the note from that moment. Older app builds without the note still get the
   backend's refusal message when they submit.
