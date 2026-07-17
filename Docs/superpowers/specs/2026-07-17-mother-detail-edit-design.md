# Mother Detail Page — Redesign + Inline Editing

**Date:** 2026-07-17
**Status:** Approved (design)
**Area:** `apps/admin` (React + Vite), `apps/backend` (Express), `packages/shared` (Zod)

## Problem

The admin "Mommy details" page ([mother-detail-page.tsx](../../../apps/admin/src/pages/mother-detail-page.tsx))
is a flat, read-only `DescriptionList`. Two asks:

1. Make it **modern and more user-friendly** (polished restyle).
2. Add an **edit** capability for the editable fields.
3. **Remove the User ID** row.

Mothers are currently read-only end-to-end (only `GET /admin/mothers` and
`GET /admin/mothers/:id` exist), so editing is a **new full-stack feature**.

## Scope

### Editable
- **Name** — stored as `firstName` + `lastName` on the `User` row.
- **Account status** — the app-level `isActive` flag (active / deactivated).
- **Address** — the `address` string only (see "Address decision" below).

### Not editable (left read-only)
- **Email** and **Phone** — both `@unique` and backed by Firebase Auth. These are
  phone-auth accounts (email is a synthetic `<phone>@phone.nannyapp.local`).
  Changing them means mutating the Firebase Auth identity — out of scope.
- **Verification flags** (`isEmailVerified` / `isPhoneVerified`) — out of scope.
- Derived/system fields: `bookingCount`, `createdAt`.

### Removed from view
- **User ID** row.

## Address decision

There is **no server-side geocoding**. The mobile registration map picker captures
`address` + `latitude` + `longitude` together, and a mother's lat/lng is the
**origin for booking broadcast** (finding nearby nannies) — see
[auth.service.ts:198](../../../apps/backend/src/services/auth.service.ts:198).

**Decision (approved):** the admin edits the **address text only**; `latitude` /
`longitude` are left untouched. The edit modal shows helper text:
> "Editing the address updates the label only; the map location used for matching isn't changed."

A true "relocate" (admin map picker that re-captures coordinates) is explicitly a
**future, separate piece** — not in this spec.

## Backend

### Shared schemas (`packages/shared/src/admin.ts`)
- **`AdminMotherDetailSchema = AdminMotherSchema.extend({ firstName: z.string(), lastName: z.string() })`**
  and `type AdminMotherDetail`. The detail endpoint returns first/last split so the
  edit form can bind them cleanly. The list DTO (`AdminMotherSchema`) is unchanged.
  Mirrors the existing `AdminNannyDetailSchema` precedent (admin.ts:365).
- **`UpdateAdminMotherSchema`**:
  ```ts
  z.object({
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName:  z.string().trim().max(100).optional(),   // '' allowed → stored as '-'
    address:   z.string().trim().max(500).nullable().optional(),
    isActive:  z.boolean().optional(),
  })
  ```
  and `type UpdateAdminMotherInput`. All fields optional (partial update / PATCH
  semantics). `lastName` may be empty; the service stores `'-'` when blank to match
  the existing placeholder convention (`toMotherDto` treats `'-'` as "no last name").

### Service (`apps/backend/src/services/admin-user.service.ts`)
- Extend `motherSelect` / add a detail select including `firstName`, `lastName` and
  a `toMotherDetailDto` (or extend `toMotherDto`) so the detail endpoint returns
  `AdminMotherDetail`.
- Change `getAdminMother` to return `AdminMotherDetail`.
- Add **`updateAdminMother(id, input): Promise<AdminMotherDetail>`**:
  - Guard the row exists with `where: { id, role: 'MOTHER', deletedAt: null }`;
    `throw errors.notFound('Mother not found')` otherwise.
  - `prisma.user.update` applying only provided fields (spread-guard pattern already
    used in `auth.service.ts` `updateProfile`). `lastName: '' → '-'`.
  - No Firebase calls (none of these fields touch auth identity).
  - Return the updated row via `toMotherDetailDto`.

### Route (`apps/backend/src/routes/admin.routes.ts`)
- `PATCH /admin/mothers/:id` with `validateBody(UpdateAdminMotherSchema)`, calling
  `updateAdminMother(routeParam(req.params.id), req.body)` (the `validateBody`
  middleware writes the parsed data back onto `req.body`), responding
  `res.json(ok(updated))`. Same auth guard as the other admin mother routes.

### Tests (`apps/backend/src/__tests__/admin-mother.service.test.ts`)
- `updateAdminMother`: updates provided fields; empty `lastName` → `'-'`; rejects a
  non-MOTHER / soft-deleted id with notFound; leaves omitted fields unchanged.

## Frontend

### API client (`apps/admin/src/lib/api.ts`)
- `fetchMother` return type → `AdminMotherDetail`.
- Add **`updateMother(id, input: UpdateAdminMotherInput): Promise<AdminMotherDetail>`**
  → `apiClient.patch(`/admin/mothers/${id}`, input)`.

### Redesigned page (`apps/admin/src/pages/mother-detail-page.tsx`)
Polished restyle reusing existing UI components (`Card`, `DescriptionList`, `Badge`,
`StatCard`, `Button`, `Modal`, `Field`, `Input`, `Select`, `useToast`):
- **Header** (`DetailHeader`): title = name, status `Badge` alongside, **Edit** button
  in the `actions` slot. Subtitle updated (no longer "read only").
- **Grouped sections** instead of one flat list:
  - **Contact** — Email, Phone, Address
  - **Account** — Status (badge), Verification
  - **Activity** — Bookings placed as a `StatCard`, Registered date
- **User ID removed.**

### Edit modal (`apps/admin/src/features/users/mother-edit-form.tsx`)
- New feature component rendered inside `Modal` (title "Edit parent", Save / Cancel).
- Controlled fields: `Field`+`Input` for First name, Last name, Address; `Select` for
  status (Active / Deactivated). Address field shows the helper text from the Address
  decision.
- Client-side validate with `UpdateAdminMotherSchema.safeParse` (mirrors `skill-form`).
- `useMutation(updateMother)`: on success close modal, `useToast` success, invalidate
  `['mother', id]` and `['admin-mothers']`; on error surface via `Feedback` /
  `apiErrorMessage`.
- Initial values seeded from the fetched `AdminMotherDetail`.

## Non-goals
- Editing email, phone, or verification flags.
- Re-geocoding / admin map picker for relocation.
- Any change to the mothers **list/table** view (that was a separate change).

## Testing / Verification
- Backend: `pnpm test --filter=@nanny-app/backend` (new service cases) + `pnpm typecheck`.
- Frontend: `pnpm typecheck`. Full visual/DB run isn't available locally (no Docker/DB),
  consistent with prior work here — verify via typecheck + backend unit tests.
