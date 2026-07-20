# Referral Rewards — Design

**Date:** 2026-07-20
**Status:** Approved, ready for implementation planning

## Summary

Parents can invite friends to NannyNow with a personal referral code. When an invited
parent signs up with that code they immediately receive a welcome grant of Care Points.
When that same parent completes their first booking, the referrer receives a larger
grant. Both payout amounts are configurable by admins.

This feature is additive to the existing Care Points system (`RewardWallet`,
`RewardLedgerEntry`, `RewardConfig`) and reuses its ledger, notification and admin
config machinery rather than introducing a parallel currency.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Attribution | Referral code entered at signup | The mobile app has no deep-link infrastructure (`expo-linking` is installed but unused, no `associatedDomains` / `intentFilters`). Code entry ships without that scope. |
| Reward split | Two-sided, admin-configurable | Defaults: referrer 200 pts (2 free care hours), referee 100 pts (1 free hour). Two-sided rewards give the invitee a reason to actually enter the code. |
| Payout trigger | Referee's first booking reaching `COMPLETED` | Fires from the same hook that already awards Care Points. A real nanny had to check in and out, so it resists farming. |
| Who can refer | Parents (`MOTHER`) only in v1 | Care Points are only spendable at booking checkout, so a nanny's wallet would have no outlet. The schema stays role-agnostic so nannies can be enabled later. |
| Brand voice | "NannyNow" | User-facing brand. All new copy uses it. |

## Data model

### `RewardConfig` — three new fields

The singleton rate table gains referral settings so admins edit Care Points earning,
redemption and referral payouts in one place.

```prisma
referralEnabled  Boolean @default(true)
referrerPoints   Int     @default(200)
refereePoints    Int     @default(100)
```

`DEFAULT_CONFIG` in `reward.service.ts` is extended to match, for the no-config-row case.

### `RewardEntryType` — one new value

```prisma
REFERRAL
```

A single enum value covers both sides of the payout; the existing `reason` string
distinguishes them (`"Referral bonus — Sarah joined"` vs `"Welcome bonus from Sarah"`).
This keeps the enum, the shared Zod schema and the mobile `entryVisual()` switch small.

### `User` — one new field

```prisma
referralCode String? @unique
```

Generated lazily on first request rather than at signup, so existing users need no
backfill migration. Format: sanitized uppercase first name (A–Z, max 6 chars, falling
back to `FRIEND` if the name yields nothing) + `-` + 4 random base32 characters, e.g.
`SARAH-4K2P`. Generation retries up to 5 times on unique-constraint collision.

Deliberately **not** added: `User.referredById`. The `Referral` row is the single source
of truth. A plain FK cannot express pending-vs-converted state, and duplicating the
relationship invites drift.

### `Referral` — new model

Modeled on the existing `PromoCodeRedemption`.

```prisma
enum ReferralStatus {
  PENDING
  CONVERTED

  @@map("referral_status")
}

model Referral {
  id                  Int            @id @default(autoincrement())
  referrerId          Int            @map("referrer_id")
  refereeId           Int            @unique @map("referee_id")
  code                String
  status              ReferralStatus @default(PENDING)
  qualifyingBookingId Int?           @map("qualifying_booking_id")
  referrerPoints      Int            @default(0) @map("referrer_points")
  refereePoints       Int            @default(0) @map("referee_points")
  convertedAt         DateTime?      @map("converted_at")
  createdAt           DateTime       @default(now()) @map("created_at")
  updatedAt           DateTime       @updatedAt @map("updated_at")
  deletedAt           DateTime?      @map("deleted_at")

  referrer User @relation("ReferralsMade", fields: [referrerId], references: [id])
  referee  User @relation("ReferralReceived", fields: [refereeId], references: [id])

  @@index([referrerId, createdAt])
  @@map("referrals")
}
```

`refereeId @unique` makes "a user can only ever be referred once" a database guarantee
rather than application logic — it is the core integrity constraint of the feature.

`referrerPoints` / `refereePoints` are snapshots written at payout time, so changing the
admin config later never rewrites history.

## Backend

### `apps/backend/src/services/referral.service.ts` (new)

Follows `reward.service.ts` conventions: services are the only Prisma consumers, and
functions taking a `Db = Prisma.TransactionClient | typeof prisma` parameter so they
compose into outer transactions.

| Function | Role |
|---|---|
| `getOrCreateReferralCode(userId, db?)` | Lazy code generation with collision retry |
| `applyReferralCode({ refereeUserId, code })` | Validate + create `PENDING` row + credit referee |
| `convertReferralForBooking({ refereeUserId, bookingId })` | Mark `CONVERTED` + credit referrer |
| `getMyReferralSummary(uid)` | Code, share message, stats, referral list |
| `validateReferralCode(code, uid)` | Preview for the signup field |

**`applyReferralCode` rejects:**

- referrals disabled in config
- unknown / unmatched code
- self-referral (code belongs to the caller)
- caller is not a `MOTHER`
- caller already has a `Referral` row (also enforced by the unique constraint)
- caller already has a `COMPLETED` booking — the offer is for new users

On success it creates the row as `PENDING` and immediately credits the referee's welcome
points to their `RewardWallet` via a `REFERRAL` ledger entry, inside one transaction.

**`convertReferralForBooking`** loads the caller's `PENDING` referral and, in a single
transaction, sets `status = CONVERTED`, stamps `convertedAt` and `qualifyingBookingId`,
snapshots the configured point values, and credits the referrer. The status check happens
inside the transaction, making the call idempotent under concurrent checkouts.

### Hook points

Conversion is called from the two existing paths that reach `COMPLETED`, immediately
after the existing `awardPointsForBooking` call and wrapped in the same best-effort
`try/catch` so a referral failure can never block a checkout:

- `booking.service.ts` → `checkOutBooking` (nanny checkout, the normal path)
- `admin-booking.service.ts` → the admin status-override path

Log prefix follows the existing convention: `'[referrals] failed to convert referral on checkout'`.

### Routes — `apps/backend/src/routes/referral.routes.ts` (new)

All behind `requireAuth`.

| Route | Purpose |
|---|---|
| `GET /referrals/me` | Code, share message, stats, referral list |
| `POST /referrals/redeem` | Body `{ code }` — apply a referral code |
| `GET /referrals/validate?code=` | Live feedback for the signup field |

The referral code is submitted by the mobile app via `POST /referrals/redeem`
immediately after signup succeeds, rather than being threaded through the auth
registration payload. This keeps the auth flow untouched and makes the endpoint
independently testable. Server-side validation (no completed bookings yet) is what
actually enforces the "at signup" semantics, not client sequencing.

### Admin

`PUT /admin/rewards/config` and its Zod schema accept the three new fields. The existing
`apps/admin/src/features/rewards/rewards-config-panel.tsx` gains a "Referrals" section
with an enable toggle and the two point inputs.

## Shared schemas

New `packages/shared/src/referrals.ts`, exported from `index.ts`:

- `ReferralStatusSchema`
- `ReferralSchema`
- `ReferralSummarySchema` — `{ code, shareMessage, stats: { invited, joined, pointsEarned }, referrals: ReferralListItem[] }`
- `ReferralListItemSchema` — `{ id, firstName, status, points, createdAt }` (first name only; no email or full name leaks to the referrer)
- `RedeemReferralSchema` — `{ code }`, 1–32 chars, trimmed and uppercased
- `ValidateReferralCodeResponseSchema` — `{ valid, referrerFirstName?, refereePoints? }`

`RewardConfigSchema` and `UpdateRewardConfigSchema` in `packages/shared/src/rewards.ts`
gain the three referral fields, with bounds consistent with the existing ones
(`referrerPoints` / `refereePoints` 0–1,000,000).

## Mobile

### `ReferAFriendScreen` (new)

- Screen: `src/screens/parent/ReferAFriendScreen.tsx`
- Styles: `src/screens/parent/styles/refer-a-friend-screen.styles.ts`
- Route: `app/(parent)/refer-a-friend.tsx` (one-line re-export)
- Registered in `app/(parent)/_layout.tsx` as `<Tabs.Screen name="refer-a-friend" />`

Theme tokens only — no hardcoded hex, per project convention.

**Hero.** Gold-accented `IconCircle`, headline *"Give an hour, get two"*, and a subtitle
that reads its numbers from `/rewards/config` so admin changes flow straight into the
copy: *"Invite a friend to NannyNow. When they finish their first booking you get
{referrerPoints} Care Points, and they start with {refereePoints}."*

**Code card.** The code rendered large with wide letter-spacing, a tap-to-copy row
(`copy-outline` icon, haptic + confirmation on copy), and a primary `Button` labelled
"Share invite" that opens the native sheet via React Native's `Share.share()` with a
composed message containing the code.

**How it works.** Three numbered steps on a connecting vertical rail: share your code →
they book their first sitter → you both earn Care Points.

**Your invites.** A three-stat row (Invited / Joined / Points earned), then a list of
referral rows — initial-avatar circle, first name, status `Chip` (taupe "Pending" /
success-green "Earned +200"), and date. Illustrated empty state when there are none.

### Signup

The register screen gains an optional referral code field, collapsed behind a "Have a
referral code?" text button so it does not clutter the primary flow. On blur it calls
`GET /referrals/validate` and shows *"Nice — you'll start with 100 Care Points."* on
success. After registration succeeds the app calls `POST /referrals/redeem`; a failure
here is non-blocking and does not interrupt onboarding.

### Existing screens

- `src/mocks/profile.ts` — new `SETTINGS_ITEMS` entry `{ id: 'refer', label: 'Refer a friend', icon: 'people-outline' }`, plus a `case 'refer':` in `MotherProfileWalletScreen`'s `handleSettingsPress` passing the usual `returnTo` param.
- `RewardsScreen.tsx` — `entryVisual()` gains a `REFERRAL` case (people icon, sage) so referral bonuses render correctly in the activity ledger.
- `src/lib/notificationUtils.ts` — icon and colour for the new `referral_converted` push type.

### Hooks

New `src/hooks/useReferrals.ts` with query-key root `'referrals'`: `useReferralSummary()`,
`useRedeemReferralCode()`, `useValidateReferralCode()`. Mutations invalidate both
`['referrals']` and `['rewards']`, since a payout changes the wallet balance too.

### Dependency

`expo-clipboard` is added for tap-to-copy. It is the only new dependency; no deep-link
infrastructure is required.

## Notifications

`NotificationType` gains `REFERRAL_CONVERTED`, dispatched through the existing
`notifyPoints` wrapper in `reward.service.ts` (which already swallows errors so a
notification failure never blocks the surrounding action).

- Referrer, on conversion: *"{FirstName} booked their first sitter — you earned {n} Care Points!"*
- Referee, on signup: *"Welcome to NannyNow! {n} Care Points are waiting in your wallet."*

## Copy cleanup

The existing ledger label for `ADMIN_GRANT` reads "Gift from NannyApp". The user-facing
brand is NannyNow, so this string is corrected as part of this work — it sits directly
in the `entryVisual()` switch being edited for the `REFERRAL` case.

## Testing

New `apps/backend/src/__tests__/referral.service.test.ts`, following the structure of
`reward.service.test.ts`:

- code generation is unique and retries on collision
- self-referral is rejected
- a second redemption by the same referee is rejected
- redemption by a user with a completed booking is rejected
- redemption by a non-`MOTHER` user is rejected
- conversion credits the referrer exactly once under repeated calls (idempotency)
- conversion is a no-op when `referralEnabled` is false
- point values are snapshotted, so a later config change does not alter past referrals

Coverage threshold remains 80% as enforced in CI.

## Out of scope for v1

- Deep links and universal links (share message carries the code as text)
- Nannies as referrers
- Referral leaderboards, tiers, or streak bonuses
- Expiry on pending referrals
