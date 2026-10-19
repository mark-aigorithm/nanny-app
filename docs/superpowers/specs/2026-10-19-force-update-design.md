# Force Update — Design

**Date:** 2026-10-19 · **Branch:** `feat/force-update`

## Goal

Admins record each mobile app release per platform and can mark a release **mandatory**. On
launch (and on returning to the foreground) the app asks the backend whether its installed
version is current. Users below the newest mandatory release are blocked until they update;
users below the newest release that is not mandatory get a dismissible "update available" prompt.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Enforcement model | Per-release records with a `mandatory` flag | Gives a release history and both hard and soft prompts from one table |
| Platforms | Each release belongs to one platform (`IOS` / `ANDROID`) | Store review times differ; forcing before a store publishes would strand users |
| Version key | Semver string `x.y.z`, compared numerically | Readable, matches the stores. Requires bumping `version` in `app.config.ts` every release |
| Delivery | Public check endpoint called by the app | Works before sign-in; logic stays on the backend. Per-request `426` middleware is out of scope |
| Failure mode | Fail open | Our outage or a malformed version must never lock users out |

**Known limit:** builds installed before this feature ships have no check and cannot be forced.
The first release containing it is the floor.

## Data model

New Prisma model (migration `<timestamp>_add_app_releases`), reusing the existing `DevicePlatform` enum:

```prisma
model AppRelease {
  id           Int            @id @default(autoincrement())
  platform     DevicePlatform
  version      String
  mandatory    Boolean        @default(false)
  releaseNotes String?        @map("release_notes")
  createdAt    DateTime       @default(now()) @map("created_at")
  updatedAt    DateTime       @updatedAt @map("updated_at")
  deletedAt    DateTime?      @map("deleted_at")

  @@index([platform])
  @@map("app_releases")
}
```

Uniqueness of `(platform, version)` among non-deleted rows is enforced in the service (same
pattern as `certification.service.ts` name clashes), so a soft-deleted release can be re-added.

## Shared (`packages/shared/src/app-release.ts`)

- `AppPlatformSchema` — `z.enum(['ios', 'android'])` (API-facing, lower-case; mapped to the Prisma enum in the service).
- `SemverSchema` — `/^\d+\.\d+\.\d+$/`.
- `AppReleaseSchema`, `CreateAppReleaseSchema` (`platform`, `version`, `mandatory`, `releaseNotes?` ≤ 1000 chars), `UpdateAppReleaseSchema` (`mandatory?`, `releaseNotes?`; at least one key — platform/version are immutable, delete and re-add instead).
- `AppVersionCheckQuerySchema` — `{ platform, version: z.string() }` (version deliberately not strict so garbage fails open instead of 400).
- `AppVersionCheckResultSchema` — `{ status: 'ok' | 'update_available' | 'update_required', latestVersion: string | null, storeUrl: string | null, releaseNotes: string | null }`.
- `compareVersions(a, b): -1 | 0 | 1 | null` — numeric per segment; `null` if either side is not valid semver.

All re-exported from `index.ts`.

## Backend

### Service `apps/backend/src/services/app-release.service.ts`

- `listAppReleases()`, `createAppRelease()`, `updateAppRelease()`, `deleteAppRelease()` (soft delete), following `certification.service.ts`.
- `checkAppVersion({ platform, version })`:
  1. Load non-deleted releases for the platform.
  2. If the client version is not valid semver, or there are no releases → `ok`.
  3. `latest` = highest release by `compareVersions`; `latestMandatory` = highest mandatory release.
  4. Client `< latestMandatory` → `update_required`; else client `< latest` → `update_available`; else `ok`.
  5. `latestVersion` / `releaseNotes` come from `latest`; `storeUrl` is set for non-`ok` results.
- Store URLs from config (validated in `src/lib/config.ts`, with defaults):
  `IOS_STORE_URL` = `https://apps.apple.com/app/id6797044436`,
  `ANDROID_STORE_URL` = `https://play.google.com/store/apps/details?id=com.nannyapp.mobile`.

### Routes

- Public: `GET /app-version/check?platform=&version=` in `app-version.routes.ts`, mounted in `routes/index.ts`, no auth, validated with `AppVersionCheckQuerySchema`. Invalid `platform` → 400.
- Admin (in `admin.routes.ts`): `GET/POST /app-releases`, `PATCH/DELETE /app-releases/:id`, each registered in `ADMIN_ROUTE_PERMISSIONS` under section `settings` (GET → VIEW, writes → MANAGE).
- Duplicate `(platform, version)` → 409 via `errors.*`.

## Mobile

- Add `expo-application`; version source is `Application.nativeApplicationVersion` (fallback `Constants.expoConfig.version`).
- `src/hooks/useAppVersionCheck.ts` — React Query, unauthenticated call via the existing `api` client, `refetchOnWindowFocus` (wired to app foreground by `bindFocusManager`), staleTime ~5 min, `retry: 1`. Errors resolve to "no gate".
- `src/components/UpdateGate.tsx`, mounted in `app/_layout.tsx` beside `<OfflineGate />`:
  - `update_required` → absolute-fill blocking screen: title, release notes, "Update now" opening `storeUrl` via `Linking.openURL`. Not dismissible; Android hardware back is consumed.
  - `update_available` → dismissible sheet ("Update" / "Later"). "Later" stores the dismissed `latestVersion` (AsyncStorage); the prompt reappears only for a newer `latestVersion`.
  - `ok` / error / loading → renders nothing (no extra splash delay).
- Styled per the `nanny-app-mobile-design` skill; verified with a `ui-sweep` pass (small/large phones, font 1.0/1.3, both nav modes).

## Admin

- `apps/admin/src/pages/app-releases-page.tsx`, modelled on `certifications-page.tsx`; route in `app.tsx` guarded by section `settings`; sidebar entry "App Releases" in `admin-layout.tsx`.
- `features/app-releases/app-release-table.tsx` — grouped by platform, sorted by semver desc; columns version, mandatory badge, notes, created date, actions.
- `features/app-releases/app-release-form.tsx` — modal: platform, version, mandatory toggle, notes (edit allows only mandatory + notes).
- Setting `mandatory` on (create or edit) shows a confirm: "Only make this mandatory once this build is live on the {platform} store — otherwise users will be blocked with nothing to install."
- API functions in `apps/admin/src/lib/api.ts`; write actions gated by `useCanManage('settings')`. Styled per the `nanny-app-admin-design` skill.

## Testing

- **Shared (Vitest):** `compareVersions` (ordering, multi-digit segments `1.10.0 > 1.9.0`, invalid → null); schema validation.
- **Backend unit (Jest):** `checkAppVersion` — no releases; equal to latest; below optional only; below mandatory; newer optional above older mandatory (still required if below the mandatory); other platform's releases ignored; soft-deleted ignored; garbage version → ok.
- **Backend integration:** journey test — admin creates releases, public check returns each status; duplicate → 409; admin without `settings` access → 403; check works unauthenticated.
- **Admin (Vitest + MSW):** page lists releases, create flow, mandatory confirm appears.
- **Mobile (Jest + RNTL):** `UpdateGate` renders blocker / sheet / nothing; "Later" suppresses the same version; request error renders nothing.
- No new Maestro flow.

## Docs

- `releasing-a-new-build` skill: add "bump `version` in `app.config.ts`" and "record the release in admin → App Releases after the store publishes it".

## Out of scope

- Per-request `426 Upgrade Required` enforcement via headers.
- OTA (EAS Update) runtime-version checks.
- Targeting by user segment or staged rollouts.
