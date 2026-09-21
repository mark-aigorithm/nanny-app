# Admin Assign / Change Nanny Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin put a nanny on an unclaimed booking request (which also approves it) or swap the nanny on an APPROVED/CONFIRMED booking, from the console.

**Architecture:** Two new admin endpoints — `GET /admin/bookings/:id/candidates` (eligible nannies, each annotated with conflict / missing-skill / distance verdicts) and `PATCH /admin/bookings/:id/nanny` (a status-guarded `updateMany`, the same atomic pattern the nanny claim uses). Both live in a new `admin-booking-assign.service.ts` that reuses the private helpers of `admin-booking.service.ts` (exported for it). The admin app gets one `AssignNannyModal` with a searchable radio list, opened from the bookings list action menu and the booking detail header.

**Tech Stack:** Express + Prisma (backend), Zod schemas in `@nanny-app/shared`, React 19 + TanStack Query + MSW/Vitest (admin), Jest unit + supertest integration (backend).

**Spec:** `Docs/superpowers/specs/2026-09-21-admin-assign-nanny-design.md`

## Global Constraints

- Statuses in which the nanny may be set/changed: **PENDING, APPROVED, CONFIRMED** — declared once in `packages/shared/src/booking.ts` and consumed by backend and admin.
- Assigning on PENDING also moves the booking to **APPROVED** and stamps `adminApprovedById/At`.
- Hard blocks: nanny not `approvalStatus = APPROVED`; overlapping booking (`assertNoConflict`). Warnings only: missing skills, outside radius.
- No new `NotificationType` — reuse `BOOKING_APPROVED`, `BOOKING_CANCELLED`, `BOOKING_EDITED`.
- New admin routes MUST have a row in `ADMIN_ROUTE_PERMISSIONS` (deny-by-default; `admin-permissions.test.ts` fails otherwise).
- Admin UI: tokens only (no raw colours), styles in `src/styles/global.css`, components from `@admin/components/ui`, errors through `apiErrorMessage`, no `window.confirm`.
- TypeScript strict + `noUncheckedIndexedAccess`; no `any`; `import type` for types.
- Windows checkout: run commands from the repo root with `pnpm --filter=…`. ESLint is broken repo-wide — verify with `typecheck` + tests, not lint.
- Commit messages end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Do **not** `git add -A` — `Docs/test-inventory.txt` belongs to another session; add files by name.

---

## File Map

| File | Responsibility |
|---|---|
| `packages/shared/src/booking.ts` | `BOOKING_NANNY_ASSIGNABLE_STATUSES` + `canAssignBookingNanny(status)` |
| `packages/shared/src/admin.ts` | `AssignBookingNannySchema`, `AdminBookingCandidateQuerySchema`, `AdminBookingCandidateSchema` + types |
| `packages/shared/src/__tests__/admin-assign-nanny.test.ts` | schema + status-set tests |
| `apps/backend/src/services/booking.service.ts` | export `nannyHomePoint`, `heldSkillIds` (already-private helpers) |
| `apps/backend/src/services/admin-booking.service.ts` | export `bookingInclude`, `parseSkillAddOns`, `toDto`, `resolveAdminId`, `notifyBookingParty`, `findAdminBooking` |
| `apps/backend/src/services/admin-booking-assign.service.ts` | **new** — `assignBookingNanny`, `listBookingCandidates` |
| `apps/backend/src/__tests__/admin-booking-assign.service.test.ts` | **new** — unit tests for both |
| `apps/backend/src/routes/admin.routes.ts` | two routes |
| `apps/backend/src/lib/admin-permissions.ts` | two privilege rows |
| `apps/backend/test/journeys/admin.ts` | `assignBookingNanny`, `fetchBookingCandidates` journey helpers |
| `apps/backend/src/__integration__/journeys/a23-admin-assign-nanny.test.ts` | **new** — HTTP contract on the real DB |
| `apps/admin/src/lib/api.ts` | `fetchBookingCandidates`, `assignBookingNanny` |
| `apps/admin/src/test/handlers.ts` | default MSW handlers for the two endpoints |
| `apps/admin/src/features/bookings/assign-nanny-modal.tsx` | **new** — the picker |
| `apps/admin/src/features/bookings/__tests__/assign-nanny-modal.test.tsx` | **new** — component tests |
| `apps/admin/src/styles/global.css` | `.candidate-*` rules |
| `apps/admin/src/pages/bookings-page.tsx` | menu item + modal; comment/subtitle cleanup |
| `apps/admin/src/pages/booking-detail-page.tsx` | header button + modal |

---

### Task 1: Shared status set and schemas

**Files:**
- Modify: `packages/shared/src/booking.ts` (after `VALID_BOOKING_TRANSITIONS`, ~line 40)
- Modify: `packages/shared/src/admin.ts` (after `UpdateBookingTimesSchema`, ~line 425)
- Create: `packages/shared/src/__tests__/admin-assign-nanny.test.ts`

**Interfaces:**
- Produces: `canAssignBookingNanny(status: string): boolean`; `BOOKING_NANNY_ASSIGNABLE_STATUSES: ReadonlySet<BookingStatus>`; `AssignBookingNannySchema` / `AssignBookingNannyInput = { nannyProfileId: number }`; `AdminBookingCandidateQuerySchema` / `AdminBookingCandidateQuery = { q?: string; limit: number }`; `AdminBookingCandidateSchema` / `AdminBookingCandidate`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/__tests__/admin-assign-nanny.test.ts
import { describe, expect, it } from 'vitest';

import {
  AdminBookingCandidateQuerySchema,
  AdminBookingCandidateSchema,
  AssignBookingNannySchema,
} from '../admin';
import { canAssignBookingNanny } from '../booking';

describe('canAssignBookingNanny', () => {
  it('allows the pre-service statuses only', () => {
    expect(canAssignBookingNanny('PENDING')).toBe(true);
    expect(canAssignBookingNanny('APPROVED')).toBe(true);
    expect(canAssignBookingNanny('CONFIRMED')).toBe(true);
  });

  it('locks a booking once the shift has started or ended', () => {
    for (const s of ['IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REFUNDED', 'NOPE']) {
      expect(canAssignBookingNanny(s)).toBe(false);
    }
  });
});

describe('AssignBookingNannySchema', () => {
  it('needs a positive integer profile id', () => {
    expect(AssignBookingNannySchema.safeParse({ nannyProfileId: 19 }).success).toBe(true);
    expect(AssignBookingNannySchema.safeParse({ nannyProfileId: 0 }).success).toBe(false);
    expect(AssignBookingNannySchema.safeParse({ nannyProfileId: '19' }).success).toBe(false);
    expect(AssignBookingNannySchema.safeParse({}).success).toBe(false);
  });
});

describe('AdminBookingCandidateQuerySchema', () => {
  it('defaults the limit and trims the search', () => {
    const parsed = AdminBookingCandidateQuerySchema.parse({ q: '  sara ' });
    expect(parsed).toEqual({ q: 'sara', limit: 20 });
  });

  it('coerces and caps the limit, and drops an empty search', () => {
    expect(AdminBookingCandidateQuerySchema.parse({ limit: '5' }).limit).toBe(5);
    expect(AdminBookingCandidateQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
    expect(AdminBookingCandidateQuerySchema.parse({ q: '   ' }).q).toBeUndefined();
  });
});

describe('AdminBookingCandidateSchema', () => {
  it('describes one picker row', () => {
    const parsed = AdminBookingCandidateSchema.safeParse({
      id: 21,
      name: 'Sara Near',
      phone: null,
      rating: 4.5,
      reviewCount: 3,
      conflict: false,
      missingSkills: ['CPR'],
      distanceKm: 1.2,
      outsideRadius: false,
    });
    expect(parsed.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter=@nanny-app/shared test -- admin-assign-nanny`
Expected: FAIL — `canAssignBookingNanny` / the three schemas are not exported.

- [ ] **Step 3: Add the status set to `packages/shared/src/booking.ts`**

Insert directly after the `VALID_BOOKING_TRANSITIONS` table (after its closing `};`):

```ts
/**
 * Statuses in which an admin may still put a nanny on the booking or swap the
 * one it has: unclaimed requests, and bookings that are approved or paid but
 * not yet started. Once the nanny has checked in the assignment is history,
 * not a plan. Consumed by the backend guard and the console's action menus so
 * neither can offer what the other refuses.
 */
export const BOOKING_NANNY_ASSIGNABLE_STATUSES: ReadonlySet<BookingStatus> = new Set<BookingStatus>([
  'PENDING',
  'APPROVED',
  'CONFIRMED',
]);

/** Non-throwing check over a status that may have come off the wire as a plain string. */
export function canAssignBookingNanny(status: string): boolean {
  return BOOKING_NANNY_ASSIGNABLE_STATUSES.has(status as BookingStatus);
}
```

(`BookingStatus` is the type already used by `VALID_BOOKING_TRANSITIONS` in this file.)

- [ ] **Step 4: Add the schemas to `packages/shared/src/admin.ts`**

Insert directly after `export type UpdateBookingTimesInput = …;`:

```ts
/**
 * Admin puts a nanny on a booking, or swaps the one it has
 * (PATCH /admin/bookings/:id/nanny). On a PENDING request this also approves
 * it — the same step a nanny's own claim performs.
 */
export const AssignBookingNannySchema = z.object({
  nannyProfileId: z.number().int().positive(),
});
export type AssignBookingNannyInput = z.infer<typeof AssignBookingNannySchema>;

/** Search for the nanny picker (GET /admin/bookings/:id/candidates). */
export const AdminBookingCandidateQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((s) => (s ? s : undefined)),
  limit: z.coerce.number().int().positive().max(50).default(20),
});
export type AdminBookingCandidateQuery = z.infer<typeof AdminBookingCandidateQuerySchema>;

/**
 * One row of the nanny picker: an approved nanny plus the verdicts an admin
 * needs before choosing her. `conflict` is a hard block (the server refuses the
 * assignment too); the other two are warnings the admin may knowingly override.
 */
export const AdminBookingCandidateSchema = z.object({
  /** NannyProfile id — what PATCH /nanny takes. */
  id: z.number().int(),
  name: z.string(),
  phone: z.string().nullable(),
  /** Cached average rating; 0 until she has a review. */
  rating: z.number(),
  reviewCount: z.number().int(),
  /** She already holds a booking overlapping this window. */
  conflict: z.boolean(),
  /** Names of the booking's skill add-ons she doesn't hold; empty when matching is off. */
  missingSkills: z.array(z.string()),
  /** Home-to-booking distance; null when either side has no coordinates. */
  distanceKm: z.number().nullable(),
  /** Beyond the configured broadcast radius (never true when radius is 0 or distance is null). */
  outsideRadius: z.boolean(),
});
export type AdminBookingCandidate = z.infer<typeof AdminBookingCandidateSchema>;
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `pnpm --filter=@nanny-app/shared test -- admin-assign-nanny && pnpm --filter=@nanny-app/shared typecheck`
Expected: 7 tests PASS; tsc clean.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/booking.ts packages/shared/src/admin.ts packages/shared/src/__tests__/admin-assign-nanny.test.ts Docs/superpowers/specs/2026-09-21-admin-assign-nanny-design.md
git commit -m "feat(shared): schemas and status set for admin nanny assignment

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `assignBookingNanny` service

**Files:**
- Modify: `apps/backend/src/services/booking.service.ts:239` (`nannyHomePoint`), `:331` (`heldSkillIds`) — add `export`
- Modify: `apps/backend/src/services/admin-booking.service.ts:43` (`bookingInclude`), `:77` (`parseSkillAddOns`), `:181` (`toDto`), `:215` (`resolveAdminId`), `:228` (`notifyBookingParty`), `:251` (`findAdminBooking`) — add `export`
- Create: `apps/backend/src/services/admin-booking-assign.service.ts`
- Create: `apps/backend/src/__tests__/admin-booking-assign.service.test.ts`

**Interfaces:**
- Consumes: `AssignBookingNannyInput`, `canAssignBookingNanny` (Task 1); `assertNoConflict(nannyProfileId, start, end, excludeBookingId)` from `booking.service`; the six exported helpers above.
- Produces: `assignBookingNanny(id: number, adminFirebaseUid: string, input: AssignBookingNannyInput): Promise<AdminBooking>`.

- [ ] **Step 1: Export the helpers**

In `booking.service.ts` change `function nannyHomePoint(` → `export function nannyHomePoint(` and `function heldSkillIds(` → `export function heldSkillIds(`.

In `admin-booking.service.ts` change:
- `const bookingInclude = {` → `export const bookingInclude = {`
- `function parseSkillAddOns(` → `export function parseSkillAddOns(`
- `function toDto(` → `export function toDto(`
- `async function resolveAdminId(` → `export async function resolveAdminId(`
- `async function notifyBookingParty(` → `export async function notifyBookingParty(`
- `async function findAdminBooking(` → `export async function findAdminBooking(`

Also export the row type next to `bookingInclude`: change `type AdminBookingRow = …` → `export type AdminBookingRow = …`.

- [ ] **Step 2: Write the failing tests**

```ts
// apps/backend/src/__tests__/admin-booking-assign.service.test.ts
import { BookingStatus as PrismaBookingStatus } from '@prisma/client';

import { AppError } from '@backend/lib/errors';

jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: { findFirst: jest.fn() },
    nannyProfile: { findFirst: jest.fn(), findMany: jest.fn() },
    booking: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
  },
}));

jest.mock('@backend/services/notification.service', () => ({
  createInAppNotification: jest.fn().mockResolvedValue({}),
  dispatchPush: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@backend/services/app-settings.service', () => ({
  getRevenueSplit: jest.fn().mockResolvedValue({ nannyPercent: 80, platformPercent: 20 }),
  getBroadcastRadiusKm: jest.fn().mockResolvedValue(0),
  getSkillMatchingEnabled: jest.fn().mockResolvedValue(true),
}));

jest.mock('@backend/services/duration-rule.service', () => ({
  listActiveDurationRules: jest.fn().mockResolvedValue([]),
}));

import { prisma } from '@backend/db/prisma';
import { createInAppNotification } from '@backend/services/notification.service';
import {
  getBroadcastRadiusKm,
  getSkillMatchingEnabled,
} from '@backend/services/app-settings.service';
import {
  assignBookingNanny,
  listBookingCandidates,
} from '@backend/services/admin-booking-assign.service';

const mockPrisma = prisma as unknown as {
  user: { findFirst: jest.Mock };
  nannyProfile: { findFirst: jest.Mock; findMany: jest.Mock };
  booking: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    updateMany: jest.Mock;
    findUniqueOrThrow: jest.Mock;
  };
};
const mockNotify = createInAppNotification as jest.Mock;
const mockRadius = getBroadcastRadiusKm as jest.Mock;
const mockSkillMatching = getSkillMatchingEnabled as jest.Mock;

const ADMIN_UID = 'fb-admin';
const ADMIN_ID = 3;
const dec = (n: number) => ({ toNumber: () => n });

/** A booking row as `bookingInclude` returns it (list-shaped). */
function makeRow(overrides: Record<string, unknown> = {}) {
  const start = new Date('2026-08-01T10:00:00.000Z');
  return {
    id: 4,
    status: PrismaBookingStatus.PENDING,
    nannyDecision: 'PENDING',
    type: 'STANDARD',
    date: start,
    startTime: start,
    endTime: new Date('2026-08-01T13:00:00.000Z'),
    durationHours: dec(3),
    totalAmount: dec(318),
    discountAmount: dec(0),
    latitude: dec(30.0444),
    longitude: dec(31.2357),
    selectedSkillFees: [],
    promoCode: null,
    payments: [{ status: 'PENDING' }],
    mother: { id: 10, firstName: 'Jane', lastName: 'Mom', phone: '+201000000000' },
    nannyProfileId: null,
    nannyProfile: null,
    createdAt: new Date('2026-07-12T00:00:00.000Z'),
    ...overrides,
  };
}

const ASSIGNED = {
  nannyProfileId: 19,
  nannyProfile: { id: 19, user: { id: 16, firstName: 'Elena', lastName: 'Nanny' } },
};

/** What `prisma.nannyProfile.findFirst` returns for the nanny being assigned. */
function makeNanny(overrides: Record<string, unknown> = {}) {
  return {
    id: 21,
    user: { id: 30, firstName: 'Sara', lastName: 'Near', approvalStatus: 'APPROVED', ...overrides },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.user.findFirst.mockResolvedValue({ id: ADMIN_ID });
  mockRadius.mockResolvedValue(0);
  mockSkillMatching.mockResolvedValue(true);
});

describe('assignBookingNanny', () => {
  function arrange(row: ReturnType<typeof makeRow>, nanny = makeNanny()) {
    mockPrisma.booking.findFirst
      .mockResolvedValueOnce(row) // findAdminBooking
      .mockResolvedValueOnce(null); // assertNoConflict: free
    mockPrisma.nannyProfile.findFirst.mockResolvedValue(nanny);
    mockPrisma.booking.updateMany.mockResolvedValue({ count: 1 });
  }

  it('assigns and approves an unclaimed PENDING request', async () => {
    arrange(makeRow());
    mockPrisma.booking.findUniqueOrThrow.mockResolvedValue(
      makeRow({
        status: PrismaBookingStatus.APPROVED,
        nannyProfileId: 21,
        nannyProfile: { id: 21, user: { id: 30, firstName: 'Sara', lastName: 'Near' } },
      }),
    );

    const result = await assignBookingNanny(4, ADMIN_UID, { nannyProfileId: 21 });

    expect(result.status).toBe('APPROVED');
    expect(result.nanny).toEqual({ id: 21, name: 'Sara Near' });

    const call = mockPrisma.booking.updateMany.mock.calls[0][0];
    // Guarded on what we read, so a concurrent claim makes this a no-op.
    expect(call.where).toEqual({
      id: 4,
      deletedAt: null,
      status: 'PENDING',
      nannyProfileId: null,
    });
    expect(call.data).toMatchObject({
      nannyProfileId: 21,
      nannyDecision: 'PENDING',
      nannyDecidedAt: null,
      status: 'APPROVED',
      adminApprovedById: ADMIN_ID,
      adminActionById: ADMIN_ID,
    });
    expect(call.data.adminApprovedAt).toBeInstanceOf(Date);

    // New nanny told; mother prompted to pay.
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 30, type: 'BOOKING_APPROVED' }),
    );
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 10,
        type: 'BOOKING_APPROVED',
        title: 'Booking approved — complete payment',
      }),
    );
    expect(mockNotify).toHaveBeenCalledTimes(2);
  });

  it('swaps the nanny on a CONFIRMED booking without touching its status', async () => {
    arrange(makeRow({ status: PrismaBookingStatus.CONFIRMED, ...ASSIGNED }));
    mockPrisma.booking.findUniqueOrThrow.mockResolvedValue(
      makeRow({
        status: PrismaBookingStatus.CONFIRMED,
        nannyProfileId: 21,
        nannyProfile: { id: 21, user: { id: 30, firstName: 'Sara', lastName: 'Near' } },
      }),
    );

    const result = await assignBookingNanny(4, ADMIN_UID, { nannyProfileId: 21 });

    expect(result.status).toBe('CONFIRMED');
    const call = mockPrisma.booking.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ status: 'CONFIRMED', nannyProfileId: 19 });
    expect(call.data.status).toBeUndefined();
    expect(call.data.adminApprovedById).toBeUndefined();
    expect(call.data).toMatchObject({ nannyProfileId: 21, nannyDecision: 'PENDING' });

    // New nanny, old nanny, and the mother (as an edit, not an approval).
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 30, type: 'BOOKING_APPROVED' }),
    );
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 16, type: 'BOOKING_CANCELLED', title: 'Booking reassigned' }),
    );
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 10,
        type: 'BOOKING_EDITED',
        body: 'Your nanny for 2026-08-01 is now Sara Near.',
      }),
    );
    expect(mockNotify).toHaveBeenCalledTimes(3);
  });

  it.each(['IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REFUNDED'] as const)(
    'refuses a %s booking',
    async (status) => {
      mockPrisma.booking.findFirst.mockResolvedValueOnce(
        makeRow({ status: PrismaBookingStatus[status], ...ASSIGNED }),
      );

      await expect(assignBookingNanny(4, ADMIN_UID, { nannyProfileId: 21 })).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('can no longer be changed'),
      });
      expect(mockPrisma.booking.updateMany).not.toHaveBeenCalled();
    },
  );

  it('refuses the nanny who is already on the booking', async () => {
    mockPrisma.booking.findFirst.mockResolvedValueOnce(
      makeRow({ status: PrismaBookingStatus.APPROVED, ...ASSIGNED }),
    );

    await expect(assignBookingNanny(4, ADMIN_UID, { nannyProfileId: 19 })).rejects.toMatchObject({
      statusCode: 400,
      message: 'That nanny is already assigned to this booking.',
    });
    expect(mockPrisma.nannyProfile.findFirst).not.toHaveBeenCalled();
  });

  it('refuses a nanny who is missing or not approved', async () => {
    mockPrisma.booking.findFirst.mockResolvedValueOnce(makeRow());
    mockPrisma.nannyProfile.findFirst.mockResolvedValueOnce(null);
    await expect(assignBookingNanny(4, ADMIN_UID, { nannyProfileId: 99 })).rejects.toMatchObject({
      statusCode: 400,
      message: 'Only an approved nanny can be assigned.',
    });

    mockPrisma.booking.findFirst.mockResolvedValueOnce(makeRow());
    mockPrisma.nannyProfile.findFirst.mockResolvedValueOnce(
      makeNanny({ approvalStatus: 'PENDING_REVIEW' }),
    );
    await expect(assignBookingNanny(4, ADMIN_UID, { nannyProfileId: 21 })).rejects.toMatchObject({
      statusCode: 400,
      message: 'Only an approved nanny can be assigned.',
    });
    expect(mockPrisma.booking.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a nanny with an overlapping booking', async () => {
    // assertNoConflict logs the clash it found, so the row needs real Dates.
    mockPrisma.booking.findFirst.mockResolvedValueOnce(makeRow()).mockResolvedValueOnce({
      id: 8,
      motherId: 11,
      status: 'CONFIRMED',
      startTime: new Date('2026-08-01T11:00:00.000Z'),
      endTime: new Date('2026-08-01T15:00:00.000Z'),
    });
    mockPrisma.nannyProfile.findFirst.mockResolvedValue(makeNanny());

    await expect(assignBookingNanny(4, ADMIN_UID, { nannyProfileId: 21 })).rejects.toBeInstanceOf(
      AppError,
    );
    expect(mockPrisma.booking.updateMany).not.toHaveBeenCalled();
  });

  it('returns 409 when the booking changed under the admin', async () => {
    arrange(makeRow());
    mockPrisma.booking.updateMany.mockResolvedValue({ count: 0 });

    await expect(assignBookingNanny(4, ADMIN_UID, { nannyProfileId: 21 })).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(mockNotify).not.toHaveBeenCalled();
  });
});
```

(The `listBookingCandidates` import is used by Task 3's tests; leave it in.)

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter=@nanny-app/backend test:unit -- admin-booking-assign`
Expected: FAIL — `Cannot find module '@backend/services/admin-booking-assign.service'`.

- [ ] **Step 4: Create the service**

```ts
// apps/backend/src/services/admin-booking-assign.service.ts
import { ApprovalStatus, BookingStatus, NannyBookingDecision, Prisma } from '@prisma/client';

import { canAssignBookingNanny } from '@nanny-app/shared';
import type {
  AdminBooking,
  AdminBookingCandidate,
  AdminBookingCandidateQuery,
  AssignBookingNannyInput,
} from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import { distanceKm, toLatLng } from '@backend/lib/geo';
import {
  bookingInclude,
  findAdminBooking,
  notifyBookingParty,
  parseSkillAddOns,
  resolveAdminId,
  toDto,
} from '@backend/services/admin-booking.service';
import {
  getBroadcastRadiusKm,
  getSkillMatchingEnabled,
} from '@backend/services/app-settings.service';
import {
  assertNoConflict,
  heldSkillIds,
  nannyHomeInclude,
  nannyHomePoint,
} from '@backend/services/booking.service';

function statusLabel(status: BookingStatus): string {
  return status.toLowerCase().replaceAll('_', ' ');
}

/**
 * Admin puts a nanny on a booking, or swaps the one it has.
 *
 * On an unclaimed PENDING request this is the console's counterpart to a
 * nanny's own claim: she is assigned AND the booking moves to APPROVED so the
 * mother is prompted to pay. On an APPROVED or CONFIRMED booking only the
 * nanny changes — the money split is a snapshot on the booking, not a property
 * of who delivers it. Anything later than CONFIRMED is locked.
 *
 * Skills and distance are the admin's call (the picker warns), but a nanny
 * can't be in two places and an unapproved one can't work, so those two are
 * refused here. The write is guarded on the status and nanny we read, the same
 * conditional-updateMany pattern the claim uses, so an assign racing a claim on
 * one PENDING request has exactly one winner.
 */
export async function assignBookingNanny(
  id: number,
  adminFirebaseUid: string,
  input: AssignBookingNannyInput,
): Promise<AdminBooking> {
  const adminId = await resolveAdminId(adminFirebaseUid);
  const booking = await findAdminBooking(id);

  if (!canAssignBookingNanny(booking.status)) {
    throw errors.badRequest(
      `This booking is ${statusLabel(booking.status)}; its nanny can no longer be changed.`,
    );
  }
  if (input.nannyProfileId === booking.nannyProfileId) {
    throw errors.badRequest('That nanny is already assigned to this booking.');
  }

  const nanny = await prisma.nannyProfile.findFirst({
    where: { id: input.nannyProfileId, deletedAt: null, user: { deletedAt: null } },
    select: {
      id: true,
      user: { select: { id: true, firstName: true, lastName: true, approvalStatus: true } },
    },
  });
  if (!nanny || nanny.user.approvalStatus !== ApprovalStatus.APPROVED) {
    throw errors.badRequest('Only an approved nanny can be assigned.');
  }

  await assertNoConflict(nanny.id, booking.startTime, booking.endTime, id);

  const now = new Date();
  const approving = booking.status === BookingStatus.PENDING;
  const written = await prisma.booking.updateMany({
    where: {
      id,
      deletedAt: null,
      status: booking.status,
      nannyProfileId: booking.nannyProfileId,
    },
    data: {
      nannyProfileId: nanny.id,
      // The new nanny hasn't answered; whatever the old one said is moot.
      nannyDecision: NannyBookingDecision.PENDING,
      nannyDecidedAt: null,
      adminActionById: adminId,
      adminActionAt: now,
      ...(approving
        ? { status: BookingStatus.APPROVED, adminApprovedById: adminId, adminApprovedAt: now }
        : {}),
    },
  });
  if (written.count === 0) {
    throw errors.conflict('This booking changed while you were editing it. Reload and try again.');
  }

  const updated = await prisma.booking.findUniqueOrThrow({
    where: { id },
    include: bookingInclude,
  });

  const dateLabel = updated.date.toISOString().slice(0, 10);
  const nannyName = `${nanny.user.firstName} ${nanny.user.lastName}`.trim();

  await notifyBookingParty(
    nanny.user.id,
    'BOOKING_APPROVED',
    'booking_approved',
    "You've been assigned a booking",
    `Our team assigned you a booking on ${dateLabel}.`,
    id,
  );
  if (booking.nannyProfile) {
    await notifyBookingParty(
      booking.nannyProfile.user.id,
      'BOOKING_CANCELLED',
      'booking_cancelled',
      'Booking reassigned',
      `You were removed from the ${dateLabel} booking by our team.`,
      id,
    );
  }
  if (approving) {
    await notifyBookingParty(
      updated.mother.id,
      'BOOKING_APPROVED',
      'booking_approved',
      'Booking approved — complete payment',
      `Your booking for ${dateLabel} was approved. Pay now to confirm it.`,
      id,
    );
  } else {
    await notifyBookingParty(
      updated.mother.id,
      'BOOKING_EDITED',
      'booking_edited',
      'Nanny changed',
      `Your nanny for ${dateLabel} is now ${nannyName}.`,
      id,
    );
  }

  return toDto(updated);
}
```

Leave `listBookingCandidates` for Task 3 — but the test file imports it, so add a stub at the bottom for now:

```ts
export async function listBookingCandidates(
  _id: number,
  _query: AdminBookingCandidateQuery,
): Promise<AdminBookingCandidate[]> {
  throw new Error('not implemented');
}
```

(`Prisma`, `distanceKm`, `toLatLng`, `getBroadcastRadiusKm`, `getSkillMatchingEnabled`, `heldSkillIds`, `nannyHomeInclude`, `nannyHomePoint`, `parseSkillAddOns` are unused until Task 3. The backend tsconfig does not set `noUnusedLocals`, so this typechecks.)

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter=@nanny-app/backend test:unit -- admin-booking-assign`
Expected: the 9 `assignBookingNanny` cases PASS.

Also run the neighbours the exports touched: `pnpm --filter=@nanny-app/backend test:unit -- admin-booking.service booking-broadcast`
Expected: PASS (exporting a function changes nothing for them).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/services/admin-booking-assign.service.ts apps/backend/src/services/admin-booking.service.ts apps/backend/src/services/booking.service.ts apps/backend/src/__tests__/admin-booking-assign.service.test.ts
git commit -m "feat(backend): admin can assign or change a booking's nanny

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `listBookingCandidates` service

**Files:**
- Modify: `apps/backend/src/services/admin-booking-assign.service.ts` (replace the stub)
- Modify: `apps/backend/src/__tests__/admin-booking-assign.service.test.ts` (append)

**Interfaces:**
- Produces: `listBookingCandidates(id: number, query: AdminBookingCandidateQuery): Promise<AdminBookingCandidate[]>`.

- [ ] **Step 1: Append the failing tests**

```ts
describe('listBookingCandidates', () => {
  /**
   * A booking as the candidates query selects it. Coordinates are plain
   * numbers, not `dec()`: `toLatLng` runs `Number()` on them, which a real
   * Prisma.Decimal supports via valueOf but the `dec` stub does not.
   */
  function bookingRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 4,
      nannyProfileId: null,
      startTime: new Date('2026-08-01T10:00:00.000Z'),
      endTime: new Date('2026-08-01T13:00:00.000Z'),
      latitude: 30.0444,
      longitude: 31.2357,
      selectedSkillFees: [
        { id: 1, name: 'CPR', feeType: 'FLAT', feeValue: 10, amountPerHour: 10 },
        { id: 2, name: 'French', feeType: null, feeValue: 0, amountPerHour: 0 },
      ],
      ...overrides,
    };
  }

  /** A nanny profile as the candidates query selects it. */
  function profile(
    id: number,
    first: string,
    skillIds: number[],
    home: { latitude: number; longitude: number } | null = { latitude: 30.0444, longitude: 31.2357 },
  ) {
    return {
      id,
      rating: dec(4.5),
      reviewCount: 3,
      user: {
        firstName: first,
        lastName: 'Nanny',
        phone: null,
        addresses: home ? [{ formattedAddress: 'x', latitude: home.latitude, longitude: home.longitude }] : [],
      },
      nannySkills: skillIds.map((skillId) => ({ skillId })),
    };
  }

  it('404s on an unknown booking', async () => {
    mockPrisma.booking.findFirst.mockResolvedValueOnce(null);
    await expect(listBookingCandidates(4, { limit: 20 })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('excludes the current nanny and filters to approved, live profiles by name', async () => {
    mockPrisma.booking.findFirst.mockResolvedValueOnce(bookingRow({ nannyProfileId: 19 }));
    mockPrisma.nannyProfile.findMany.mockResolvedValueOnce([]);
    mockPrisma.booking.findMany.mockResolvedValueOnce([]);

    await listBookingCandidates(4, { q: 'sar', limit: 5 });

    const call = mockPrisma.nannyProfile.findMany.mock.calls[0][0];
    expect(call.where).toEqual({
      deletedAt: null,
      id: { not: 19 },
      user: {
        deletedAt: null,
        approvalStatus: 'APPROVED',
        OR: [
          { firstName: { contains: 'sar', mode: 'insensitive' } },
          { lastName: { contains: 'sar', mode: 'insensitive' } },
        ],
      },
    });
    expect(call.take).toBe(5);
    // Nobody to check for clashes, so no second query.
    expect(mockPrisma.booking.findMany).not.toHaveBeenCalled();
  });

  it('flags a clash, missing skills and distance per nanny', async () => {
    mockRadius.mockResolvedValue(5);
    mockPrisma.booking.findFirst.mockResolvedValueOnce(bookingRow());
    mockPrisma.nannyProfile.findMany.mockResolvedValueOnce([
      profile(21, 'Busy', [1, 2]),
      profile(22, 'Far', [1], { latitude: 30.2, longitude: 31.2357 }), // ~17 km north
      profile(23, 'Nowhere', [1, 2], null),
    ]);
    mockPrisma.booking.findMany.mockResolvedValueOnce([{ nannyProfileId: 21 }]);

    const rows = await listBookingCandidates(4, { limit: 20 });

    // The clash query is scoped to these nannies, this window, live bookings only.
    const clash = mockPrisma.booking.findMany.mock.calls[0][0];
    expect(clash.where).toMatchObject({
      nannyProfileId: { in: [21, 22, 23] },
      id: { not: 4 },
      deletedAt: null,
      status: { notIn: ['CANCELLED', 'REFUNDED'] },
      startTime: { lt: new Date('2026-08-01T13:00:00.000Z') },
      endTime: { gt: new Date('2026-08-01T10:00:00.000Z') },
    });

    expect(rows).toEqual([
      {
        id: 21, name: 'Busy Nanny', phone: null, rating: 4.5, reviewCount: 3,
        conflict: true, missingSkills: [], distanceKm: 0, outsideRadius: false,
      },
      {
        id: 22, name: 'Far Nanny', phone: null, rating: 4.5, reviewCount: 3,
        conflict: false, missingSkills: ['French'], distanceKm: 17.3, outsideRadius: true,
      },
      {
        id: 23, name: 'Nowhere Nanny', phone: null, rating: 4.5, reviewCount: 3,
        conflict: false, missingSkills: [], distanceKm: null, outsideRadius: false,
      },
    ]);
  });

  it('reports no missing skills when matching is switched off, and no radius verdict at radius 0', async () => {
    mockSkillMatching.mockResolvedValue(false);
    mockRadius.mockResolvedValue(0);
    mockPrisma.booking.findFirst.mockResolvedValueOnce(bookingRow());
    mockPrisma.nannyProfile.findMany.mockResolvedValueOnce([
      profile(22, 'Far', [], { latitude: 30.2, longitude: 31.2357 }),
    ]);
    mockPrisma.booking.findMany.mockResolvedValueOnce([]);

    const [row] = await listBookingCandidates(4, { limit: 20 });

    expect(row?.missingSkills).toEqual([]);
    expect(row?.distanceKm).toBe(17.3);
    expect(row?.outsideRadius).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter=@nanny-app/backend test:unit -- admin-booking-assign`
Expected: the 4 new cases FAIL with `not implemented`.

- [ ] **Step 3: Replace the stub**

```ts
/**
 * The nanny picker's rows for one booking: approved, live nannies (optionally
 * name-searched), each with the three verdicts an admin weighs before
 * choosing — a clash with her other bookings (refused on assign), the add-on
 * skills she lacks, and how far the job is from her home. The two soft ones use
 * the same helpers and settings as the broadcast, so the picker and the pool
 * agree on what "eligible" means.
 */
export async function listBookingCandidates(
  id: number,
  { q, limit }: AdminBookingCandidateQuery,
): Promise<AdminBookingCandidate[]> {
  const booking = await prisma.booking.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      nannyProfileId: true,
      startTime: true,
      endTime: true,
      latitude: true,
      longitude: true,
      selectedSkillFees: true,
    },
  });
  if (!booking) throw errors.notFound('Booking not found');

  const nameFilter: Prisma.UserWhereInput = q
    ? {
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
        ],
      }
    : {};

  const [radiusKm, skillMatching, profiles] = await Promise.all([
    getBroadcastRadiusKm(),
    getSkillMatchingEnabled(),
    prisma.nannyProfile.findMany({
      where: {
        deletedAt: null,
        ...(booking.nannyProfileId ? { id: { not: booking.nannyProfileId } } : {}),
        user: { deletedAt: null, approvalStatus: ApprovalStatus.APPROVED, ...nameFilter },
      },
      select: {
        id: true,
        rating: true,
        reviewCount: true,
        user: {
          select: { firstName: true, lastName: true, phone: true, ...nannyHomeInclude },
        },
        nannySkills: { where: { deletedAt: null }, select: { skillId: true } },
      },
      orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
      take: limit,
    }),
  ]);

  // One query for every clash, not one per nanny.
  const busy = new Set<number>();
  if (profiles.length > 0) {
    const clashes = await prisma.booking.findMany({
      where: {
        nannyProfileId: { in: profiles.map((p) => p.id) },
        id: { not: booking.id },
        deletedAt: null,
        status: { notIn: [BookingStatus.CANCELLED, BookingStatus.REFUNDED] },
        startTime: { lt: booking.endTime },
        endTime: { gt: booking.startTime },
      },
      select: { nannyProfileId: true },
    });
    for (const c of clashes) if (c.nannyProfileId !== null) busy.add(c.nannyProfileId);
  }

  const required = parseSkillAddOns(booking.selectedSkillFees);
  const bookingPoint = toLatLng(booking.latitude, booking.longitude);

  return profiles.map((p) => {
    const held = heldSkillIds(p.nannySkills);
    const home = nannyHomePoint(p.user);
    const distance =
      bookingPoint && home ? Math.round(distanceKm(bookingPoint, home) * 10) / 10 : null;
    return {
      id: p.id,
      name: `${p.user.firstName} ${p.user.lastName}`.trim(),
      phone: p.user.phone,
      rating: p.rating.toNumber(),
      reviewCount: p.reviewCount,
      conflict: busy.has(p.id),
      missingSkills: skillMatching
        ? required.filter((s) => !held.has(s.id)).map((s) => s.name)
        : [],
      distanceKm: distance,
      outsideRadius: radiusKm > 0 && distance !== null && distance > radiusKm,
    };
  });
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `pnpm --filter=@nanny-app/backend test:unit -- admin-booking-assign && pnpm --filter=@nanny-app/backend typecheck`
Expected: all 13 cases PASS; tsc clean. If the haversine rounding lands on 17.2 or 17.4 rather than 17.3, fix the expected value in the test to what `distanceKm` actually returns — the assertion is about rounding to one decimal, not the exact figure.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/admin-booking-assign.service.ts apps/backend/src/__tests__/admin-booking-assign.service.test.ts
git commit -m "feat(backend): candidate nannies for a booking, with clash/skill/distance verdicts

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Routes, privileges, and the integration journey

**Files:**
- Modify: `apps/backend/src/routes/admin.routes.ts` (imports at top; routes after the `/bookings/:id/times` route, ~line 276)
- Modify: `apps/backend/src/lib/admin-permissions.ts:70` (after the `/bookings/:id/times` row)
- Modify: `apps/backend/test/journeys/admin.ts` (after `updateBookingTimes`)
- Create: `apps/backend/src/__integration__/journeys/a23-admin-assign-nanny.test.ts`

**Interfaces:**
- Consumes: `assignBookingNanny`, `listBookingCandidates` (Tasks 2–3); `AssignBookingNannySchema`, `AdminBookingCandidateQuerySchema` (Task 1).
- Produces: `PATCH /admin/bookings/:id/nanny` → `AdminBooking`; `GET /admin/bookings/:id/candidates?q=&limit=` → `AdminBookingCandidate[]`; journey helpers `assignBookingNanny(token, bookingId, nannyProfileId)` and `fetchBookingCandidates(token, bookingId, q?)`.

- [ ] **Step 1: Run the privilege test to see it fail once the routes exist (do routes first)**

Add the routes to `admin.routes.ts`. Extend the existing `@nanny-app/shared` import with `AdminBookingCandidateQuerySchema`, `AssignBookingNannySchema` and the types `AdminBookingCandidateQuery`; add:

```ts
import {
  assignBookingNanny,
  listBookingCandidates,
} from '@backend/services/admin-booking-assign.service';
```

Then, directly after the `'/bookings/:id/times'` route:

```ts
// ── Nanny assignment (unclaimed request, or swap on a paid booking) ──

adminRouter.get(
  '/bookings/:id/candidates',
  validateQuery(AdminBookingCandidateQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = res.locals['validatedQuery'] as AdminBookingCandidateQuery;
      res.json(ok(await listBookingCandidates(routeIdParam(req.params.id), query)));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.patch(
  '/bookings/:id/nanny',
  validateBody(AssignBookingNannySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      res.json(
        ok(await assignBookingNanny(routeIdParam(req.params.id), req.firebaseUser.uid, req.body)),
      );
    } catch (err) {
      next(err);
    }
  },
);
```

Run: `pnpm --filter=@nanny-app/backend test:unit -- admin-permissions`
Expected: FAIL — "declares a privilege for every route on the admin router" lists `GET /bookings/:id/candidates` and `PATCH /bookings/:id/nanny`.

- [ ] **Step 2: Declare the privileges**

In `admin-permissions.ts`, after the `/bookings/:id/times` row:

```ts
  { method: 'GET', pattern: '/bookings/:id/candidates', requires: section('bookings', 'VIEW') },
  { method: 'PATCH', pattern: '/bookings/:id/nanny', requires: section('bookings', 'MANAGE') },
```

Run: `pnpm --filter=@nanny-app/backend test:unit -- admin-permissions && pnpm --filter=@nanny-app/backend typecheck`
Expected: PASS; tsc clean.

- [ ] **Step 3: Add the journey helpers**

In `apps/backend/test/journeys/admin.ts`, after `updateBookingTimes`:

```ts
export function assignBookingNanny(token: string, bookingId: number, nannyProfileId: number) {
  return send(token, 'patch', `/admin/bookings/${bookingId}/nanny`, { nannyProfileId });
}

/** The picker's rows; `q` narrows by name like the console's search box. */
export async function fetchBookingCandidates(
  token: string,
  bookingId: number,
  q?: string,
): Promise<AdminBookingCandidate[]> {
  const response = await request(app)
    .get(`/admin/bookings/${bookingId}/candidates`)
    .query(q === undefined ? {} : { q })
    .set(...authHeader(token));

  if (response.status !== 200) {
    throw new Error(
      `GET /admin/bookings/${bookingId}/candidates failed with ${response.status}: ` +
        JSON.stringify(response.body),
    );
  }
  return response.body.data as AdminBookingCandidate[];
}
```

Add `AdminBookingCandidate` to the file's `import type { … } from '@nanny-app/shared'`.

- [ ] **Step 4: Write the integration journey**

```ts
// apps/backend/src/__integration__/journeys/a23-admin-assign-nanny.test.ts
/**
 * A23 — the console puts a nanny on a booking.
 *
 * Two shapes: an unclaimed request nobody took (assign = approve, so the
 * mother can pay), and a paid booking whose nanny has to be swapped (only the
 * nanny changes; the Payment row is untouched). The picker must mark the nanny
 * who is already booked for that window, and the server must refuse her.
 */
import { prisma } from '@backend/db/prisma';

import { makeBooking, makeMother, makeNanny, makeSuperuser } from '../../../test/factories';
import { assignBookingNanny, fetchBookingCandidates } from '../../../test/journeys/admin';
import { claimBooking, createBookingViaApi } from '../../../test/journeys/booking';
import { payViaPaymob, resetPaymobFake } from '../../../test/journeys/payment';

beforeEach(() => resetPaymobFake());

describe('A23 — admin assigns a nanny', () => {
  it('assigns an unclaimed request and approves it so the mother can pay', async () => {
    const mother = await makeMother();
    const nanny = await makeNanny();
    const admin = await makeSuperuser();

    const created = await createBookingViaApi(mother.token);
    expect(created.status).toBe('PENDING');

    const result = (await assignBookingNanny(admin.token, created.id, nanny.nannyProfileId)) as {
      status: string;
      nanny: { id: number } | null;
    };
    expect(result.status).toBe('APPROVED');
    expect(result.nanny?.id).toBe(nanny.nannyProfileId);

    const row = await prisma.booking.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.nannyProfileId).toBe(nanny.nannyProfileId);
    expect(row.adminApprovedById).toBe(admin.id);
    expect(row.adminActionById).toBe(admin.id);
    expect(row.nannyDecision).toBe('PENDING');

    // Both parties hear about it: the nanny that she has work, the mother that she must pay.
    expect(
      await prisma.notification.findFirst({ where: { userId: nanny.id, type: 'BOOKING_APPROVED' } }),
    ).not.toBeNull();
    expect(
      await prisma.notification.findFirst({ where: { userId: mother.id, type: 'BOOKING_APPROVED' } }),
    ).not.toBeNull();

    // And the booking is now payable — the whole point of approving it.
    await payViaPaymob(mother.token, 'booking', created.id);
    const paid = await prisma.booking.findUniqueOrThrow({ where: { id: created.id } });
    expect(paid.status).toBe('CONFIRMED');
  });

  it('swaps the nanny on a paid booking and leaves the payment alone', async () => {
    const mother = await makeMother();
    const first = await makeNanny();
    const second = await makeNanny();
    const admin = await makeSuperuser();

    const created = await createBookingViaApi(mother.token);
    await claimBooking(first.token, created.id);
    await payViaPaymob(mother.token, 'booking', created.id);
    const before = await prisma.payment.findFirstOrThrow({ where: { bookingId: created.id } });

    await assignBookingNanny(admin.token, created.id, second.nannyProfileId);

    const row = await prisma.booking.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.status).toBe('CONFIRMED');
    expect(row.nannyProfileId).toBe(second.nannyProfileId);
    expect(row.adminApprovedById).toBeNull(); // not an approval — it was already paid

    const after = await prisma.payment.findFirstOrThrow({ where: { bookingId: created.id } });
    expect(after).toEqual(before);

    expect(
      await prisma.notification.findFirst({ where: { userId: first.id, type: 'BOOKING_CANCELLED' } }),
    ).not.toBeNull();
    expect(
      await prisma.notification.findFirst({ where: { userId: second.id, type: 'BOOKING_APPROVED' } }),
    ).not.toBeNull();
    expect(
      await prisma.notification.findFirst({ where: { userId: mother.id, type: 'BOOKING_EDITED' } }),
    ).not.toBeNull();
  });

  it('marks a nanny booked for that window as busy and refuses to assign her', async () => {
    const mother = await makeMother();
    const otherMother = await makeMother();
    const busy = await makeNanny({ user: { firstName: 'Busy' } });
    const free = await makeNanny({ user: { firstName: 'Free' } });
    const admin = await makeSuperuser();

    // Both land on tomorrow. The factory's window is 10:00–14:00 UTC; the API's
    // is 10:00–14:00 Cairo wall-clock (07:00–11:00 or 08:00–12:00 UTC depending
    // on the season) — they always overlap by at least an hour.
    await makeBooking({ motherId: otherMother.id, nannyProfileId: busy.nannyProfileId, status: 'CONFIRMED' });
    const request = await createBookingViaApi(mother.token);

    const candidates = await fetchBookingCandidates(admin.token, request.id);
    const byId = new Map(candidates.map((c) => [c.id, c]));
    expect(byId.get(busy.nannyProfileId)?.conflict).toBe(true);
    expect(byId.get(free.nannyProfileId)?.conflict).toBe(false);

    await expect(
      assignBookingNanny(admin.token, request.id, busy.nannyProfileId),
    ).rejects.toThrow(/409|400/);

    // Still unclaimed — the refused write left nothing behind.
    const row = await prisma.booking.findUniqueOrThrow({ where: { id: request.id } });
    expect(row.status).toBe('PENDING');
    expect(row.nannyProfileId).toBeNull();
  });

  it('narrows the picker by name', async () => {
    const mother = await makeMother();
    await makeNanny({ user: { firstName: 'Sara' } });
    await makeNanny({ user: { firstName: 'Nour' } });
    const admin = await makeSuperuser();
    const request = await createBookingViaApi(mother.token);

    const rows = await fetchBookingCandidates(admin.token, request.id, 'sar');
    expect(rows.map((r) => r.name.split(' ')[0])).toEqual(['Sara']);
  });
});
```

(`makeNanny`'s `user` overrides are `Partial<Prisma.UserCreateInput>`, so `firstName` is accepted; the factory's default `lastName` is `'nanny'`, hence the `split(' ')[0]` in the last test.)

- [ ] **Step 5: Run the journey against the test stack**

Start the stack first (from the repo root): `pnpm test:env` — wait until PostGIS on :55432 and the Auth emulator on :9099 are up (see the `test-stack` memory: Docker Desktop lives on D: and starts cold). Make sure no other worktree's backend is on :3001.

Run: `pnpm --filter=@nanny-app/backend test:integration -- a23-admin-assign-nanny`
Expected: 4 tests PASS. If `assertNoConflict` throws 400 rather than 409, the third test's regex already accepts both.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/routes/admin.routes.ts apps/backend/src/lib/admin-permissions.ts apps/backend/test/journeys/admin.ts apps/backend/src/__integration__/journeys/a23-admin-assign-nanny.test.ts
git commit -m "feat(backend): routes and journey for admin nanny assignment

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Admin API client, MSW defaults, and the picker modal

**Files:**
- Modify: `apps/admin/src/lib/api.ts` (after `setBookingStatus`, ~line 411)
- Modify: `apps/admin/src/test/handlers.ts`
- Create: `apps/admin/src/features/bookings/assign-nanny-modal.tsx`
- Create: `apps/admin/src/features/bookings/__tests__/assign-nanny-modal.test.tsx`
- Modify: `apps/admin/src/styles/global.css` (new section after the `.modal-footer` rule, ~line 2430)

**Interfaces:**
- Consumes: `AdminBookingCandidate`, `AdminBooking` (shared).
- Produces: `fetchBookingCandidates(id: number, q?: string): Promise<AdminBookingCandidate[]>`; `assignBookingNanny(id: number, nannyProfileId: number): Promise<AdminBooking>`; `AssignNannyModal({ booking: AssignableBooking, onClose })` where `AssignableBooking = { id: number; status: string; date: string; nanny: { id: number; name: string } | null }`.

- [ ] **Step 1: Add the API functions**

In `apps/admin/src/lib/api.ts`, add `AdminBookingCandidate` to the `@nanny-app/shared` type import, then after `setBookingStatus`:

```ts
export async function fetchBookingCandidates(
  id: number,
  q?: string,
): Promise<AdminBookingCandidate[]> {
  const res = await apiClient.get<ApiEnvelope<AdminBookingCandidate[]>>(
    `/admin/bookings/${id}/candidates`,
    { params: q ? { q } : {} },
  );
  return res.data.data;
}

export async function assignBookingNanny(id: number, nannyProfileId: number): Promise<AdminBooking> {
  const res = await apiClient.patch<ApiEnvelope<AdminBooking>>(`/admin/bookings/${id}/nanny`, {
    nannyProfileId,
  });
  return res.data.data;
}
```

- [ ] **Step 2: Write the failing component test**

```tsx
// apps/admin/src/features/bookings/__tests__/assign-nanny-modal.test.tsx
/**
 * The picker's job is to make the eligibility verdicts visible and to send
 * exactly one id. A busy nanny can't be chosen at all; the soft warnings show
 * but don't block; the primary button says what will happen (approve or not).
 */
import type { AdminBooking, AdminBookingCandidate } from '@nanny-app/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { AssignNannyModal } from '@admin/features/bookings/assign-nanny-modal';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

function ok<T>(data: T) {
  return HttpResponse.json({ data, error: null });
}

const CANDIDATES: AdminBookingCandidate[] = [
  { id: 21, name: 'Amira Busy', phone: null, rating: 4.5, reviewCount: 3, conflict: true, missingSkills: [], distanceKm: 1.2, outsideRadius: false },
  { id: 22, name: 'Nour Far', phone: '+201000000002', rating: 0, reviewCount: 0, conflict: false, missingSkills: ['CPR'], distanceKm: 12.4, outsideRadius: true },
  { id: 23, name: 'Sara Near', phone: '+201000000003', rating: 4.9, reviewCount: 12, conflict: false, missingSkills: [], distanceKm: 0.8, outsideRadius: false },
];

const PENDING = { id: 4, status: 'PENDING', date: '2026-09-21', nanny: null };
const CONFIRMED = { id: 4, status: 'CONFIRMED', date: '2026-09-21', nanny: { id: 21, name: 'Amira Busy' } };

const UPDATED: AdminBooking = {
  id: 4,
  status: 'APPROVED',
  nannyDecision: 'PENDING',
  type: 'STANDARD',
  date: '2026-09-21',
  startTime: '2026-09-21T14:00:00+03:00',
  endTime: '2026-09-21T17:00:00+03:00',
  durationHours: 3,
  totalAmount: 318,
  discountAmount: 0,
  promoCode: null,
  paymentStatus: null,
  mother: { id: 10, name: 'Jane Mom', phone: null },
  nanny: { id: 23, name: 'Sara Near' },
  createdAt: '2026-09-12T00:00:00.000Z',
};

function backend() {
  const patches: unknown[] = [];
  server.use(
    http.get('/api/admin/bookings/4/candidates', () => ok(CANDIDATES)),
    http.patch('/api/admin/bookings/4/nanny', async ({ request }) => {
      patches.push(await request.json());
      return ok(UPDATED);
    }),
  );
  return patches;
}

function renderModal(booking: typeof PENDING | typeof CONFIRMED, onClose = vi.fn()) {
  renderWithProviders(
    <ToastProvider>
      <AssignNannyModal booking={booking} onClose={onClose} />
    </ToastProvider>,
  );
  return onClose;
}

describe('AssignNannyModal', () => {
  it('disables a busy nanny and shows the soft warnings', async () => {
    backend();
    renderModal(PENDING);

    expect(await screen.findByRole('radio', { name: /Amira Busy/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /Nour Far/ })).toBeEnabled();
    expect(screen.getByText('Busy')).toBeInTheDocument();
    expect(screen.getByText('Missing: CPR')).toBeInTheDocument();
    expect(screen.getByText('12.4 km away')).toBeInTheDocument();
    expect(screen.getByText('★ 4.9 (12)')).toBeInTheDocument();
  });

  it('assigns and approves a pending request', async () => {
    const patches = backend();
    const onClose = renderModal(PENDING);
    const user = userEvent.setup();

    const button = await screen.findByRole('button', { name: 'Assign & approve' });
    expect(button).toBeDisabled();
    expect(screen.getByText(/parent will be asked to pay/i)).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /Sara Near/ }));
    await user.click(button);

    await waitFor(() => expect(patches).toEqual([{ nannyProfileId: 23 }]));
    expect(await screen.findByText('Nanny assigned')).toBeInTheDocument();
    expect(onClose).toHaveBeenCalled();
  });

  it('offers to change the nanny on a paid booking without an approval note', async () => {
    backend();
    renderModal(CONFIRMED);

    expect(await screen.findByRole('button', { name: 'Change nanny' })).toBeInTheDocument();
    expect(screen.queryByText(/parent will be asked to pay/i)).not.toBeInTheDocument();
  });

  it('sends the search box as q', async () => {
    const seen: string[] = [];
    server.use(
      http.get('/api/admin/bookings/4/candidates', ({ request }) => {
        seen.push(new URL(request.url).searchParams.get('q') ?? '');
        return ok([]);
      }),
    );
    renderModal(PENDING);
    const user = userEvent.setup();

    await screen.findByText('No approved nannies match.');
    await user.type(screen.getByRole('searchbox', { name: 'Search nannies' }), 'sar');

    await waitFor(() => expect(seen).toContain('sar'));
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter=@nanny-app/admin test -- assign-nanny-modal`
Expected: FAIL — cannot resolve `@admin/features/bookings/assign-nanny-modal`.

- [ ] **Step 4: Write the modal**

```tsx
// apps/admin/src/features/bookings/assign-nanny-modal.tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import type { AdminBookingCandidate } from '@nanny-app/shared';

import {
  Badge,
  Button,
  ErrorState,
  Input,
  LoadingState,
  Modal,
  useToast,
} from '@admin/components/ui';
import { assignBookingNanny, fetchBookingCandidates } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

/** The booking fields the picker needs — both the list and detail DTOs satisfy it. */
export type AssignableBooking = {
  id: number;
  status: string;
  date: string;
  nanny: { id: number; name: string } | null;
};

type AssignNannyModalProps = {
  booking: AssignableBooking;
  onClose: () => void;
};

const SEARCH_DEBOUNCE_MS = 250;

function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

function ratingLabel(c: AdminBookingCandidate): string {
  return c.reviewCount > 0 ? `★ ${c.rating.toFixed(1)} (${c.reviewCount})` : 'No reviews yet';
}

/**
 * Searchable radio list of the nannies an admin may put on this booking. The
 * server decides eligibility (see AdminBookingCandidate); this only makes the
 * verdicts legible — a busy nanny can't be picked, the soft warnings can be
 * overridden knowingly — and says up front when choosing also approves.
 */
export function AssignNannyModal({ booking, onClose }: AssignNannyModalProps) {
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), SEARCH_DEBOUNCE_MS);
  const [selected, setSelected] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data: candidates, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['booking-candidates', booking.id, q],
    queryFn: () => fetchBookingCandidates(booking.id, q || undefined),
  });

  const mutation = useMutation({
    mutationFn: (nannyProfileId: number) => assignBookingNanny(booking.id, nannyProfileId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
      // The detail page keys on the route param, which is a string.
      void queryClient.invalidateQueries({ queryKey: ['booking', String(booking.id)] });
      toast.success('Nanny assigned');
      onClose();
    },
    onError: (err) => toast.error('Couldn’t assign nanny', apiErrorMessage(err)),
  });

  const approving = booking.status === 'PENDING';
  const title = booking.nanny ? 'Change nanny' : 'Assign nanny';
  const confirmLabel = approving ? 'Assign & approve' : title;

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => selected !== null && mutation.mutate(selected)}
            disabled={selected === null || mutation.isPending}
          >
            {mutation.isPending ? 'Assigning…' : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="candidate-picker">
        {booking.nanny && (
          <p className="candidate-current">
            Currently assigned: <strong>{booking.nanny.name}</strong>
          </p>
        )}
        {approving && (
          <p className="field-hint">
            The parent will be asked to pay once the nanny is assigned.
          </p>
        )}
        <label className="candidate-search">
          <span className="sr-only">Search nannies</span>
          <Input
            type="search"
            placeholder="Search by name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </label>

        {isLoading && <LoadingState label="Loading nannies…" />}
        {error != null && !candidates && (
          <ErrorState
            message={apiErrorMessage(error)}
            onRetry={() => void refetch()}
            retrying={isFetching}
          />
        )}
        {candidates && candidates.length === 0 && (
          <p className="empty-state">No approved nannies match.</p>
        )}
        {candidates && candidates.length > 0 && (
          <ul className="candidate-list" role="radiogroup" aria-label="Nannies">
            {candidates.map((c) => {
              const classes = [
                'candidate-row',
                c.id === selected && 'candidate-row--selected',
                c.conflict && 'candidate-row--disabled',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <li key={c.id}>
                  <label className={classes} title={c.conflict ? 'Has an overlapping booking' : undefined}>
                    <input
                      type="radio"
                      name="candidate"
                      value={c.id}
                      checked={c.id === selected}
                      disabled={c.conflict}
                      onChange={() => setSelected(c.id)}
                    />
                    <span className="candidate-main">
                      <span className="candidate-name">{c.name}</span>
                      <span className="candidate-meta">
                        <span>{ratingLabel(c)}</span>
                        {c.phone && <span> · {c.phone}</span>}
                      </span>
                    </span>
                    <span className="candidate-badges">
                      {c.conflict && <Badge tone="danger">Busy</Badge>}
                      {c.missingSkills.length > 0 && (
                        <Badge tone="warning">Missing: {c.missingSkills.join(', ')}</Badge>
                      )}
                      {c.outsideRadius && c.distanceKm !== null && (
                        <Badge tone="warning">{c.distanceKm} km away</Badge>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
```

- [ ] **Step 5: Add the styles**

`global.css` has no `.sr-only` today, so this block adds one. In `apps/admin/src/styles/global.css`, after the `.modal-footer` rule:

```css
/* ── Nanny picker (Bookings → Assign / Change nanny) ────── */

/* Visually hidden but read by screen readers — the search box's label. */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.candidate-picker {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.candidate-current {
  margin: 0;
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.candidate-search {
  display: block;
}

.candidate-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 22rem;
  overflow-y: auto;
}

/* The radio itself is the accessible control; the whole row is its label so
   the target is generous and the selected state can colour the row. */
.candidate-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  cursor: pointer;
}

.candidate-row:hover {
  border-color: var(--color-primary);
}

.candidate-row--selected {
  border-color: var(--color-primary);
  background: var(--color-primary-muted);
}

.candidate-row--disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.candidate-row--disabled:hover {
  border-color: var(--color-border-subtle);
}

.candidate-row:focus-within {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.candidate-main {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  flex-direction: column;
  gap: 0.1rem;
}

.candidate-name {
  font-weight: 600;
  color: var(--color-text-primary);
}

.candidate-meta {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}

.candidate-badges {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.35rem;
}
```

Every colour above is an existing `:root` token (`--color-border-subtle`, `--color-primary`, `--color-primary-muted`, `--color-surface`, `--color-text-primary`, `--color-text-secondary`, `--color-text-muted`) — verified against `global.css` when this plan was written.

- [ ] **Step 6: Add default MSW handlers**

In `apps/admin/src/test/handlers.ts`, extend `handlers`:

```ts
export const handlers = [
  http.get('/api/admin/skills', () => ok([SKILL_FIXTURE])),
  // The nanny picker: an empty pool by default; a test that wants rows overrides it.
  http.get('/api/admin/bookings/:id/candidates', () => ok([])),
];
```

- [ ] **Step 7: Run the tests and typecheck**

Run: `pnpm --filter=@nanny-app/admin test -- assign-nanny-modal && pnpm --filter=@nanny-app/admin typecheck`
Expected: 4 tests PASS; tsc clean. If `getByRole('searchbox', …)` fails to find the input, the accessible name isn't reaching it — make sure the `<span className="sr-only">` sits inside the same `<label>` as the `<Input>`.

- [ ] **Step 8: Commit**

```bash
git add apps/admin/src/lib/api.ts apps/admin/src/test/handlers.ts apps/admin/src/features/bookings/assign-nanny-modal.tsx apps/admin/src/features/bookings/__tests__/assign-nanny-modal.test.tsx apps/admin/src/styles/global.css
git commit -m "feat(admin): nanny picker modal for assigning a booking

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Wire the picker into the bookings list and the detail page

**Files:**
- Modify: `apps/admin/src/pages/bookings-page.tsx` (imports; `canApproveBooking` comment ~line 71; state ~line 148; action menu ~line 360; dialogs at the bottom; `PageHeader` subtitle ~line 406)
- Modify: `apps/admin/src/pages/booking-detail-page.tsx` (imports; state; `actions`; render)

**Interfaces:**
- Consumes: `AssignNannyModal` (Task 5); `canAssignBookingNanny` (Task 1); `UserPlus` icon from `@admin/components/ui`.

- [ ] **Step 1: Bookings list**

Imports: add `canAssignBookingNanny` to the `@nanny-app/shared` import; add `UserPlus` to the `@admin/components/ui` import; add
`import { AssignNannyModal } from '@admin/features/bookings/assign-nanny-modal';`.

Replace the `canApproveBooking` doc comment (the paragraph that starts "Two rules, both the server's") with:

```ts
/**
 * Whether this booking can be approved.
 *
 * Two rules, both the server's. The transition table only allows PENDING →
 * APPROVED; on top of that, `approveBooking` refuses a booking with no nanny
 * assigned. A request gets its nanny either from her own claim (which approves
 * it itself) or from an admin's "Assign nanny", which also approves — so in
 * practice Approve appears only on the rare request that was assigned some
 * other way.
 */
```

State, next to `rejecting`:

```ts
  const [assigning, setAssigning] = useState<AdminBooking | null>(null);
```

In the actions cell, insert **before** the `{!isTerminal && (` "Edit times" item:

```tsx
            {canAssignBookingNanny(booking.status) && (
              <MenuItem
                icon={<UserPlus size={ICON_SIZE.menu} />}
                onSelect={() => setAssigning(booking)}
              >
                {booking.nanny ? 'Change nanny' : 'Assign nanny'}
              </MenuItem>
            )}
```

At the bottom, next to the `{rejecting && (…)}` block:

```tsx
      {assigning && (
        <AssignNannyModal booking={assigning} onClose={() => setAssigning(null)} />
      )}
```

Update the `PageHeader` subtitle to:

```
Requests are broadcast to nearby nannies (radius set in Configuration); the first to accept claims a booking and the parent pays. Assign a nanny yourself when nobody claims one, change the nanny on a booking, edit its times, or override its status here.
```

- [ ] **Step 2: Detail page**

Imports: add `canAssignBookingNanny` to the `@nanny-app/shared` import; add
`import { AssignNannyModal } from '@admin/features/bookings/assign-nanny-modal';`.

State, next to `editing`:

```ts
  const [assigning, setAssigning] = useState(false);
```

After `const canEdit = …`:

```ts
  const canAssign = canManage && booking != null && canAssignBookingNanny(booking.status);
```

Replace the `actions` expression with:

```tsx
  const actions =
    editing && canEdit ? (
      <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
        Cancel
      </Button>
    ) : canEdit || canAssign ? (
      <>
        {canAssign && (
          <Button variant="ghost" size="sm" onClick={() => setAssigning(true)}>
            {booking?.nanny ? 'Change nanny' : 'Assign nanny'}
          </Button>
        )}
        {canEdit && (
          <Button size="sm" onClick={() => setEditing(true)}>
            Edit booking
          </Button>
        )}
      </>
    ) : undefined;
```

Inside the `{booking && (<>…</>)}` fragment, after the `BookingEditor`/`BookingSections` branch:

```tsx
          {assigning && canAssign && (
            <AssignNannyModal booking={booking} onClose={() => setAssigning(false)} />
          )}
```

(`AdminBookingDetail` has `id`, `status`, `date`, `nanny: { id, name, … } | null`, so it satisfies `AssignableBooking` structurally.)

- [ ] **Step 3: Typecheck and run the admin suite**

Run: `pnpm --filter=@nanny-app/admin typecheck && pnpm --filter=@nanny-app/admin test`
Expected: tsc clean; every test PASS (the detail-page test's `/api/admin/bookings/4` handler is unaffected; the default candidates handler from Task 5 covers any incidental fetch).

- [ ] **Step 4: See it in the browser**

Use the `run` skill (or `preview_start` with the admin dev config) against a backend on the test stack; open a PENDING booking, choose **Actions → Assign nanny**, pick a nanny, confirm — the row should move to Approved and the toast should read "Nanny assigned". Open the same booking's detail page and confirm **Change nanny** appears in the header. Take a screenshot for the PR.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/pages/bookings-page.tsx apps/admin/src/pages/booking-detail-page.tsx
git commit -m "feat(admin): assign or change a booking's nanny from the list and detail pages

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Full verification

- [ ] **Step 1: Every unit tier**

Run from the repo root:

```bash
pnpm --filter=@nanny-app/shared test && pnpm --filter=@nanny-app/backend test:unit && pnpm --filter=@nanny-app/admin test
```

Expected: all PASS.

- [ ] **Step 2: Typecheck everything touched**

```bash
pnpm --filter=@nanny-app/shared typecheck && pnpm --filter=@nanny-app/backend typecheck && pnpm --filter=@nanny-app/admin typecheck
```

Expected: clean. (The mobile app consumes `@nanny-app/shared` too; the additions are purely new exports, so `pnpm --filter=@nanny-app/mobile typecheck` should also be clean — run it if time allows.)

- [ ] **Step 3: Integration**

With the test stack up: `pnpm --filter=@nanny-app/backend test:integration -- a23-admin-assign-nanny a12-operator-access-matrix`
Expected: PASS — a12 confirms the deny-by-default gate still holds with the two new rows.

- [ ] **Step 4: Review**

Invoke `superpowers:requesting-code-review` (or `/review`) on the branch before opening a PR.
