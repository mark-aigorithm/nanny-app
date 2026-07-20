# Design: Sequential integer primary keys (numbers over the wire)

**Date:** 2026-07-17
**Status:** Approved design → ready for implementation plan
**Author:** Claude (brainstormed with Mark)

---

## 1. Goal

Replace every entity's `cuid` string primary key with a **sequential integer**
(`Int @id @default(autoincrement())`) across the whole stack — database, API, and
clients. IDs appear as JSON **numbers** (`{ "id": 1042 }`), not strings.

This is the "int PKs everywhere" choice, explicitly preferred over a hybrid
opaque-PK + reference-number pattern.

## 2. Locked decisions

| Decision | Choice |
|---|---|
| PK type | `Int @id @default(autoincrement())` on every model |
| Wire format | **Numbers** — API returns/accepts `id` as a JSON number |
| Data preservation | **Not required** — data is disposable; DB is reset |
| Migration history | **Squash to a fresh baseline** (delete existing migrations, generate one clean `init` migration). Overrides the repo's "never delete applied migrations" convention, acceptable pre-launch. |
| Reseed | Required — adapt the seed scripts so test data is re-inserted after reset |
| Security trade-off | Accepted — enumerable IDs, mitigated by server-side ownership checks |

## 3. Non-goals

- No data-preserving remap (add-column / backfill / swap). Out of scope by decision.
- No zero-downtime online migration.
- No change to natural/business string columns (see §4).
- No new authorization work beyond confirming existing ownership checks hold. Any
  gaps found are noted, not fixed here.

## 4. The ID model

**Changes to `Int`:**
- Every surrogate `id` primary key.
- Every foreign-key column currently holding a cuid:
  `userId`, `motherId`, `nannyProfileId`, `bookingId`, `promoCodeId`, `skillId`,
  `walletId`, `adminId`, `postId`, `commentId`, `parentCommentId`,
  `conversationId`, `communityPostId`, `initiatorId`, `senderId`, `authorId`,
  `cancelledById`, `adminApprovedById`, `adminActionById`,
  `replacementForBookingId`, `nannyUserId`, and the reward FKs.
- `notifications.referenceId`: soft **polymorphic** reference (a booking *or*
  conversation id, no FK constraint) → `Int?`. Its companion
  `referenceType` enum is unchanged.

**Stays `String` (NOT primary keys — natural/business values):**
`firebaseUid`, `email`, `phone`, `AppSettings.key`, `Skill.name`,
`PromoCode.code`, `DeviceToken.token`, all `paymob*Id`, all `*Url`,
`startPinHash`, `termsAcceptedVersion`, enum-backed columns, JSON columns.

## 5. Database & migration strategy

1. Rewrite `apps/backend/prisma/schema.prisma`: `id` and FK columns → `Int` /
   `Int?`; drop `@default(cuid())`, add `@default(autoincrement())` on ids.
2. Delete the contents of `apps/backend/prisma/migrations/` and generate a single
   fresh baseline (`prisma migrate dev --name init_sequential_int_ids`) from the
   new schema.
3. Any environment that already has the old schema (local, staging) is reset with
   `prisma migrate reset` (drops data, applies the baseline) then reseeded.
4. New IDs come out naturally sequential from 1 per table.

**Consequence:** staging (`develop` branch → RDS dev) must be reset. Accepted.

## 6. Shared Zod schemas (`packages/shared`)

The inferred types are the single source of truth, so **TypeScript is the
worklist** — every downstream mismatch in backend and mobile surfaces as a
compile error.

- Entity/response schemas: every `id` / `*Id` field `z.string()` → `z.number().int()`
  (nullable FKs → `z.number().int().nullable()`).
- Path-param schemas: `z.coerce.number().int().positive()` — Express params arrive
  as strings, so coerce + validate; a non-numeric `/bookings/abc` yields a clean 400.
- `notifications.referenceId` over the wire → `z.number().int().nullable()`.
- Leave genuinely-string fields (`code`, `token`, `firebaseUid`, timestamps as
  ISO strings, etc.) untouched.

## 7. Backend (`apps/backend`)

- Service signatures `id: string` → `id: number`; Prisma `where: { id }` now
  expects a number (TS enforces).
- Replace `routeParam()` (returns string) with a coercing `routeIdParam()` that
  parses `req.params.*` to an int and throws `AppError(..., 400)` on `NaN`; update
  the direct `req.params.id` sites in routes that don't use the helper.
- **Paymob** (`paymob.service.ts`): `buildPaymobMerchantOrderId(paymentId: number,
  attempt)` stringifies the int → `merchant_order_id` / `special_reference` become
  `"1042"` / `"1042-r2"`; `extras.payment_id` becomes a number. No Paymob-side
  breakage (these fields are free-form strings/values on their side).
- **Firestore / Redis**: any doc id or cache key derived from an entity id gets an
  explicit `String(id)` at the boundary (both key spaces are strings).
- Update jest fixtures: cuid string ids (`'clx...'`, `'seed-...'`) → integers.

## 8. Mobile (`apps/mobile`)

Driven entirely by the shared-type change:
- API-client response/request types now carry numeric ids.
- React Navigation route params typed `id: number`.
- `keyExtractor` / React list `key` usages wrap with `String(id)`.
- Any local caches / maps keyed by id switch key type or stringify consistently.

`tsc` enumerates every site; there is no mobile jest harness to update.

## 9. Seed scripts (reseed deliverable)

`seed-demo.ts` and `seed-community.ts` currently:
- set **explicit string ids** (`id: \`${PREFIX}user-sarah\``), impossible under
  autoincrement, and
- do idempotent cleanup via `id: { startsWith: PREFIX }`.

Rewrite them so that:
- No explicit `id` is set — autoincrement assigns it; capture returned ids in
  variables (or use nested `connect`/`create`) to wire relations.
- Idempotent cleanup keys off columns that remain strings — `firebaseUid:
  { startsWith: PREFIX }` for users, and relation-based / FK-based deletes for
  dependent rows (bookings, posts, etc.) instead of the old id-prefix match.
- `seed.ts` (app settings, keyed by string `key`) is unaffected.

**Runtime note:** `seed-demo.ts` provisions real Firebase Auth accounts, so it
needs Firebase credentials + a reachable DB — it runs against staging, not the
credential-less local box. This satisfies the "insert test data again" ask.

## 10. Testing & verification

Per repo local constraints (no Docker/DB, ESLint broken repo-wide, no mobile jest
harness), verification is:
- `prisma format` + `prisma validate` (no DB needed) on the new schema.
- Full `tsc` typecheck across `packages/shared`, `apps/backend`, `apps/mobile`
  — the primary guardrail; a green typecheck means every id site was updated.
- Backend jest suite (Prisma mocked) with fixtures updated to integer ids.

**Explicitly cannot be run locally:** the migration itself and the seed scripts
(need a DB / Firebase). Those execute on the next staging reset / deploy. This
limitation is stated up front, not hidden.

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| **Enumeration / IDOR** — sequential ids are guessable | Accepted trade-off. Confirm every resource fetch enforces ownership server-side; note (don't fix) any gap. |
| **Resource-count leakage** (max id ≈ row count) | Accepted. |
| **JS number precision** | Autoincrement ints stay far below `Number.MAX_SAFE_INTEGER` (2^53) for the foreseeable life of the app. No BigInt needed. |
| **Staging reset wipes shared dev data** | Accepted; reseed restores test data. Communicate before running. |
| **Missed id site** | Green `tsc` across all three packages is the completeness check; numbers-over-the-wire makes mismatches compile errors, not silent runtime coercions. |
| **External refs to old ids** (Paymob orders, Firestore docs from before reset) | Reset invalidates them, but disposable data means no live external references matter. |

## 12. Rollout order (for the plan)

1. `schema.prisma` → int PKs/FKs.
2. Squash migrations → fresh baseline.
3. `packages/shared` Zod id fields → numbers.
4. `apps/backend` services, route-param helper, Paymob, Firestore/Redis boundaries, fixtures.
5. `apps/mobile` id types (typecheck-driven).
6. Seed scripts rewritten for autoincrement.
7. Verify: `prisma validate` + `tsc` (all packages) + backend jest.
8. Deploy path: staging `prisma migrate reset` + reseed.

## 13. Open questions

None blocking. Detailed file-by-file enumeration happens in the implementation plan.
