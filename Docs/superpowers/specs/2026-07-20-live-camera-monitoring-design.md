# Live Camera Monitoring — Design

Date: 2026-07-20
Branch: `feature/live-camera-monitoring`

## Goal

Once a booking is `IN_PROGRESS`, the parent can watch a live video feed from the
camera attached to that booking's nanny, from inside the NannyNow app. The parent
can also send the nanny a push notification asking them to turn the camera on.

## Context

The `Camera` model already exists (`id`, `name`, `streamUrl`, `nannyUserId`) and is
managed from the admin console (`apps/admin/src/features/cameras`). Nothing consumes
`streamUrl` today. `apps/mobile/src/screens/parent/LiveVideoMonitorScreen.tsx` exists
but is entirely mocked — hardcoded strings, no player, no API call.

So this feature is mostly wiring, plus one genuinely new piece: a native RTSP player.

## Linking model

A booking resolves to a camera via the nanny:

```
Booking.nannyProfileId -> NannyProfile.userId -> Camera.nannyUserId
```

No `Booking.cameraId` column. The camera follows the nanny, not the booking, which
matches how admins assign cameras today.

If a nanny has multiple cameras, take the most recently created non-deleted one.

## Schema changes

1. `Booking.cameraNotifiedAt DateTime? @map("camera_notified_at")` — cooldown
   timestamp for the notify button.
2. `NotificationType.CAMERA_REQUESTED` — new enum member.

On (2): `toApiNotificationType` in `notification.service.ts` has a `default` branch
that returns `'marketplace_message'`. A new enum member that isn't added to that
switch is silently mislabelled rather than caught. The switch must be updated in the
same change.

### Why a column and not Redis

`CLAUDE.md` describes Redis for rate limiting. In reality `apps/backend/src/` contains
no Redis client and no rate-limit helper — `ioredis`, `express-rate-limit` and
`rate-limit-redis` are installed but unreferenced. Standing up a Redis connection for
one button is disproportionate. A nullable timestamp on the booking gives exact,
persistent, per-booking throttling with no new infrastructure.

## Backend

### `GET /bookings/:id/camera`

- `requireAuth`; ownership and role enforced in the service, consistent with the rest
  of `booking.routes.ts` (which has no role middleware).
- **Parent only.** The nanny does not need to watch their own feed.
- Requires `status === 'IN_PROGRESS'`. Outside that, `403`.
- `404` if the nanny has no camera.

Response:

```ts
{ name: string; streamUrl: string; online: boolean | null; checkedAt: string }
```

### Liveness probe

`net.connect({ host, port })` against the parsed `streamUrl` (default port `554`),
2s timeout. Resolves `true` on `connect`, `false` on `error`/`timeout`. Socket is
always destroyed. `online: null` when the URL cannot be parsed.

Results are cached in-process for 15s keyed by camera id, so a parent pulling to
refresh doesn't repeatedly dial the camera.

**Known limitation:** an open port proves the camera is reachable, not that a stream
is flowing. A powered-on camera that isn't publishing will read "Online". Accepted for
this iteration.

### `POST /bookings/:id/camera/notify`

- Parent only, `IN_PROGRESS` only.
- `429` if `cameraNotifiedAt` is less than 5 minutes old; response carries
  `retryAfterSeconds` so the client can render a countdown.
- On success: sets `cameraNotifiedAt = now`, then `dispatchPush` +
  `createInAppNotification` to the nanny's user with
  `type: CAMERA_REQUESTED`, `referenceType: BOOKING`, `referenceId: booking.id`.

`dispatchPush` swallows its own errors, so a missing device token does not fail the
request — the in-app notification still lands.

### `BookingResponse.hasCamera: boolean`

Drives button visibility on the parent's booking screen.

`streamUrl` is deliberately **not** added to `BookingResponse`. RTSP URLs commonly
embed `user:pass@` credentials, and `BookingResponse` is a broad payload returned from
many endpoints and cached client-side. The URL is served only from the dedicated,
status-gated camera endpoint. This mirrors the existing `startPinActive` boolean,
which signals availability without exposing the secret.

## Shared

`packages/shared/src/camera.ts` gains `BookingCameraSchema` / `BookingCamera`.
`packages/shared/src/booking.ts` gains `hasCamera` on `BookingResponseSchema`.

`packages/shared/dist/` is gitignored, so it just needs rebuilding locally
(`pnpm build` in `packages/shared`) before mobile typechecks.

## Mobile

### Player

`react-native-vlc-media-player`, wrapped by libVLC, which handles RTSP on both
platforms. This requires a config plugin, `expo prebuild`, and a **fresh EAS
development build** — the native module cannot arrive over an OTA update, so existing
installed dev builds will not pick it up.

Chosen over the platform players because `AVPlayer` on iOS has no RTSP support at all;
ExoPlayer on Android does, which would yield a working Android and a broken iOS.

**New Architecture compatibility: VERIFIED WORKING (2026-07-21.)** This was the
main risk in the design. Expo SDK 54 enables the New Architecture by default and
`react-native-vlc-media-player` is a legacy Paper view manager with no
Fabric/codegen support, so it depends on React Native's legacy interop layer —
and video surfaces are a known interop edge case. It was tested end-to-end on a
device and the stream renders correctly. No fallback was needed.

Fallbacks, kept only in case a future Expo upgrade regresses this:

1. `newArchEnabled: false` in `app.config.ts`. SDK 54 is the last release where
   the New Architecture can be disabled, so this defers rather than solves.
2. Upgrade to Expo SDK 55 and switch to `expo-libvlc-player`, a proper
   New-Architecture Expo module. The clean end state, rejected here only because
   it has no SDK 54 build — its versions jump from Expo 53 to Expo 55.

### iOS build configuration

Getting iOS to build at all required four interlocking Podfile settings for
React Native Firebase. They are documented in
`apps/mobile/plugins/withIosFirebasePods.js`; removing any one breaks the build
in a different and misleading way. Notably `buildReactNativeFromSource` must
stay off, or fmt 11.0.2 fails under Xcode 26 clang.

### `LiveVideoMonitorScreen`

Rewritten from the mock. Takes `bookingId` as a route param and renders:

- `VLCPlayer` for the stream, with loading and error states
- camera name and an Online / Offline status dot from the probe
- "Ask nanny to turn on the camera" button, disabled with a countdown during cooldown
- an explicit error state when the stream fails to open, offering retry

### `BookingDetailScreen`

A "Watch Live" button gated on `status === 'IN_PROGRESS' && booking.hasCamera`,
placed alongside the existing care-log section.

## Testing

Backend, following the existing `apps/backend/src/__tests__/booking-*.test.ts` style:

- parent can fetch the camera for their own `IN_PROGRESS` booking
- nanny is refused; unrelated user is refused
- non-`IN_PROGRESS` status is refused
- nanny with no camera gives `404`
- probe returns `online: false` on a closed port and `null` on an unparseable URL
- notify sends on first call, `429`s on the second within the window
- notify succeeds even when the nanny has no device token

Shared: schema parse tests. Mobile: button visibility gating.

## Risks

1. ~~`react-native-vlc-media-player` may not work under the New Architecture.~~
   Resolved — verified working on device 2026-07-21. The package remains thinly
   maintained, so an Expo/RN upgrade could regress it; see the fallbacks above.
2. The TCP probe overstates liveness (see above).
3. libVLC meaningfully increases binary size.
4. RTSP playback assumes the camera is reachable from the parent's device. Cameras
   behind home NAT will not work without a relay; confirmed out of scope as the
   camera URLs are publicly reachable.
