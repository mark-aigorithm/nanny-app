# Radius-Filtered Nanny Broadcast + Race-Safe Accept + Admin Pending SLA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notify only nannies within a configurable radius when a parent requests care, make the first-to-accept claim atomically race-safe, and show admins how long each pending booking has waited with yellow/red SLA thresholds.

**Architecture:** The broadcast + accept + notify-mother pipeline already exists end-to-end. We snapshot the mother's lat/lng onto each Booking at creation, filter both the push broadcast (`notifyBookingBroadcast`) and the nanny's Requests pool (`listAvailableBookings`) with a pure haversine helper (missing coordinates on either side ⇒ include, radius 0 ⇒ filtering off), replace the claim's read-then-update with a status-guarded atomic `updateMany`, and add three admin-tunable `AppSettings` keys (radius + two SLA thresholds) surfaced on the admin Configuration page and consumed by a new "Waiting" column with row highlighting on the Bookings page.

**Tech Stack:** Express + TypeScript + Prisma (PostgreSQL/Neon), Jest (backend, mocked Prisma), Zod schemas in `packages/shared`, React 19 + Vite + TanStack Query (admin). **No mobile changes** — push deep-linking, the Accept button, and the mother's "nanny accepted" notification already exist; "Ignore" is a client-side dismiss with no endpoint.

**Spec:** `Docs/superpowers/specs/2026-07-15-nanny-broadcast-radius-sla-design.md`

## Global Constraints

- TypeScript strict everywhere; **no `any`** — use `unknown` + type guards. `noUncheckedIndexedAccess` is on.
- Backend: services are the only place that touch Prisma; every read filters `deletedAt: null`; expected errors via `errors.*` helpers (`@backend/lib/errors`); one service function = unit test with `jest.mock('@backend/db/prisma')`.
- Shared types are inferred from Zod schemas in `packages/shared` — never duplicate type definitions.
- Admin app: colors/radii/shadows ONLY via CSS variables in `apps/admin/src/styles/global.css`; reuse `@admin/components/ui`; server state via TanStack Query + typed functions in `lib/api.ts`; errors through `apiErrorMessage`. When building admin UI, load the `nanny-app-admin-design` skill first.
- Use `import type` for type-only imports. Files kebab-case, functions camelCase.
- Dev environment: run `nvm use 22` first. The backend `.env` points to the **Neon cloud dev DB** (not local docker) — Prisma migrate commands run against it.
- All backend test commands run from `apps/backend`; admin verification is `pnpm typecheck` from `apps/admin` (the admin app has no test runner).
- Commit after every task. Do not push.

---

### Task 1: Platform-config settings — shared schema + backend accessors

Add `broadcastRadiusKm`, `pendingWarningMinutes`, `pendingCriticalMinutes` to the shared `PlatformConfigSchema` and the backend `app-settings.service.ts` (keys, defaults, field map, plus a `getBroadcastRadiusKm()` accessor). These change together — the backend `DEFAULTS: PlatformConfig` literal won't compile without both.

**Files:**
- Modify: `packages/shared/src/admin.ts` (PlatformConfigSchema at line 101, UpdatePlatformConfigSchema at line 126)
- Modify: `apps/backend/src/services/app-settings.service.ts`
- Test: `apps/backend/src/__tests__/app-settings.service.test.ts` (new)

**Interfaces:**
- Produces: `getBroadcastRadiusKm(): Promise<number>` exported from `@backend/services/app-settings.service` (consumed by Tasks 4–5); `PlatformConfig` now includes `broadcastRadiusKm: number`, `pendingWarningMinutes: number`, `pendingCriticalMinutes: number` (consumed by Tasks 7–8). Setting keys: `broadcast_radius_km`, `pending_warning_minutes`, `pending_critical_minutes`. Defaults: 10 / 15 / 30.

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/__tests__/app-settings.service.test.ts`:

```ts
jest.mock('@backend/db/prisma', () => {
  const appSettings = { findUnique: jest.fn(), findMany: jest.fn(), upsert: jest.fn() };
  return {
    prisma: {
      appSettings,
      $transaction: jest.fn(async (arg: unknown) =>
        Array.isArray(arg) ? Promise.all(arg) : (arg as () => unknown)(),
      ),
    },
  };
});

import { prisma } from '@backend/db/prisma';
import {
  getBroadcastRadiusKm,
  getPlatformConfig,
} from '@backend/services/app-settings.service';

const mockPrisma = prisma as unknown as {
  appSettings: { findUnique: jest.Mock; findMany: jest.Mock; upsert: jest.Mock };
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getBroadcastRadiusKm', () => {
  it('returns the default (10) when the key is not seeded', async () => {
    mockPrisma.appSettings.findUnique.mockResolvedValue(null);
    await expect(getBroadcastRadiusKm()).resolves.toBe(10);
  });

  it('parses the stored value', async () => {
    mockPrisma.appSettings.findUnique.mockResolvedValue({
      key: 'broadcast_radius_km',
      value: '25.5',
    });
    await expect(getBroadcastRadiusKm()).resolves.toBe(25.5);
  });

  it('falls back to the default on a malformed value', async () => {
    mockPrisma.appSettings.findUnique.mockResolvedValue({
      key: 'broadcast_radius_km',
      value: 'not-a-number',
    });
    await expect(getBroadcastRadiusKm()).resolves.toBe(10);
  });
});

describe('getPlatformConfig — matching/SLA keys', () => {
  it('includes matching/SLA defaults for unseeded keys', async () => {
    mockPrisma.appSettings.findMany.mockResolvedValue([]);
    const config = await getPlatformConfig();
    expect(config.broadcastRadiusKm).toBe(10);
    expect(config.pendingWarningMinutes).toBe(15);
    expect(config.pendingCriticalMinutes).toBe(30);
  });

  it('reads seeded matching/SLA values', async () => {
    mockPrisma.appSettings.findMany.mockResolvedValue([
      { key: 'broadcast_radius_km', value: '5' },
      { key: 'pending_warning_minutes', value: '20' },
      { key: 'pending_critical_minutes', value: '45' },
    ]);
    const config = await getPlatformConfig();
    expect(config.broadcastRadiusKm).toBe(5);
    expect(config.pendingWarningMinutes).toBe(20);
    expect(config.pendingCriticalMinutes).toBe(45);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && pnpm test -- app-settings.service.test.ts`
Expected: FAIL — `getBroadcastRadiusKm` is not exported / `broadcastRadiusKm` missing from config.

- [ ] **Step 3: Extend the shared Zod schema**

In `packages/shared/src/admin.ts`, add three fields to `PlatformConfigSchema` (after `cancellationWindowHours` at line 122):

```ts
  /**
   * Radius (km) around the booking's location within which nannies are
   * notified of a new request (and see it in their Requests pool). 0 disables
   * distance filtering — every eligible nanny is notified.
   */
  broadcastRadiusKm: z.number().min(0).max(500),
  /**
   * Minutes a booking may sit PENDING (no nanny accepted) before the admin
   * bookings list flags it as a warning (yellow).
   */
  pendingWarningMinutes: z.number().int().min(1).max(10080),
  /**
   * Minutes a booking may sit PENDING before the admin bookings list flags it
   * as critical (red). Must be greater than the warning threshold.
   */
  pendingCriticalMinutes: z.number().int().min(1).max(10080),
```

Then add a cross-field refine to `UpdatePlatformConfigSchema`, chained after the existing nanny/platform-percent refine (line 130-139):

```ts
  .refine(
    (v) =>
      v.pendingWarningMinutes === undefined ||
      v.pendingCriticalMinutes === undefined ||
      v.pendingWarningMinutes < v.pendingCriticalMinutes,
    {
      message: 'Pending warning threshold must be below the critical threshold',
      path: ['pendingWarningMinutes'],
    },
  );
```

(Note: the final `;` moves from the old last refine to this new one.)

- [ ] **Step 4: Extend the backend settings service**

In `apps/backend/src/services/app-settings.service.ts`:

Add to `KEYS` (after `CANCELLATION_WINDOW_HOURS`, line 13):

```ts
  BROADCAST_RADIUS_KM: 'broadcast_radius_km',
  PENDING_WARNING_MINUTES: 'pending_warning_minutes',
  PENDING_CRITICAL_MINUTES: 'pending_critical_minutes',
```

Add to `DEFAULTS` (after `cancellationWindowHours: 24`, line 24):

```ts
  broadcastRadiusKm: 10,
  pendingWarningMinutes: 15,
  pendingCriticalMinutes: 30,
```

Add to `FIELD_TO_KEY` (after `cancellationWindowHours`, line 36):

```ts
  broadcastRadiusKm: KEYS.BROADCAST_RADIUS_KM,
  pendingWarningMinutes: KEYS.PENDING_WARNING_MINUTES,
  pendingCriticalMinutes: KEYS.PENDING_CRITICAL_MINUTES,
```

Add a typed accessor after `getRevenueSplit` (line 78), matching the style of the existing getters:

```ts
/**
 * Radius (km) for broadcasting new booking requests to nearby nannies.
 * 0 means no distance filter — every eligible nanny is notified.
 */
export async function getBroadcastRadiusKm(): Promise<number> {
  const row = await prisma.appSettings.findUnique({
    where: { key: KEYS.BROADCAST_RADIUS_KM },
  });
  if (!row) return DEFAULTS.broadcastRadiusKm;
  const parsed = parseFloat(row.value);
  return Number.isNaN(parsed) ? DEFAULTS.broadcastRadiusKm : parsed;
}
```

- [ ] **Step 5: Run tests and typechecks**

Run: `cd apps/backend && pnpm test -- app-settings.service.test.ts`
Expected: PASS (5 tests).

Run: `cd packages/shared && pnpm typecheck && cd ../../apps/backend && pnpm typecheck`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/admin.ts apps/backend/src/services/app-settings.service.ts apps/backend/src/__tests__/app-settings.service.test.ts
git commit -m "Add broadcast radius and pending SLA thresholds to platform config"
```

---

### Task 2: Haversine geo helper

Pure distance math in `apps/backend/src/lib/geo.ts`. Used by both filter sites; unit-testable with real coordinates, no DB. (The nanny-listing PostGIS ranking in `nanny.service.ts` is untouched — this helper is for filtering small in-memory lists, matching the existing JS-side overlap filter in `listAvailableBookings`.)

**Files:**
- Create: `apps/backend/src/lib/geo.ts`
- Test: `apps/backend/src/__tests__/geo.test.ts` (new)

**Interfaces:**
- Produces (consumed by Tasks 4–5):
  - `type LatLng = { latitude: number; longitude: number }`
  - `distanceKm(a: LatLng, b: LatLng): number`
  - `toLatLng(latitude: unknown, longitude: unknown): LatLng | null` — accepts Prisma `Decimal | number | null`, returns null unless both convert to finite numbers
  - `isWithinRadius(a: LatLng | null, b: LatLng | null, radiusKm: number): boolean` — **true** when radiusKm ≤ 0 or either point is null (inclusion fallback), else true iff `distanceKm(a, b) <= radiusKm`

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/__tests__/geo.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && pnpm test -- geo.test.ts`
Expected: FAIL — cannot find module `@backend/lib/geo`.

- [ ] **Step 3: Write the implementation**

Create `apps/backend/src/lib/geo.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && pnpm test -- geo.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/lib/geo.ts apps/backend/src/__tests__/geo.test.ts
git commit -m "Add haversine geo helper for broadcast radius filtering"
```

---

### Task 3: Booking location snapshot (Prisma migration + createBooking)

Add nullable `latitude`/`longitude` to `Booking`; `createBooking` copies them from the mother's user row at creation time.

**Files:**
- Modify: `apps/backend/prisma/schema.prisma` (Booking model, after `specialInstructions`)
- Modify: `apps/backend/src/services/booking.service.ts` (`createBooking`, the `data` literal at line 455)
- Modify (test): `apps/backend/src/__tests__/booking-approval-flow.test.ts`
- Create (generated): `apps/backend/prisma/migrations/<timestamp>_add_booking_location_snapshot/migration.sql`

**Interfaces:**
- Produces: `Booking.latitude: Decimal | null`, `Booking.longitude: Decimal | null` (Prisma), consumed by Tasks 4–5. `BookingResponse` (client shape) is NOT changed — `toBookingResponse` maps fields explicitly and no client needs the coordinates.

- [ ] **Step 1: Write the failing test**

In `apps/backend/src/__tests__/booking-approval-flow.test.ts`:

1. Give the mother mock coordinates — replace the `motherUser` object (line 75-80) with:

```ts
const motherUser = {
  id: 'mother-1',
  firebaseUid: 'fb-mother',
  role: Role.MOTHER,
  latitude: 30.0444,
  longitude: 31.2357,
  deletedAt: null,
};
```

2. In the `createBooking (broadcast)` test (line 177), after the existing `expect(createData.nannyProfileId).toBeNull();` assertion (line 208), add:

```ts
    // Location snapshot: the mother's coordinates are copied onto the booking
    // so radius filtering stays stable if she later edits her address.
    expect(createData.latitude).toBe(30.0444);
    expect(createData.longitude).toBe(31.2357);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && pnpm test -- booking-approval-flow.test.ts`
Expected: FAIL — `createData.latitude` is `undefined`.

- [ ] **Step 3: Add the schema fields and migrate**

In `apps/backend/prisma/schema.prisma`, inside `model Booking`, directly after the `specialInstructions` line:

```prisma
  /// Location snapshot copied from the mother's profile at creation time —
  /// used to radius-filter the nanny broadcast (see notifyBookingBroadcast).
  /// Null (mother has no saved location) → the request broadcasts to everyone.
  latitude                Decimal?      @db.Decimal(10, 7)
  longitude               Decimal?      @db.Decimal(10, 7)
```

(No `@map` needed — single-word lowercase names, same as on `User`.)

Run (note: `.env` points at the Neon cloud dev DB):

```bash
nvm use 22
cd apps/backend
pnpm db:migrate:dev --name add_booking_location_snapshot
```

Expected: migration created and applied; Prisma client regenerated. **Review the generated SQL** in `prisma/migrations/*_add_booking_location_snapshot/migration.sql` — it must be exactly two `ALTER TABLE "bookings" ADD COLUMN` statements (`latitude DECIMAL(10,7)`, `longitude DECIMAL(10,7)`), nothing destructive.

- [ ] **Step 4: Snapshot coordinates in createBooking**

In `apps/backend/src/services/booking.service.ts`, in the `data: Prisma.BookingUncheckedCreateInput` literal (line 455), after `endTime,`:

```ts
    // Snapshot the mother's location so the broadcast radius is computed
    // against where the booking was requested, even if she later moves.
    latitude: user.latitude,
    longitude: user.longitude,
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/backend && pnpm test -- booking-approval-flow.test.ts`
Expected: PASS.

Run: `pnpm typecheck` (still in `apps/backend`)
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/prisma/schema.prisma apps/backend/prisma/migrations apps/backend/src/services/booking.service.ts apps/backend/src/__tests__/booking-approval-flow.test.ts
git commit -m "Snapshot mother's coordinates onto bookings at creation"
```

---

### Task 4: Radius-filtered broadcast (`notifyBookingBroadcast`)

Filter the nanny fan-out by `broadcast_radius_km`. Admins are always notified. Missing coordinates (booking or nanny) and radius 0 fall back to notify-all.

**Files:**
- Modify: `apps/backend/src/services/booking.service.ts` (`notifyBookingBroadcast` at line 256, imports at top)
- Modify (test): `apps/backend/src/__tests__/booking-approval-flow.test.ts` (app-settings mock)
- Test: `apps/backend/src/__tests__/booking-broadcast-radius.test.ts` (new)

**Interfaces:**
- Consumes: `getBroadcastRadiusKm()` (Task 1), `toLatLng`/`isWithinRadius` (Task 2), `booking.latitude/longitude` (Task 3).
- Produces: no signature changes — `notifyBookingBroadcast` stays a private helper called by `createBooking`.

- [ ] **Step 1: Keep the existing suite green — extend its app-settings mock**

In `apps/backend/src/__tests__/booking-approval-flow.test.ts`, the app-settings mock (line 41-45) must cover the new accessor. Replace it with:

```ts
jest.mock('@backend/services/app-settings.service', () => ({
  getServiceFeePercent: jest.fn().mockResolvedValue(6),
  getStandardHourlyRate: jest.fn().mockResolvedValue(100),
  getRevenueSplit: jest.fn().mockResolvedValue({ nannyPercent: 80, platformPercent: 20 }),
  getBroadcastRadiusKm: jest.fn().mockResolvedValue(10),
}));
```

(The nanny mocks in that file have no coordinates, so the inclusion fallback keeps every existing assertion valid.)

- [ ] **Step 2: Write the failing tests**

Create `apps/backend/src/__tests__/booking-broadcast-radius.test.ts`:

```ts
import { Role, BookingStatus } from '@nanny-app/shared';
import { BookingStatus as PrismaBookingStatus, NannyBookingDecision } from '@prisma/client';

jest.mock('@backend/db/prisma', () => {
  const booking = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  };
  const user = { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() };
  const nannyProfile = { findUnique: jest.fn(), findMany: jest.fn() };
  const skill = { findMany: jest.fn() };
  const durationMultiplierRule = { findMany: jest.fn() };
  return {
    prisma: {
      booking,
      user,
      nannyProfile,
      skill,
      durationMultiplierRule,
      $transaction: jest.fn(async (arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: unknown) => unknown)({ booking, user, nannyProfile })
          : Promise.all(arg as Promise<unknown>[]),
      ),
    },
  };
});

jest.mock('@backend/services/notification.service', () => ({
  createInAppNotification: jest.fn().mockResolvedValue({}),
  dispatchPush: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@backend/services/app-settings.service', () => ({
  getServiceFeePercent: jest.fn().mockResolvedValue(6),
  getStandardHourlyRate: jest.fn().mockResolvedValue(100),
  getRevenueSplit: jest.fn().mockResolvedValue({ nannyPercent: 80, platformPercent: 20 }),
  getBroadcastRadiusKm: jest.fn().mockResolvedValue(10),
}));

import { prisma } from '@backend/db/prisma';
import { getBroadcastRadiusKm } from '@backend/services/app-settings.service';
import { createInAppNotification } from '@backend/services/notification.service';
import { createBooking, listAvailableBookings } from '@backend/services/booking.service';

const mockPrisma = prisma as unknown as {
  booking: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
  };
  user: { findUnique: jest.Mock; findMany: jest.Mock };
  nannyProfile: { findUnique: jest.Mock; findMany: jest.Mock };
  skill: { findMany: jest.Mock };
  durationMultiplierRule: { findMany: jest.Mock };
};

const mockNotify = createInAppNotification as jest.Mock;
const mockRadius = getBroadcastRadiusKm as jest.Mock;

// Cairo; NEAR is <1 km away, FAR (Alexandria) is ~180 km away.
const BOOKING_COORDS = { latitude: 30.0444, longitude: 31.2357 };
const NEAR = { latitude: 30.05, longitude: 31.24 };
const FAR = { latitude: 31.2001, longitude: 29.9187 };

const motherUser = {
  id: 'mother-1',
  firebaseUid: 'fb-mother',
  role: Role.MOTHER,
  ...BOOKING_COORDS,
  deletedAt: null,
};

const mother = { id: 'mother-1', firstName: 'Jane', lastName: 'Mom', avatarUrl: null };

function makeBooking(overrides: Record<string, unknown> = {}) {
  const startTime = new Date(Date.now() + 20 * 24 * 3_600_000);
  const endTime = new Date(startTime.getTime() + 3 * 3_600_000);
  return {
    id: 'booking-1',
    motherId: mother.id,
    mother,
    nannyProfileId: null,
    nannyProfile: null,
    status: PrismaBookingStatus.PENDING,
    nannyDecision: NannyBookingDecision.PENDING,
    nannyDecidedAt: null,
    adminApprovedAt: null,
    type: 'STANDARD',
    date: startTime,
    startTime,
    endTime,
    durationHours: 3,
    baseRate: 100,
    subtotal: 300,
    discountAmount: 0,
    serviceFeePercent: 6,
    serviceFeeAmount: 0,
    totalAmount: 300,
    latitude: BOOKING_COORDS.latitude,
    longitude: BOOKING_COORDS.longitude,
    specialInstructions: null,
    cancellationReason: null,
    cancelledAt: null,
    nannyCheckedInAt: null,
    nannyCheckedOutAt: null,
    payment: null,
    review: null,
    createdAt: new Date(),
    ...overrides,
  };
}

/** Runs createBooking with the standard fan-out mocks; returns notified BOOKING_REQUESTED userIds. */
async function runBroadcast(options: {
  motherOverrides?: Record<string, unknown>;
  bookingOverrides?: Record<string, unknown>;
}): Promise<string[]> {
  mockPrisma.user.findUnique.mockResolvedValue({ ...motherUser, ...options.motherOverrides });
  mockPrisma.booking.findFirst.mockResolvedValue(null); // no idempotent reuse
  mockPrisma.booking.create.mockResolvedValue(makeBooking(options.bookingOverrides));
  mockPrisma.skill.findMany.mockResolvedValue([]);
  mockPrisma.durationMultiplierRule.findMany.mockResolvedValue([]);
  mockPrisma.nannyProfile.findMany.mockResolvedValue([
    { userId: 'nanny-near', user: { ...NEAR } },
    { userId: 'nanny-far', user: { ...FAR } },
    { userId: 'nanny-nocoords', user: { latitude: null, longitude: null } },
  ]);
  mockPrisma.user.findMany.mockResolvedValue([{ id: 'admin-1' }]);

  const start = new Date(Date.now() + 20 * 24 * 3_600_000);
  start.setUTCHours(10, 0, 0, 0);
  const end = new Date(start.getTime() + 3 * 3_600_000);

  await createBooking({ uid: 'fb-mother' } as never, {
    date: start.toISOString().slice(0, 10),
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    skillIds: [],
  });

  return mockNotify.mock.calls
    .filter((c) => c[0].type === 'BOOKING_REQUESTED')
    .map((c) => c[0].userId as string)
    .sort();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRadius.mockResolvedValue(10);
});

describe('notifyBookingBroadcast — radius filter', () => {
  it('notifies only in-radius and coordinate-less nannies (plus admins)', async () => {
    const notified = await runBroadcast({});
    expect(notified).toEqual(['admin-1', 'nanny-near', 'nanny-nocoords']);
  });

  it('notifies everyone when the booking has no coordinates', async () => {
    const notified = await runBroadcast({
      bookingOverrides: { latitude: null, longitude: null },
    });
    expect(notified).toEqual(['admin-1', 'nanny-far', 'nanny-near', 'nanny-nocoords']);
  });

  it('notifies everyone when the radius is 0 (filtering disabled)', async () => {
    mockRadius.mockResolvedValue(0);
    const notified = await runBroadcast({});
    expect(notified).toEqual(['admin-1', 'nanny-far', 'nanny-near', 'nanny-nocoords']);
  });
});
```

(The `listAvailableBookings` import and `updateMany`/`findMany` booking mocks are used by Tasks 5–6, which extend this file.)

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/backend && pnpm test -- booking-broadcast-radius.test.ts`
Expected: FAIL — the first test gets 4 notified users (no filtering yet).

- [ ] **Step 4: Implement the filter**

In `apps/backend/src/services/booking.service.ts`:

Add imports:

```ts
import { isWithinRadius, toLatLng } from '@backend/lib/geo';
import { getBroadcastRadiusKm } from './app-settings.service';
```

(Place the `geo` import with the other `@backend/lib` imports at line 30-32, and the app-settings import with the sibling service imports at line 33-46.)

Rewrite `notifyBookingBroadcast` (line 256) — the doc comment's "Eligible" sentence and the nannies query change; the admins query and the recipients/dispatch tail stay identical:

```ts
/**
 * Broadcast a new, unclaimed booking request to every eligible nanny and to
 * every admin at once. No nanny is assigned yet — the request is offered to the
 * whole pool and the first nanny to accept claims it. "Eligible" means an
 * approved nanny with a complete profile who is free for the requested window
 * and within the configured broadcast radius of the booking's location (nannies
 * or bookings without coordinates always match, and radius 0 disables the
 * distance filter — see AppSettings broadcast_radius_km).
 * No payment has been taken; the mother pays once a nanny claims the request.
 */
async function notifyBookingBroadcast(booking: BookingWithRelations): Promise<void> {
  const dateLabel = booking.date.toISOString().slice(0, 10);

  const [radiusKm, candidates] = await Promise.all([
    getBroadcastRadiusKm(),
    prisma.nannyProfile.findMany({
      where: {
        deletedAt: null,
        isProfileComplete: true,
        approvalStatus: NannyApprovalStatus.APPROVED,
        // Exclude nannies already booked for an overlapping window — they can't
        // take this one anyway.
        bookings: {
          none: {
            deletedAt: null,
            status: { notIn: [BookingStatus.CANCELLED, BookingStatus.REFUNDED] },
            startTime: { lt: booking.endTime },
            endTime: { gt: booking.startTime },
          },
        },
      },
      select: {
        userId: true,
        user: { select: { latitude: true, longitude: true } },
      },
    }),
  ]);

  const bookingPoint = toLatLng(booking.latitude, booking.longitude);
  const nannies = candidates.filter((n) =>
    isWithinRadius(bookingPoint, toLatLng(n.user.latitude, n.user.longitude), radiusKm),
  );

  const admins = await prisma.user.findMany({
    where: { deletedAt: null, role: { in: ['ADMIN', 'SUPERUSER'] } },
    select: { id: true },
  });

  // ... recipients array and Promise.all dispatch — UNCHANGED from current lines 283-307
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/backend && pnpm test -- booking-broadcast-radius.test.ts booking-approval-flow.test.ts`
Expected: PASS — both suites (the pre-existing broadcast test still passes because its nanny mocks lack a `user` field only if unchanged — it mocks `[{ userId: nannyUser.id }]`; `n.user` would be undefined. **Update that mock** (line 188 of booking-approval-flow.test.ts) to:

```ts
    mockPrisma.nannyProfile.findMany.mockResolvedValue([
      { userId: nannyUser.id, user: { latitude: null, longitude: null } },
    ]);
```

).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/services/booking.service.ts apps/backend/src/__tests__/booking-broadcast-radius.test.ts apps/backend/src/__tests__/booking-approval-flow.test.ts
git commit -m "Radius-filter the nanny broadcast using the configurable setting"
```

---

### Task 5: Radius-filtered Requests pool (`listAvailableBookings`)

The nanny's open-pool list applies the same rule from her side, so "what I can browse" matches "what I was pinged about".

**Files:**
- Modify: `apps/backend/src/services/booking.service.ts` (`listAvailableBookings` at line 575)
- Test: `apps/backend/src/__tests__/booking-broadcast-radius.test.ts` (extend)

**Interfaces:**
- Consumes: `getBroadcastRadiusKm()`, `toLatLng`, `isWithinRadius`, `booking.latitude/longitude`.
- Produces: `listAvailableBookings` signature unchanged (`(decoded) => Promise<BookingResponse[]>`).

- [ ] **Step 1: Write the failing tests**

Append to `apps/backend/src/__tests__/booking-broadcast-radius.test.ts`:

```ts
describe('listAvailableBookings — radius filter', () => {
  const nannyUser = {
    id: 'nanny-user-1',
    firebaseUid: 'fb-nanny',
    role: Role.NANNY,
    deletedAt: null,
  };

  function mockPool(nannyCoords: { latitude: number | null; longitude: number | null }) {
    mockPrisma.user.findUnique.mockResolvedValue(nannyUser);
    mockPrisma.nannyProfile.findUnique.mockResolvedValue({
      id: 'np-1',
      user: nannyCoords,
    });
    // First findMany call = the nanny's busy slots; second = the open pool.
    mockPrisma.booking.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        makeBooking({ id: 'near-booking', ...BOOKING_COORDS }),
        makeBooking({ id: 'far-booking', ...FAR }),
        makeBooking({ id: 'nocoords-booking', latitude: null, longitude: null }),
      ]);
  }

  it('shows only in-radius and coordinate-less requests to a located nanny', async () => {
    mockPool({ latitude: 30.05, longitude: 31.24 }); // near Cairo
    const result = await listAvailableBookings({ uid: 'fb-nanny' } as never);
    expect(result.map((b) => b.id).sort()).toEqual(['near-booking', 'nocoords-booking']);
  });

  it('shows the full pool to a nanny without coordinates', async () => {
    mockPool({ latitude: null, longitude: null });
    const result = await listAvailableBookings({ uid: 'fb-nanny' } as never);
    expect(result).toHaveLength(3);
  });

  it('shows the full pool when the radius is 0', async () => {
    mockRadius.mockResolvedValue(0);
    mockPool({ latitude: 30.05, longitude: 31.24 });
    const result = await listAvailableBookings({ uid: 'fb-nanny' } as never);
    expect(result).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/backend && pnpm test -- booking-broadcast-radius.test.ts`
Expected: the three new tests FAIL (first one returns 3 bookings). Note: the current `nannyProfile.findUnique` select is `{ id: true }`, so `user` is missing — the implementation change below adds it.

- [ ] **Step 3: Implement the filter**

In `listAvailableBookings` (line 575):

1. Update the doc comment (line 569-574) — replace the last sentence:

```ts
/**
 * The open broadcast pool a nanny can claim: unassigned PENDING requests that
 * start in the future and don't overlap any booking the nanny already holds.
 * Soonest-starting first. Filtered to the configured broadcast radius around
 * each request's location — the pool matches what the nanny was notified
 * about. Requests or nannies without coordinates, or radius 0, bypass the
 * distance filter (never hide work because a profile is incomplete).
 */
```

2. Change the profile lookup (line 583-586) to also select coordinates:

```ts
  const nannyProfile = await prisma.nannyProfile.findUnique({
    where: { userId: user.id, deletedAt: null },
    select: { id: true, user: { select: { latitude: true, longitude: true } } },
  });
```

3. Add the radius load to the existing `Promise.all` (line 589) — change it to destructure three results:

```ts
  const [radiusKm, busy, open] = await Promise.all([
    getBroadcastRadiusKm(),
    prisma.booking.findMany({
      /* busy query — UNCHANGED */
    }),
    prisma.booking.findMany({
      /* open query — UNCHANGED */
    }),
  ]);
```

4. Extend the JS-side filter (line 611-613):

```ts
  const nannyPoint = toLatLng(nannyProfile.user.latitude, nannyProfile.user.longitude);
  const available = open.filter(
    (b) =>
      !busy.some((slot) => slot.startTime < b.endTime && slot.endTime > b.startTime) &&
      isWithinRadius(nannyPoint, toLatLng(b.latitude, b.longitude), radiusKm),
  );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend && pnpm test -- booking-broadcast-radius.test.ts`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/booking.service.ts apps/backend/src/__tests__/booking-broadcast-radius.test.ts
git commit -m "Radius-filter the nanny requests pool to match the broadcast"
```

---

### Task 6: Race-safe atomic claim

Replace the claim path's read-then-update with a status-guarded `updateMany` — the DB guarantees exactly one winner; losers get a conflict error. Same pattern as the PIN check-in code (`booking.service.ts:1073`).

**Files:**
- Modify: `apps/backend/src/services/booking.service.ts` (`applyNannyDecision` at line 700)
- Modify (test): `apps/backend/src/__tests__/booking-approval-flow.test.ts` (claim describe block at line 227)

**Interfaces:**
- Consumes: nothing new.
- Produces: `acceptBooking`/`declineBooking` signatures unchanged. New failure mode: HTTP 409 (`errors.conflict`) with message `'This request was already accepted by another nanny.'` when the claim loses the race. The mobile app already surfaces API error messages on accept — no client change.

- [ ] **Step 1: Update the tests**

In `apps/backend/src/__tests__/booking-approval-flow.test.ts`:

1. Add `updateMany` and `findUniqueOrThrow` to the booking mock (line 7-13):

```ts
  const booking = {
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  };
```

and mirror both in the `mockPrisma` type assertion (line 58-71):

```ts
  booking: {
    findUnique: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    count: jest.Mock;
  };
```

2. Replace the first test in `describe('claim (unassigned request)')` (line 237-259) with:

```ts
  it('claims atomically: guarded updateMany assigns the nanny and moves PENDING → APPROVED, prompting the mother to pay', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(
      makeBooking({ nannyProfileId: null, nannyProfile: null, type: 'STANDARD' }),
    );
    // assertNoConflict finds no overlapping booking.
    mockPrisma.booking.findFirst.mockResolvedValue(null);
    mockPrisma.booking.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.booking.findUniqueOrThrow.mockResolvedValue(
      makeBooking({ status: PrismaBookingStatus.APPROVED, nannyDecision: NannyBookingDecision.ACCEPTED }),
    );

    const result = await acceptBooking({ uid: 'fb-nanny' } as never, 'booking-1');

    expect(result.status).toBe(BookingStatus.APPROVED);

    // The conditional write is what makes first-to-accept race-safe: it only
    // matches a row that is still an unclaimed PENDING request.
    const claimCall = mockPrisma.booking.updateMany.mock.calls[0][0];
    expect(claimCall.where).toEqual(
      expect.objectContaining({
        id: 'booking-1',
        status: PrismaBookingStatus.PENDING,
        nannyProfileId: null,
        deletedAt: null,
      }),
    );
    expect(claimCall.data).toEqual(
      expect.objectContaining({
        nannyProfileId: nannyProfileRel.id,
        status: PrismaBookingStatus.APPROVED,
        nannyDecision: NannyBookingDecision.ACCEPTED,
      }),
    );

    // Mother is told a nanny accepted (reuses BOOKING_APPROVED).
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: motherUser.id, type: 'BOOKING_APPROVED' }),
    );
  });

  it('rejects the loser of a simultaneous claim race (updateMany matched no row)', async () => {
    // The pre-read still sees an unclaimed PENDING request…
    mockPrisma.booking.findUnique.mockResolvedValue(
      makeBooking({ nannyProfileId: null, nannyProfile: null }),
    );
    mockPrisma.booking.findFirst.mockResolvedValue(null);
    // …but another nanny's claim commits first, so the guarded write misses.
    mockPrisma.booking.updateMany.mockResolvedValue({ count: 0 });

    await expect(acceptBooking({ uid: 'fb-nanny' } as never, 'booking-1')).rejects.toThrow(
      /already accepted/i,
    );
    expect(mockNotify).not.toHaveBeenCalled();
  });
```

(Keep the existing second test — "rejects a second nanny once the request is already claimed" — unchanged; the early status re-check still covers the sequential case.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/backend && pnpm test -- booking-approval-flow.test.ts`
Expected: the two rewritten claim tests FAIL (`updateMany` never called).

- [ ] **Step 3: Implement the atomic claim**

In `applyNannyDecision` (`booking.service.ts:700`):

1. Update the function's doc comment — replace the sentence "First to accept wins; a transaction + status re-check prevents two nannies claiming the same request." with:

```
 * First to accept wins: the claim is a conditional updateMany guarded on
 * (status = PENDING AND nannyProfileId IS NULL), so the database itself
 * guarantees exactly one winner under concurrent accepts — the loser's write
 * matches no row and gets a conflict error.
```

2. Replace the unclaimed-request branch (lines 729-750) with:

```ts
    // Unclaimed request: ACCEPT claims it and makes it payable (→ APPROVED).
    if (booking.nannyProfileId === null) {
      if (decision === 'DECLINED') {
        throw errors.badRequest('This booking is not assigned to you.');
      }

      await assertNoConflict(nannyProfile.id, booking.startTime, booking.endTime);

      validateStatusTransition(booking.status, BookingStatus.APPROVED);

      // Atomic first-to-accept guard: the write only matches a row that is
      // still an unclaimed PENDING request at commit time. If a concurrent
      // claim won, count is 0 and this nanny loses cleanly. (Same guarded-
      // updateMany pattern as the check-in PIN validation.)
      const claim = await tx.booking.updateMany({
        where: {
          id: bookingId,
          status: BookingStatus.PENDING,
          nannyProfileId: null,
          deletedAt: null,
        },
        data: {
          nannyProfileId: nannyProfile.id,
          status: BookingStatus.APPROVED,
          nannyDecision: decisionValue,
          nannyDecidedAt: new Date(),
        },
      });
      if (claim.count === 0) {
        throw errors.conflict('This request was already accepted by another nanny.');
      }
      claimed = true;

      return tx.booking.findUniqueOrThrow({
        where: { id: bookingId },
        include: bookingInclude,
      });
    }
```

(The assigned-booking branch below it is unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend && pnpm test -- booking-approval-flow.test.ts booking-broadcast-radius.test.ts`
Expected: PASS.

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/booking.service.ts apps/backend/src/__tests__/booking-approval-flow.test.ts
git commit -m "Make first-to-accept claim atomic with a status-guarded updateMany"
```

---

### Task 7: Admin Configuration page — Matching & SLA fields

Surface the three new settings on the existing Configuration page. **Load the `nanny-app-admin-design` skill before editing admin UI.**

**Files:**
- Modify: `apps/admin/src/pages/settings-page.tsx`
- Modify: `apps/admin/src/styles/global.css` (one new class)

**Interfaces:**
- Consumes: `PlatformConfig.broadcastRadiusKm/pendingWarningMinutes/pendingCriticalMinutes` (Task 1) via the existing `fetchPlatformConfig`/`updatePlatformConfig` API functions (no api.ts change needed — types flow from the shared schema).

- [ ] **Step 1: Extend the settings form**

In `apps/admin/src/pages/settings-page.tsx`:

1. Widen the key union (line 20-24) and rename it to reflect its broader scope:

```ts
/** Booking-window limits + matching/SLA settings — pricing lives on Pricing & Fees. */
type SettingsKey =
  | 'maxBookingHours'
  | 'minBookingHours'
  | 'minAdvanceBookingHours'
  | 'cancellationWindowHours'
  | 'broadcastRadiusKm'
  | 'pendingWarningMinutes'
  | 'pendingCriticalMinutes';

type ConfigField = {
  key: SettingsKey;
  label: string;
  hint: string;
  step?: string;
};
```

Replace every other `BookingLimitKey` reference in the file with `SettingsKey` (the `form` state type at line 64).

2. Rename the existing `FIELDS` array to `BOOKING_FIELDS` (contents unchanged) and add below it:

```ts
const MATCHING_FIELDS: ConfigField[] = [
  {
    key: 'broadcastRadiusKm',
    label: 'Broadcast radius (km)',
    hint: 'Only nannies within this distance of the family are notified of new requests. 0 notifies everyone.',
    step: '0.5',
  },
  {
    key: 'pendingWarningMinutes',
    label: 'Pending warning threshold (min)',
    hint: 'Pending bookings older than this are highlighted yellow on the Bookings page.',
  },
  {
    key: 'pendingCriticalMinutes',
    label: 'Pending critical threshold (min)',
    hint: 'Pending bookings older than this are highlighted red on the Bookings page.',
  },
];
```

3. Extend the form initialisation effect (line 67-76):

```ts
  useEffect(() => {
    if (config && form === null) {
      setForm({
        maxBookingHours: String(config.maxBookingHours),
        minBookingHours: String(config.minBookingHours),
        minAdvanceBookingHours: String(config.minAdvanceBookingHours),
        cancellationWindowHours: String(config.cancellationWindowHours),
        broadcastRadiusKm: String(config.broadcastRadiusKm),
        pendingWarningMinutes: String(config.pendingWarningMinutes),
        pendingCriticalMinutes: String(config.pendingCriticalMinutes),
      });
    }
  }, [config, form]);
```

4. Extend `handleSubmit`'s parse input (line 91-96):

```ts
    const parsed = UpdatePlatformConfigSchema.safeParse({
      maxBookingHours: Number(form.maxBookingHours),
      minBookingHours: Number(form.minBookingHours),
      minAdvanceBookingHours: Number(form.minAdvanceBookingHours),
      cancellationWindowHours: Number(form.cancellationWindowHours),
      broadcastRadiusKm: Number(form.broadcastRadiusKm),
      pendingWarningMinutes: Number(form.pendingWarningMinutes),
      pendingCriticalMinutes: Number(form.pendingCriticalMinutes),
    });
```

(The warning < critical cross-check is enforced by the shared schema's refine from Task 1 — no extra inline check needed.)

5. Render the second group. Replace the single `form-grid` block (line 131-144) with:

```tsx
            <div className="form-grid">
              {BOOKING_FIELDS.map((field) => (
                <Field key={field.key} label={field.label} hint={field.hint}>
                  <input
                    type="number"
                    min="0"
                    step={field.step ?? '1'}
                    value={form[field.key]}
                    onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                    required
                  />
                </Field>
              ))}
            </div>
            <h2 className="form-section-title">Matching &amp; SLA</h2>
            <div className="form-grid">
              {MATCHING_FIELDS.map((field) => (
                <Field key={field.key} label={field.label} hint={field.hint}>
                  <input
                    type="number"
                    min="0"
                    step={field.step ?? '1'}
                    value={form[field.key]}
                    onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                    required
                  />
                </Field>
              ))}
            </div>
```

6. Update the `PageHeader` subtitle (line 114):

```tsx
        subtitle="Booking-window limits, nanny-matching radius, and pending-booking SLA thresholds. Rates and fees live on the Pricing & Fees page."
```

- [ ] **Step 2: Add the section-title style**

In `apps/admin/src/styles/global.css`, in the forms section (near the existing `.form-grid` rule), add:

```css
.form-section-title {
  margin: 1.75rem 0 0.75rem;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--color-text-primary);
}
```

- [ ] **Step 3: Verify**

Run: `cd apps/admin && pnpm typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/pages/settings-page.tsx apps/admin/src/styles/global.css
git commit -m "Expose broadcast radius and pending SLA thresholds in admin configuration"
```

---

### Task 8: Admin Bookings page — Waiting column + SLA row highlighting

Show how long each PENDING booking has waited and color it by the configured thresholds. **Load the `nanny-app-admin-design` skill before editing admin UI.**

**Files:**
- Modify: `apps/admin/src/components/ui/badge.tsx` (add `warning` tone)
- Modify: `apps/admin/src/components/ui/table.tsx` (add optional `rowClassName` prop)
- Modify: `apps/admin/src/pages/bookings-page.tsx`
- Modify: `apps/admin/src/styles/global.css` (badge + row classes)

**Interfaces:**
- Consumes: `AdminBooking.createdAt` (already on every row), `PlatformConfig.pendingWarningMinutes/pendingCriticalMinutes` via `fetchPlatformConfig` (query key `['platform-config']`, same as the settings page).
- Produces: `Badge` accepts `tone: 'neutral' | 'success' | 'danger' | 'warning'`; `Table` accepts `rowClassName?: (row: T) => string | undefined`.

- [ ] **Step 1: Extend Badge and Table**

`apps/admin/src/components/ui/badge.tsx` — widen the tone union (line 4):

```ts
  tone?: 'neutral' | 'success' | 'danger' | 'warning';
```

(The render already emits `badge badge--${tone}` for non-neutral tones — no other change.)

`apps/admin/src/components/ui/table.tsx`:

1. Add to `TableProps<T>` (after `onRowClick`):

```ts
  /**
   * Optional per-row class (e.g. SLA highlighting). Return undefined for rows
   * that need no extra styling.
   */
  rowClassName?: (row: T) => string | undefined;
```

2. Add `rowClassName` to the destructured props of `Table`, and apply it on the row `<tr>` (line 92-97):

```tsx
                  <tr
                    className={rowClassName?.(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    onKeyDown={clickable ? (event) => handleKeyDown(event, row) : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    role={clickable ? 'button' : undefined}
                  >
```

- [ ] **Step 2: Add the CSS**

In `apps/admin/src/styles/global.css`:

Next to `.badge--danger` (line 705):

```css
.badge--warning {
  background: var(--color-warning-light);
  color: var(--color-warning);
}
```

In the table section (near `.table-wrap`):

```css
/* SLA row highlighting — pending bookings past the warning/critical age. */
.table-row--warning td {
  background: var(--color-warning-light);
}

.table-row--danger td {
  background: var(--color-error-light);
}
```

- [ ] **Step 3: Add the Waiting column and row highlighting**

In `apps/admin/src/pages/bookings-page.tsx`:

1. Add imports: `useEffect` from react (extend line 2), `fetchPlatformConfig` in the `@admin/lib/api` import (line 35-41), and `Badge` is already imported.

2. Add module-level helpers after `nannyDecisionLabel` (line 89):

```ts
/** Whole minutes elapsed since an ISO timestamp (never negative). */
function minutesSince(iso: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
}

/** Compact waiting-time label: "8m", "1h 24m", "2d 3h". */
function formatWaiting(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

type SlaThresholds = { pendingWarningMinutes: number; pendingCriticalMinutes: number };

/** SLA tone for a pending booking's age against the configured thresholds. */
function pendingTone(mins: number, sla: SlaThresholds): 'neutral' | 'warning' | 'danger' {
  if (mins >= sla.pendingCriticalMinutes) return 'danger';
  if (mins >= sla.pendingWarningMinutes) return 'warning';
  return 'neutral';
}
```

3. Inside `BookingsPage`, after the bookings query (line 100-105), add the config query and a ticking clock:

```ts
  const { data: platformConfig } = useQuery({
    queryKey: ['platform-config'],
    queryFn: fetchPlatformConfig,
  });
  const sla: SlaThresholds = {
    pendingWarningMinutes: platformConfig?.pendingWarningMinutes ?? 15,
    pendingCriticalMinutes: platformConfig?.pendingCriticalMinutes ?? 30,
  };

  // Re-render every 30s so waiting times and SLA colors stay live.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
```

4. Add the Waiting column to the `columns` array, between the `status` column and the `override` column (after line 223):

```tsx
    {
      key: 'waiting',
      header: 'Waiting',
      nowrap: true,
      render: (b) =>
        b.status === 'PENDING' ? (
          <Badge tone={pendingTone(minutesSince(b.createdAt, now), sla)}>
            {formatWaiting(minutesSince(b.createdAt, now))}
          </Badge>
        ) : (
          <span className="table-empty">—</span>
        ),
    },
```

5. Wire row highlighting — add a `rowClassName` prop to the `<Table>` element (line 326-365):

```tsx
          rowClassName={(b) => {
            if (b.status !== 'PENDING') return undefined;
            const tone = pendingTone(minutesSince(b.createdAt, now), sla);
            if (tone === 'danger') return 'table-row--danger';
            if (tone === 'warning') return 'table-row--warning';
            return undefined;
          }}
```

6. Bump the loading skeleton column count (line 317): `<TableSkeleton columns={10} />`.

7. Update the `PageHeader` subtitle (line 307) to reflect radius-filtered broadcast:

```tsx
        subtitle="Requests are broadcast to nearby nannies (radius set in Configuration); the first to accept claims a booking and the parent pays. Edit a booking's times or override its status here."
```

- [ ] **Step 4: Verify**

Run: `cd apps/admin && pnpm typecheck`
Expected: exit 0.

Optional visual check: `cd apps/admin && pnpm dev` and open the Bookings page — PENDING rows show a Waiting badge; rows older than the thresholds tint yellow/red.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/components/ui/badge.tsx apps/admin/src/components/ui/table.tsx apps/admin/src/pages/bookings-page.tsx apps/admin/src/styles/global.css
git commit -m "Show pending-booking waiting time with SLA colors on admin bookings"
```

---

### Task 9: Full verification sweep

**Files:** none new.

- [ ] **Step 1: Run the full backend suite and all typechecks**

```bash
nvm use 22
cd apps/backend && pnpm test && pnpm typecheck
cd ../../packages/shared && pnpm typecheck
cd ../../apps/admin && pnpm typecheck
```

Expected: every command exits 0. If any pre-existing test broke (e.g. another suite that mocks `app-settings.service` without `getBroadcastRadiusKm`), fix its mock the same way as Task 4 Step 1 and re-run.

- [ ] **Step 2: Commit any stragglers**

```bash
git status
# commit only if fixes were needed:
git add -A && git commit -m "Fix test mocks for broadcast radius setting"
```
