# Start PIN in the admin booking detail — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the parent's live 4-digit start PIN (and its expiry) on the admin booking detail page.

**Architecture:** The PIN is currently persisted only as an unsalted sha-256 (`bookings.start_pin_hash`), so the console has nothing to read. Replace the hash with a plaintext `start_pin` column (two-release rule: this change adds the column and stops touching the hash; a later release drops it), expose the PIN from the admin detail DTO only while it is live, and add one read-only row to the Schedule card.

**Tech Stack:** Prisma 7 (hand-written migration SQL), Express services with Jest unit tests (mocked Prisma), Zod schemas in `packages/shared`, React 19 admin page with Vitest + Testing Library + MSW.

Spec: `Docs/superpowers/specs/2026-09-21-admin-start-pin-design.md`.

## Global Constraints

- Strict TypeScript, no `any`, `noUncheckedIndexedAccess`.
- Backend: routes hold no logic; services are the only Prisma callers; `throw AppError` via `errors.*`.
- Backend two-release rule for column drops: `start_pin_hash` stays in `schema.prisma` this release, unread and unwritten.
- Never run `prisma migrate dev` / `migrate reset` against the `.env` database (a shared Neon instance). Hand-write the migration SQL; `pnpm db:generate` needs no DB.
- Admin: reuse `@admin/components/ui`; no raw colours; tests mock the network with MSW, never `lib/api.ts`.
- `Docs/test-inventory.txt` is a dated snapshot — do not edit it.
- All commands below run from the package directory named in the step (`apps/backend`, `packages/shared`, `apps/admin`) unless stated.

---

### Task 1: Schema, migration, Prisma client

**Files:**
- Modify: `apps/backend/prisma/schema.prisma:911-917` (Booking PIN fields) and `:1520-1521` (EmailVerification comment)
- Create: `apps/backend/prisma/migrations/20260921120000_store_booking_start_pin_in_clear/migration.sql`

**Interfaces:**
- Produces: `Booking.startPin: string | null` on the generated Prisma client (`start_pin` column). `Booking.startPinHash` still exists on the client but is dead.

- [ ] **Step 1: Replace the Booking PIN field block**

In `apps/backend/prisma/schema.prisma`, replace lines 911–917:

```prisma
  /// Parent-generated hand-off PIN gating nanny check-in. The parent reveals a
  /// 4-digit code within the check-in window; the nanny must enter it to start.
  /// Stored hashed (sha-256) and cleared on successful check-in. See booking.service.
  startPinHash             String?              @map("start_pin_hash")
  startPinGeneratedAt      DateTime?            @map("start_pin_generated_at")
  startPinExpiresAt        DateTime?            @map("start_pin_expires_at")
  startPinAttempts         Int                  @default(0) @map("start_pin_attempts")
```

with:

```prisma
  /// Parent-generated hand-off PIN gating nanny check-in. The parent reveals a
  /// 4-digit code within the check-in window; the nanny must enter it to start.
  /// Stored in the clear: it is four digits, lives 15 minutes, is single-use and
  /// attempt-capped, and the admin console reads it back to support a hand-off
  /// over the phone — an unsalted hash of it protected nothing (10k guesses).
  /// Cleared on successful check-in. See booking.service.
  startPin                 String?              @map("start_pin")
  /// Unread and unwritten since `startPin` replaced it (store_booking_start_pin_in_clear).
  /// Kept one release so a task still running the old client can select it;
  /// drop it in the next migration.
  startPinHash             String?              @map("start_pin_hash")
  startPinGeneratedAt      DateTime?            @map("start_pin_generated_at")
  startPinExpiresAt        DateTime?            @map("start_pin_expires_at")
  startPinAttempts         Int                  @default(0) @map("start_pin_attempts")
```

- [ ] **Step 2: Reword the EmailVerification comment that cites the hash as precedent**

In the same file, replace lines 1520–1521:

```prisma
/// Neither the code nor the token is stored in the clear — only their sha-256
/// hashes, the same treatment `Booking.startPinHash` gives the start PIN.
```

with:

```prisma
/// Neither the code nor the token is stored in the clear — only their sha-256
/// hashes. (Unlike the booking start PIN, which is stored in the clear: a
/// verification code travels by email and proves ownership of an address, so
/// a leaked table must not hand out working codes.)
```

- [ ] **Step 3: Write the migration**

Create `apps/backend/prisma/migrations/20260921120000_store_booking_start_pin_in_clear/migration.sql`:

```sql
-- First half of a two-release move: the start PIN is stored in the clear so the
-- admin console can read it back during a hand-off. "start_pin_hash" is no
-- longer read or written from this release on and is dropped in the next one.

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "start_pin" TEXT;
```

- [ ] **Step 4: Regenerate the client and typecheck**

Run (from `apps/backend`):

```bash
pnpm db:generate && pnpm typecheck
```

Expected: both succeed. Nothing reads `startPin` yet. If `tsc` floods with `Type 'string' is not assignable to type 'number'` in files you did not touch, the generate was degenerate — re-run `pnpm db:generate` and typecheck again.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/prisma/schema.prisma apps/backend/prisma/migrations/20260921120000_store_booking_start_pin_in_clear/migration.sql Docs/superpowers/specs/2026-09-21-admin-start-pin-design.md Docs/superpowers/plans/2026-09-21-admin-start-pin.md
git commit -m "feat(db): store the booking start PIN in the clear

First half of the two-release swap of start_pin_hash for start_pin, so the
admin console can read the code back. Design + plan in Docs/superpowers.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Backend writes and checks the plaintext PIN

**Files:**
- Modify: `apps/backend/src/lib/pin.ts`
- Modify: `apps/backend/src/services/booking.service.ts:52`, `:1863-1917` (generateStartPin), `:1958-1991` (checkInBooking)
- Test: `apps/backend/src/__tests__/pin.test.ts`
- Test: `apps/backend/src/__tests__/booking-shift.test.ts`
- Modify (fixture rename only): `apps/backend/src/__tests__/booking-address.test.ts:172`, `booking-create-window.test.ts:138`, `booking-mother-id-gate.test.ts:163`, `booking-create-children.test.ts:160`, `booking-end-by-mother.test.ts:107`

**Interfaces:**
- Consumes: `Booking.startPin` from Task 1.
- Produces: `generateStartPin` persists `startPin` (plaintext) and `checkInBooking` compares/clears it. `hashPin` no longer exists. `GenerateStartPinResponse` (`{ pin, expiresAt }`) is unchanged.

- [ ] **Step 1: Drop the hash test**

Replace the whole of `apps/backend/src/__tests__/pin.test.ts` with:

```ts
import { randomStartPin } from '@backend/lib/pin';

describe('pin util', () => {
  it('randomStartPin always returns 4 digits, including leading zeros', () => {
    for (let i = 0; i < 200; i++) {
      expect(randomStartPin()).toMatch(/^\d{4}$/);
    }
  });
});
```

- [ ] **Step 2: Point the shift tests at the plaintext column**

In `apps/backend/src/__tests__/booking-shift.test.ts`:

Remove line 5:

```ts
import { hashPin } from '@backend/lib/pin';
```

In `makeBooking` (lines 92–143), rename the override type and fixture field:

```ts
function makeBooking(overrides: Partial<{
  status: string;
  startTime: Date;
  endTime: Date;
  startPin: string | null;
  startPinExpiresAt: Date | null;
  startPinAttempts: number;
  adjustments: ReturnType<typeof pendingAdjustment>[];
}> = {}) {
```

and

```ts
    startPin: overrides.startPin === undefined ? DEFAULT_PIN : overrides.startPin,
```

in place of the `startPinHash:` two-liner.

Rewrite the first `generateStartPin` test (lines 156–169):

```ts
    it('returns a 4-digit PIN and persists it in the clear (attempts reset)', async () => {
      const booking = makeBooking({ startPin: null, startPinExpiresAt: null });
      mockPrisma.booking.findUnique.mockResolvedValue(booking);
      mockPrisma.booking.update.mockResolvedValue(booking);

      const result = await generateStartPin({ uid: 'firebase-mother' } as never, 4);

      expect(result.pin).toMatch(/^\d{4}$/);
      expect(typeof result.expiresAt).toBe('string');
      const data = mockPrisma.booking.update.mock.calls[0][0].data;
      expect(data.startPin).toBe(result.pin);
      expect(data.startPinAttempts).toBe(0);
    });
```

Replace every remaining `startPinHash: null` in this file (the balance-due generate test at ~line 220 and the "has not started" check-in test at ~line 265) with `startPin: null`.

In the first `checkInBooking` test (~line 249), replace:

```ts
      expect(data.startPinHash).toBeNull();
```

with:

```ts
      expect(data.startPin).toBeNull();
```

- [ ] **Step 3: Run the two files and watch them fail**

Run (from `apps/backend`):

```bash
pnpm exec jest --selectProjects unit src/__tests__/pin.test.ts src/__tests__/booking-shift.test.ts
```

Expected: `booking-shift.test.ts` fails — the generate test on `expect(data.startPin).toBe(result.pin)` (received `undefined`), and every check-in test that expects success fails with `The parent has not started this booking yet` because the service still reads `startPinHash`, which the fixture no longer sets. `pin.test.ts` passes.

- [ ] **Step 4: Remove `hashPin`**

Replace the whole of `apps/backend/src/lib/pin.ts` with:

```ts
import crypto from 'node:crypto';

/**
 * Generate a random 4-digit start PIN as a zero-padded string, e.g. "0042".
 * Uses a CSPRNG (node:crypto), never Math.random.
 */
export function randomStartPin(): string {
  return String(crypto.randomInt(0, 10000)).padStart(4, '0');
}
```

- [ ] **Step 5: Switch the service to the plaintext column**

In `apps/backend/src/services/booking.service.ts`:

Line 52 becomes:

```ts
import { randomStartPin } from '@backend/lib/pin';
```

Replace the `generateStartPin` doc comment (lines 1863–1868) with:

```ts
/**
 * Parent generates the 4-digit start PIN — the hand-off gate for check-in. Only
 * the mother who owns the booking may call this, and only inside the check-in
 * window. The PIN is stored in the clear (the admin console reads it back to
 * support a hand-off) and is single-use, attempt-capped and short-lived.
 * Calling again regenerates and resets attempts.
 */
```

In the `prisma.booking.update` inside `generateStartPin` (line 1909), replace:

```ts
      startPinHash: hashPin(pin),
```

with:

```ts
      startPin: pin,
```

In `checkInBooking`, replace lines 1960 and 1969:

```ts
  if (!booking.startPinHash || !booking.startPinExpiresAt) {
```

→

```ts
  if (!booking.startPin || !booking.startPinExpiresAt) {
```

and

```ts
  if (hashPin(pin) !== booking.startPinHash) {
```

→

```ts
  if (pin !== booking.startPin) {
```

and in the clearing update (line 1988):

```ts
      startPinHash: null,
```

→

```ts
      startPin: null,
```

- [ ] **Step 6: Rename the dead fixture key in the other unit tests**

In each of these files, change the one line `startPinHash: null,` to `startPin: null,`:

- `apps/backend/src/__tests__/booking-address.test.ts:172`
- `apps/backend/src/__tests__/booking-create-window.test.ts:138`
- `apps/backend/src/__tests__/booking-mother-id-gate.test.ts:163`
- `apps/backend/src/__tests__/booking-create-children.test.ts:160`
- `apps/backend/src/__tests__/booking-end-by-mother.test.ts:107`

- [ ] **Step 7: Run the backend unit suite and typecheck**

Run (from `apps/backend`):

```bash
pnpm test:unit && pnpm typecheck
```

Expected: all unit tests pass (the two PIN files included); `tsc` clean. A grep for `startPinHash` across `apps/backend/src` must return nothing:

```bash
grep -rn "startPinHash\|hashPin" apps/backend/src
```

Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/lib/pin.ts apps/backend/src/services/booking.service.ts apps/backend/src/__tests__
git commit -m "feat(backend): write and check the start PIN in the clear

generateStartPin persists the PIN itself and checkInBooking compares it
directly; hashPin is gone. Behaviour (window, TTL, attempt cap, reset on
regenerate, cleared on check-in) is unchanged.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Admin detail DTO exposes the live PIN

**Files:**
- Modify: `packages/shared/src/admin.ts:376-387` (AdminBookingDetailSchema)
- Modify: `apps/backend/src/services/admin-booking.service.ts:95-169` (toDetailDto)
- Test: `apps/backend/src/__tests__/admin-booking.service.test.ts`

**Interfaces:**
- Consumes: `Booking.startPin`, `Booking.startPinExpiresAt` from the Prisma row.
- Produces: `AdminBookingDetail.startPin: string | null` and `AdminBookingDetail.startPinExpiresAt: string | null` (ISO) — both non-null only while the PIN is live.

- [ ] **Step 1: Add the three DTO tests**

In `apps/backend/src/__tests__/admin-booking.service.test.ts`, add to `makeRow` (after `nannyCheckedOutAt: null,` at line 94) the two fields a real row always carries:

```ts
    startPin: null,
    startPinExpiresAt: null,
```

Then append inside `describe('getAdminBooking (detail)', …)` (before its closing `});` at line 375):

```ts
  it('exposes the start PIN and its expiry while the PIN is live', async () => {
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeRow({ startPin: '0042', startPinExpiresAt: expiresAt }),
    );

    const dto = await getAdminBooking(4);

    expect(dto.startPin).toBe('0042');
    expect(dto.startPinExpiresAt).toBe(expiresAt.toISOString());
  });

  it('hides an expired start PIN', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeRow({ startPin: '0042', startPinExpiresAt: new Date(Date.now() - 60_000) }),
    );

    const dto = await getAdminBooking(4);

    expect(dto.startPin).toBeNull();
    expect(dto.startPinExpiresAt).toBeNull();
  });

  it('returns null PIN fields when the parent has not started', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(makeRow());

    const dto = await getAdminBooking(4);

    expect(dto.startPin).toBeNull();
    expect(dto.startPinExpiresAt).toBeNull();
  });
```

- [ ] **Step 2: Run the file and watch the new tests fail**

Run (from `apps/backend`):

```bash
pnpm exec jest --selectProjects unit src/__tests__/admin-booking.service.test.ts
```

Expected: the first new test fails with `expect(received).toBe("0042")` / received `undefined`; the other two fail with `toBeNull` receiving `undefined`.

- [ ] **Step 3: Extend the shared schema**

In `packages/shared/src/admin.ts`, inside `AdminBookingDetailSchema`, after `nannyCheckedOutAt: z.string().nullable(),` (line 383) add:

```ts
  /**
   * The parent's hand-off PIN, so support can read it to a nanny over the
   * phone. Both fields are null unless the PIN is live right now — not yet
   * generated, expired and already used all look the same to the console.
   */
  startPin: z.string().nullable(),
  startPinExpiresAt: z.string().nullable(),
```

- [ ] **Step 4: Populate it in the DTO**

In `apps/backend/src/services/admin-booking.service.ts`, replace the opening of `toDetailDto` (lines 95–96):

```ts
function toDetailDto(row: AdminBookingDetailRow): AdminBookingDetail {
  const payment = row.payments[0] ?? null;
```

with:

```ts
function toDetailDto(row: AdminBookingDetailRow): AdminBookingDetail {
  const payment = row.payments[0] ?? null;
  // Decided here, not in the browser: the admin's clock must not be what says
  // whether the code the parent is reading out is still good.
  const startPinLive =
    row.startPin != null &&
    row.startPinExpiresAt != null &&
    row.startPinExpiresAt.getTime() > Date.now();
```

and after `nannyCheckedOutAt: row.nannyCheckedOutAt?.toISOString() ?? null,` (line 163) add:

```ts
    startPin: startPinLive ? row.startPin : null,
    startPinExpiresAt: startPinLive ? row.startPinExpiresAt.toISOString() : null,
```

If `tsc` complains that `row.startPinExpiresAt` is possibly null inside the ternary (narrowing does not flow through the `startPinLive` boolean), write the two lines as:

```ts
    startPin: startPinLive ? row.startPin : null,
    startPinExpiresAt:
      startPinLive && row.startPinExpiresAt ? row.startPinExpiresAt.toISOString() : null,
```

- [ ] **Step 5: Run tests and typecheck both packages**

Run (from `packages/shared`):

```bash
pnpm typecheck && pnpm test:unit
```

Run (from `apps/backend`):

```bash
pnpm test:unit && pnpm typecheck
```

Expected: all pass, `tsc` clean in both.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/admin.ts apps/backend/src/services/admin-booking.service.ts apps/backend/src/__tests__/admin-booking.service.test.ts
git commit -m "feat(admin-api): expose the live start PIN on the booking detail

startPin / startPinExpiresAt on AdminBookingDetail, non-null only while the
PIN is current — the server decides, not the admin's clock.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Admin page shows the row

**Files:**
- Modify: `apps/admin/src/pages/booking-detail-page.tsx:124-145` (schedule items)
- Create: `apps/admin/src/pages/__tests__/booking-detail-page.test.tsx`

**Interfaces:**
- Consumes: `AdminBookingDetail.startPin`, `AdminBookingDetail.startPinExpiresAt` from Task 3; `formatDateTime` from `@admin/lib/format`.

- [ ] **Step 1: Write the page test**

Create `apps/admin/src/pages/__tests__/booking-detail-page.test.tsx`:

```tsx
/**
 * The Schedule card carries the parent's live start PIN so support can read it
 * to a nanny on the phone. The API already decides "live" — this pins that the
 * page shows the code and its expiry when given one, and a dash when not.
 */
import type { AdminBookingDetail, AdminUser } from '@nanny-app/shared';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { PermissionsProvider } from '@admin/lib/permissions';
import { BookingDetailPage } from '@admin/pages/booking-detail-page';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

function ok<T>(data: T) {
  return HttpResponse.json({ data, error: null });
}

const ADMIN: AdminUser = {
  id: 1,
  name: 'Ops Admin',
  email: 'ops@example.com',
  role: 'ADMIN',
  permissions: {},
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const BOOKING: AdminBookingDetail = {
  id: 4,
  status: 'CONFIRMED',
  nannyDecision: 'ACCEPTED',
  type: 'STANDARD',
  date: '2026-09-21',
  startTime: '2026-09-21T14:00:00+03:00',
  endTime: '2026-09-21T17:00:00+03:00',
  durationHours: 3,
  totalAmount: 318,
  discountAmount: 0,
  promoCode: null,
  paymentStatus: 'CAPTURED',
  mother: { id: 10, name: 'Jane Mom', email: 'jane@example.com', phone: '+201000000000' },
  nanny: { id: 19, name: 'Elena Nanny', email: 'elena@example.com', phone: '+201111111111' },
  createdAt: '2026-09-12T00:00:00.000Z',
  baseRate: 100,
  effectiveHourlyRate: 100,
  skillAddOns: [],
  children: [{ name: 'Lina', ageYears: 3 }],
  childrenCount: 1,
  extraChildren: 0,
  extraChildFeePerHour: 0,
  address: null,
  subtotal: 300,
  durationMultiplier: 1,
  serviceFeePercent: 0,
  serviceFeeAmount: 0,
  nannyAmount: 254,
  platformAmount: 64,
  rewardCreditHours: 0,
  packageHoursApplied: 0,
  payment: null,
  specialInstructions: null,
  cancellationReason: null,
  cancelledAt: null,
  adminApprovedAt: null,
  nannyDecidedAt: null,
  nannyCheckedInAt: null,
  nannyCheckedOutAt: null,
  updatedAt: '2026-09-12T00:00:00.000Z',
  pointsRedeemed: null,
  startPin: null,
  startPinExpiresAt: null,
};

function backend(booking: AdminBookingDetail) {
  server.use(
    http.get('/api/admin/me', () => ok(ADMIN)),
    http.get('/api/admin/bookings/4', () => ok(booking)),
  );
}

function renderPage() {
  return renderWithProviders(
    <ToastProvider>
      <PermissionsProvider>
        <MemoryRouter initialEntries={['/bookings/4']}>
          <Routes>
            <Route path="/bookings/:id" element={<BookingDetailPage />} />
          </Routes>
        </MemoryRouter>
      </PermissionsProvider>
    </ToastProvider>,
  );
}

/** Text of the value cell under the description-list label `label`. */
function rowValue(label: string): string {
  const item = screen.getByText(label).closest('.desc-item');
  if (!item) throw new Error(`No description row labelled "${label}"`);
  return item.querySelector('.desc-value')?.textContent ?? '';
}

describe('BookingDetailPage', () => {
  it('shows the live start PIN with its expiry', async () => {
    backend({
      ...BOOKING,
      startPin: '0042',
      startPinExpiresAt: '2026-09-21T11:12:00.000Z',
    });
    renderPage();

    await screen.findByText('Start PIN');

    const value = rowValue('Start PIN');
    expect(value).toContain('0042');
    // 11:12 UTC is 14:12 in the platform timezone (Africa/Cairo, +03:00 in September).
    expect(value).toContain('14:12');
  });

  it('shows a dash when no PIN is live', async () => {
    backend(BOOKING);
    renderPage();

    await screen.findByText('Start PIN');

    expect(rowValue('Start PIN')).toBe('—');
  });
});
```

If `nannyDecision: 'ACCEPTED'` fails the type check, open `packages/shared/src/booking.ts`, find `NannyBookingDecisionSchema`, and use one of its listed values.

- [ ] **Step 2: Run it and watch it fail**

Run (from `apps/admin`):

```bash
pnpm exec vitest run src/pages/__tests__/booking-detail-page.test.tsx
```

Expected: both tests fail at `findByText('Start PIN')` — the label does not exist yet.

- [ ] **Step 3: Add the row**

In `apps/admin/src/pages/booking-detail-page.tsx`, inside the `schedule` array, insert before the `{ label: 'Checked in', … }` item (line 142):

```tsx
    {
      // Only present while the PIN the parent is reading out is still good;
      // the API nulls it otherwise, so a dash covers "not started", "expired"
      // and "already used" alike.
      label: 'Start PIN',
      value: booking.startPin ? (
        <>
          <code>{booking.startPin}</code>
          {booking.startPinExpiresAt ? ` · expires ${formatDateTime(booking.startPinExpiresAt)}` : ''}
        </>
      ) : (
        DASH
      ),
    },
```

- [ ] **Step 4: Run the test, the admin suite and typecheck**

Run (from `apps/admin`):

```bash
pnpm exec vitest run src/pages/__tests__/booking-detail-page.test.tsx && pnpm test:unit && pnpm typecheck
```

Expected: the two new tests pass, the rest of the suite still passes, `tsc` clean for both `tsconfig.app.json` and `tsconfig.e2e.json`.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/pages/booking-detail-page.tsx apps/admin/src/pages/__tests__/booking-detail-page.test.tsx
git commit -m "feat(admin): show the parent's live start PIN on the booking detail

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: End-to-end proof against a real database (if the test stack is available)

**Files:** none changed.

The unit tiers mock Prisma, so nothing above has yet executed the new column or the migration SQL. The integration journey `apps/backend/src/__integration__/journeys/a01-booking-lifecycle.test.ts` runs the real generate → check-in path on PostGIS after `prisma migrate deploy`.

- [ ] **Step 1: Bring the stack up** (from the repo root)

```bash
pnpm test:env
```

Expected: PostGIS on 55432, Mailpit, the Auth emulator on 9099 and the Paymob fake come up. Docker Desktop lives on D: and starts cold — allow a minute. If Docker is unavailable, stop here and say so in the hand-off: the change is still verified by the unit tiers and typechecks, but the migration SQL has not been executed.

- [ ] **Step 2: Run the lifecycle journey** (from `apps/backend`)

```bash
pnpm exec jest --selectProjects integration --maxWorkers=1 src/__integration__/journeys/a01-booking-lifecycle.test.ts
```

Expected: `globalSetup` applies `20260921120000_store_booking_start_pin_in_clear`, then the journey passes — it mints a PIN as the mother and checks in as the nanny with it, which now reads `start_pin`.

- [ ] **Step 3: Nothing to commit.** Report the result.
