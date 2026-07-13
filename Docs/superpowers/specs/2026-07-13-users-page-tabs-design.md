# Users page with Mommies + Nannies tabs

**Date:** 2026-07-13
**Status:** Approved

## Goal

Rename the admin **Nannies** page to **Users** and split it into two tabs: **Mommies**
(mothers directory) and **Nannies** (the existing new-nanny review/KYC queue, unchanged).

## Decisions

- **Mommies tab:** read-only list. Needs a new backend endpoint (no mother-listing API exists today).
- **Nannies tab:** the current review queue, moved verbatim under a tab. No behavior change.
- **Nav & route:** sidebar item + page title become "Users", route becomes `/users`; old `/nannies` redirects to `/users`.

## Backend

1. `packages/shared/src/admin.ts` — `AdminMotherSchema` / `AdminMother`:
   `id, name, email, phone, location, avatarUrl, isEmailVerified, isPhoneVerified, isActive, bookingCount, createdAt`.
2. `apps/backend/src/services/admin-user.service.ts` — `listAdminMothers()`:
   `prisma.user.findMany({ where: { role: 'MOTHER', deletedAt: null }, include: { _count: { select: { bookingsAsMother: true } } }, orderBy: { createdAt: 'desc' } })` → DTO.
   Location comes from `user.address` (single source of truth, mirrors the nanny service).
3. `apps/backend/src/routes/admin.routes.ts` — `GET /admin/mothers` → `listAdminMothers()`.
4. Unit test in `apps/backend/src/__tests__/` mirroring the admin-nanny test.

## Frontend

5. `lib/api.ts` — `fetchMothers(): Promise<AdminMother[]>` (GET `/admin/mothers`).
6. `pages/users-page.tsx` — `PageHeader title="Users"` + a `.subtabs` strip (Mommies | Nannies),
   reusing the existing tab pattern from `pricing-fees-page.tsx`.
   - Nannies tab → `features/nannies/nanny-review-tab.tsx` (current review-queue UI, moved verbatim).
   - Mommies tab → `features/users/mothers-tab.tsx`: `useQuery(fetchMothers)` →
     `TableSkeleton` / `ErrorState` / `Table`. Columns: Mother (avatar+name), Phone (+verified),
     Email, Location, Bookings, Registered. No action menu.
7. `App.tsx` — `path="users"` → `UsersPage`; `path="nannies"` → `<Navigate to="/users" replace />`.
8. `components/admin-layout.tsx` — nav item `{ to: '/users', label: 'Users', icon: Users }`.
9. Delete `pages/nannies-page.tsx` (content relocated to the review-tab component).

## Out of scope

No deactivate/reactivate action, no booking-history expansion, no change to the nanny review queue.
