# Cameras Entity + Admin CRUD — Design

Date: 2026-07-12
Status: Approved

## Goal

Add a new `Camera` entity to the database and full CRUD management for it in the
admin app. Each camera has a name and a stream URL, and can optionally be
assigned to a nanny (so a parent could later view the nanny's camera feed).

## Decisions

- **FK target = `users`.** The camera's nanny link references the base `User`
  identity row (a user with role `NANNY`), not `NannyProfile`. Column is named
  `nanny_user_id` to make the intent explicit even though it points at `users`.
- **Assignment via dropdown.** The admin form picks a nanny from a dropdown of
  **approved** nannies. This needs a small options endpoint.
- **Soft delete.** Per repo convention (root/backend CLAUDE.md), every model
  includes `created_at`, `updated_at`, `deleted_at`; all reads filter
  `deleted_at IS NULL` and deletes are soft (`update` sets `deleted_at`).
- **Full edit flow.** Unlike the create-only promo-code UI, cameras get a proper
  create + edit form so name / stream URL / nanny assignment can be changed.

## 1. Data model — `apps/backend/prisma/schema.prisma`

New model:

```prisma
model Camera {
  id          String    @id @default(cuid())
  name        String
  streamUrl   String    @map("stream_url")
  // Nullable FK → a nanny user (users table, role NANNY). Null = unassigned.
  nannyUserId String?   @map("nanny_user_id")
  nannyUser   User?     @relation("NannyCameras", fields: [nannyUserId], references: [id])
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt      @map("updated_at")
  deletedAt   DateTime? @map("deleted_at")

  @@index([nannyUserId])
  @@index([deletedAt])
  @@map("cameras")
}
```

Add the reverse relation on `User`:

```prisma
cameras Camera[] @relation("NannyCameras")
```

Migration name: `add_cameras_table` (`pnpm db:migrate:dev --name add_cameras_table`).

## 2. Shared Zod schemas — new `packages/shared/src/camera.ts`

Export from `packages/shared/src/index.ts` (`export * from './camera';`).

```ts
// DTO returned by the API
CameraSchema = {
  id: string,
  name: string,
  streamUrl: string,
  nannyUserId: string | null,
  nannyName: string | null,   // resolved display name, null when unassigned
  createdAt: string,
}

CreateCameraSchema = {
  name: string (min 1, max 100),
  streamUrl: string().url(),
  nannyUserId: string optional/nullable,
}

UpdateCameraSchema = CreateCameraSchema.partial()  // all fields optional; nannyUserId nullable

NannyOptionSchema = { userId: string, name: string }
```

Inferred types: `Camera`, `CreateCameraInput`, `UpdateCameraInput`, `NannyOption`.

## 3. Backend

### Service — `apps/backend/src/services/camera.service.ts`

Mirrors `promo-code.service.ts` (soft-delete filters, `toDto`, `errors.*`).

- `listCameras(): Promise<Camera[]>` — `findMany` where `deletedAt: null`, newest
  first, `include` nanny user (`id`, `firstName`, `lastName`); DTO resolves
  `nannyName`.
- `createCamera(input: CreateCameraInput): Promise<Camera>` — if `nannyUserId`
  provided, validate it is an existing, non-deleted user with an APPROVED nanny
  profile (else `errors.badRequest`/`notFound`). Create row.
- `updateCamera(id, input: UpdateCameraInput): Promise<Camera>` — `findFirst`
  (`id`, `deletedAt: null`) else `errors.notFound`; same nanny validation when
  `nannyUserId` present; conditional-spread update like promo-code.
- `deleteCamera(id): Promise<{ id: string }>` — soft delete.
- `listNannyOptions(): Promise<NannyOption[]>` — approved nannies' `{ userId, name }`
  (`nannyProfile` where `approvalStatus: APPROVED`, `deletedAt: null`,
  `user: { deletedAt: null }`; map to `user.id` + full name).

### Routes — `apps/backend/src/routes/admin.routes.ts`

Add under existing `requireAuth, requireAdmin` guard, following the promo-code
block:

- `GET    /admin/cameras/nanny-options` → `listNannyOptions()` (register before
  the `:id` routes to avoid any path ambiguity)
- `GET    /admin/cameras` → `listCameras()`
- `POST   /admin/cameras` → `validateBody(CreateCameraSchema)` → `createCamera` (201)
- `PATCH  /admin/cameras/:id` → `validateBody(UpdateCameraSchema)` → `updateCamera`
- `DELETE /admin/cameras/:id` → `deleteCamera`

## 4. Admin frontend — `apps/admin/`

### `src/lib/api.ts`

Add `fetchCameras`, `createCamera`, `updateCamera`, `deleteCamera`,
`fetchNannyOptions` (same `ApiEnvelope<T>` pattern as promo codes).

### `src/features/cameras/camera-form.tsx`

Single form handling **create and edit**. Props: optional `editing?: Camera` and
`onDone?: () => void`. Fields: name (text), stream URL (url), nanny (`<select>`
from `fetchNannyOptions`; blank option = "Unassigned"). Validates with
`CreateCameraSchema` / `UpdateCameraSchema`, invalidates `['cameras']` on success,
resets (create) or calls `onDone` (edit).

### `src/features/cameras/camera-table.tsx`

Columns: Name, Stream URL, Nanny (name or "—"), Created, actions. Actions: **Edit**
(sets editing state on the page) and **Delete** (`window.confirm` then soft delete),
mirroring `promo-code-table.tsx`.

### `src/pages/cameras-page.tsx`

`useQuery(['cameras'], fetchCameras)`; holds `editing: Camera | null` state; renders
`PageHeader`, `CameraForm` (create or edit mode), loading/error `Feedback`, and
`CameraTable`.

### `src/app.tsx`

Add `<Route path="cameras" element={<CamerasPage />} />` inside the authed layout.

### `src/components/admin-layout.tsx`

Add `{ to: '/cameras', label: 'Cameras' }` to `navItems`.

## Testing

No new unit test for `camera.service.ts` — matches existing coverage
(`promo-code.service.ts` has none). Can be added later if desired.

## Out of scope

- Parent/nanny mobile-app camera viewing (this is admin management only).
- Live stream playback/validation of the URL beyond format checking.
- Releasing/reassigning cameras automatically on nanny deletion.
