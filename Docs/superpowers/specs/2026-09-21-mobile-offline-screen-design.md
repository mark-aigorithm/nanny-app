# Mobile offline screen

**Date:** 2026-09-21

## Problem

The mobile app has no connectivity handling. When the device is offline, every screen fails in
its own way — spinners that never end, `Network Error` toasts, a splash that never resolves.
The user gets no friendly explanation and nothing to tap.

## Design

### Trigger

A single global overlay, mounted once at the root, shown whenever the device is offline and
hidden the moment it is back. Not a route: navigation state is untouched, so coming back online
just un-renders the overlay and the user is exactly where they were.

### Detection — `expo-network`

Add `expo-network` (Expo SDK module; no config plugin; iOS, Android and web, so the
`preview:web` verify harness still runs). Requires a native rebuild (new dev client / EAS
build) — unavoidable for OS-level connectivity.

`apps/mobile/src/lib/network.ts` — the one place that touches `expo-network`:

- `isOfflineState(state)`: `isConnected === false || isInternetReachable === false`.
  `null`/`undefined` (state not yet known) counts as **online**, so the screen never flashes
  on cold start or on emulators that cannot validate reachability.
- `readIsOffline()`: `getNetworkStateAsync()` mapped through `isOfflineState`.
- `subscribeIsOffline(cb)`: `addNetworkStateListener` mapped the same way; returns an
  unsubscribe.

`apps/mobile/src/hooks/useNetworkStatus.ts`:

- Seeds from `readIsOffline()`, subscribes with `subscribeIsOffline`.
- Exposes `{ isOffline, recheck }` where `recheck()` re-reads the state once, updates the
  hook and resolves to the fresh `isOffline`.

`apps/mobile/src/lib/queryClient.ts` — `bindOnlineManager(subscribeIsOffline)`: feeds React
Query's `onlineManager.setEventListener` from the same source, so paused queries and mutations
resume by themselves when the connection returns. Called once at module level in
`app/_layout.tsx`.

### Screen — `apps/mobile/src/screens/OfflineScreen.tsx`

Same scaffold as `PendingReviewScreen`:

- `ScreenContainer useSafeArea={false}`, `screenPadding` horizontal padding.
- Centered `IconCircle` (`cloud-offline-outline`, size `xl`, `colors.warmSubtle` background,
  `colors.primaryDark` icon).
- Headline (`typeScale.displaySm`): **You're offline**
- Body (`typeScale.bodyLg`, `textSecondary`): *Check your Wi‑Fi or mobile data and we'll pick
  up right where you left off.*
- Footer `Button` **Try again** — `loading` while re-checking. If still offline it stays put;
  the screen is the message, no toast.
- Styles in `src/screens/styles/offline-screen.styles.ts`, theme tokens only.

Props: `{ onRetry: () => Promise<void> }`. The screen owns its own `isChecking` state around
the promise.

### Gate — `apps/mobile/src/components/OfflineGate.tsx`

- Calls `useNetworkStatus()`; renders `null` when online.
- When offline, renders `<OfflineScreen>` in an absolutely-positioned full-screen `View`
  (`StyleSheet.absoluteFill`, `colors.background`, high `zIndex`) so it covers the router
  stack and the modal hosts.
- `onRetry`: `await recheck()`; if now online, `queryClient.refetchQueries({ type: 'active' })`.
- Mounted in `app/_layout.tsx` after `<ConfirmDialogHost />` (inside `SafeAreaProvider`).

### Tests (Jest, `expo-network` mocked in `jest.setup.js`)

- `isOfflineState`: offline when `isConnected` false; offline when `isInternetReachable`
  false; online when both true; online when both `null`.
- `useNetworkStatus`: seeds from the initial read; flips on listener events; `recheck`
  returns the fresh value.
- `bindOnlineManager`: forwards online/offline to `onlineManager.setOnline`.
- `OfflineGate`: renders nothing online, renders the screen offline, hides on reconnect,
  refetches active queries after a successful retry.
- `OfflineScreen`: copy present; button shows loading while `onRetry` is pending.

## Out of scope

- "Continue offline" / cached browsing and a persistent offline banner.
- Backend reachability pings (a server outage with a working network is a different screen).
- E2E coverage: Maestro cannot toggle emulator connectivity from a flow.
