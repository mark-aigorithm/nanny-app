# Mobile Offline Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a friendly full-screen "You're offline" state over the whole mobile app whenever the device has no connection, with a "Try again" button, and lift it automatically when the network returns.

**Architecture:** `expo-network` is wrapped once in `src/lib/network.ts` (state → one `isOffline` boolean). A `useNetworkStatus` hook subscribes to it; an `OfflineGate` component mounted in the root layout renders `OfflineScreen` as an absolute overlay while offline. React Query's `onlineManager` is bound to the same source so paused queries resume on reconnect.

**Tech Stack:** Expo SDK 54, `expo-network ~8.0.8`, React Native 0.81, TanStack Query v5, Jest (`jest-expo`) + React Native Testing Library.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-21-mobile-offline-screen-design.md`.
- All work is in `apps/mobile`. Run commands from `D:/Projects/nanny-app/apps/mobile`.
- TypeScript strict; **no `any`**; `import type` for type-only imports. Test files are type-checked (`tsconfig` includes `src/**/*`).
- Theme rules: no hex colors, font strings, or hand-written shadows — only `colors.*`, `typeScale.*`, `spacing.*`, `screenPadding` from `@mobile/theme`. Screen styles live in a `styles/<name>.styles.ts` file next to the screen.
- Offline rule: `isOffline = isConnected === false || isInternetReachable === false`; `null`/`undefined` counts as online.
- Copy (verbatim): headline **You're offline**; body **Check your Wi‑Fi or mobile data and we'll pick up right where you left off.**; button **Try again**. Icon `cloud-offline-outline`.
- Jest: `jest.mock` factories may only reference out-of-scope variables whose names start with `mock`.
- Commit after every task with the trailer `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## File map

| File | Responsibility |
|---|---|
| `apps/mobile/package.json` | adds `expo-network` |
| `apps/mobile/jest.setup.js` | global "online, never fires" mock for `expo-network` |
| `apps/mobile/src/lib/network.ts` | the only importer of `expo-network`; `isOfflineState`, `readIsOffline`, `subscribeIsOffline` |
| `apps/mobile/src/lib/__tests__/network.test.ts` | tests for the above |
| `apps/mobile/src/lib/queryClient.ts` | adds `bindOnlineManager` |
| `apps/mobile/src/lib/__tests__/queryClient.test.ts` | tests `bindOnlineManager` |
| `apps/mobile/src/hooks/useNetworkStatus.ts` | `{ isOffline, recheck }` |
| `apps/mobile/src/hooks/__tests__/useNetworkStatus.test.tsx` | hook tests |
| `apps/mobile/src/screens/OfflineScreen.tsx` | the friendly screen (presentational, `onRetry` prop) |
| `apps/mobile/src/screens/styles/offline-screen.styles.ts` | its styles |
| `apps/mobile/src/screens/__tests__/OfflineScreen.test.tsx` | copy + loading behaviour |
| `apps/mobile/src/components/OfflineGate.tsx` | overlay host: hook + screen + refetch on successful retry |
| `apps/mobile/src/components/__tests__/OfflineGate.test.tsx` | gate tests |
| `apps/mobile/app/_layout.tsx` | mounts `OfflineGate`, calls `bindOnlineManager` |
| `apps/mobile/src/__preview__/OfflinePreview.tsx` | web preview wrapper for visual check |
| `apps/mobile/CLAUDE.md` | documents the connectivity pattern |

---

### Task 1: `expo-network` wrapper (`lib/network.ts`)

**Files:**
- Modify: `apps/mobile/package.json` (via `pnpm add`)
- Modify: `apps/mobile/jest.setup.js` (append mock #9)
- Create: `apps/mobile/src/lib/network.ts`
- Test: `apps/mobile/src/lib/__tests__/network.test.ts`

**Interfaces:**
- Produces:
  - `isOfflineState(state: Pick<NetworkState, 'isConnected' | 'isInternetReachable'>): boolean`
  - `readIsOffline(): Promise<boolean>` — never rejects; a failed native read resolves `false`
  - `subscribeIsOffline(listener: (isOffline: boolean) => void): () => void` — returns unsubscribe

- [ ] **Step 1: Install the module**

Run:
```bash
cd D:/Projects/nanny-app/apps/mobile && pnpm add expo-network@~8.0.8
```
Expected: `package.json` gains `"expo-network": "~8.0.8"`; `node_modules/expo-network/build/Network.d.ts` exists.

- [ ] **Step 2: Add the global jest mock**

Append to `apps/mobile/jest.setup.js` (after mock #8):

```js
// 9. Network — the offline gate subscribes at the root, so a screen test that
//    renders the root tree must see "online" and a listener that never fires;
//    otherwise the offline overlay would cover whatever it is asserting on.
//    Connectivity tests override with their own `jest.mock(...)`.
jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest
    .fn()
    .mockResolvedValue({ type: 'WIFI', isConnected: true, isInternetReachable: true }),
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
  NetworkStateType: { NONE: 'NONE', UNKNOWN: 'UNKNOWN', WIFI: 'WIFI', CELLULAR: 'CELLULAR' },
}));
```

- [ ] **Step 3: Write the failing tests**

Create `apps/mobile/src/lib/__tests__/network.test.ts`:

```ts
import * as Network from 'expo-network';

import { isOfflineState, readIsOffline, subscribeIsOffline } from '@mobile/lib/network';

// jest.setup.js already replaces expo-network with jest.fn()s; type them so
// each test can steer one call without re-declaring the whole module.
const mockedNetwork = jest.mocked(Network);

afterEach(() => {
  jest.clearAllMocks();
});

describe('isOfflineState', () => {
  it('is offline when the OS says there is no connection', () => {
    expect(isOfflineState({ isConnected: false, isInternetReachable: true })).toBe(true);
  });

  it('is offline when connected to a network that cannot reach the internet', () => {
    expect(isOfflineState({ isConnected: true, isInternetReachable: false })).toBe(true);
  });

  it('is online when both flags are true', () => {
    expect(isOfflineState({ isConnected: true, isInternetReachable: true })).toBe(false);
  });

  it('treats an unknown state as online so the overlay never flashes on cold start', () => {
    expect(isOfflineState({})).toBe(false);
    expect(isOfflineState({ isConnected: true, isInternetReachable: undefined })).toBe(false);
  });
});

describe('readIsOffline', () => {
  it('maps the current OS state', async () => {
    mockedNetwork.getNetworkStateAsync.mockResolvedValueOnce({ isConnected: false });

    await expect(readIsOffline()).resolves.toBe(true);
  });

  it('treats a failed read as online', async () => {
    mockedNetwork.getNetworkStateAsync.mockRejectedValueOnce(new Error('no native module'));

    await expect(readIsOffline()).resolves.toBe(false);
  });
});

describe('subscribeIsOffline', () => {
  it('forwards every OS event as a boolean and removes the subscription on unsubscribe', () => {
    const remove = jest.fn();
    let emit: ((state: Network.NetworkState) => void) | undefined;
    mockedNetwork.addNetworkStateListener.mockImplementationOnce((listener) => {
      emit = listener;
      return { remove };
    });
    const listener = jest.fn();

    const unsubscribe = subscribeIsOffline(listener);
    emit?.({ isConnected: false });
    emit?.({ isConnected: true, isInternetReachable: true });

    expect(listener.mock.calls).toEqual([[true], [false]]);

    unsubscribe();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run:
```bash
cd D:/Projects/nanny-app/apps/mobile && pnpm jest src/lib/__tests__/network.test.ts
```
Expected: FAIL — `Cannot find module '@mobile/lib/network'`.

- [ ] **Step 5: Implement `lib/network.ts`**

Create `apps/mobile/src/lib/network.ts`:

```ts
import * as Network from 'expo-network';
import type { NetworkState } from 'expo-network';

/**
 * The only module that talks to `expo-network`. Everything else consumes the
 * one boolean the app cares about — "is the device offline?" — so the OS
 * state shape stays out of hooks and components.
 *
 * `isConnected`/`isInternetReachable` are `undefined` when the OS has not
 * reported yet (cold start) or cannot validate reachability (some emulators).
 * Both count as ONLINE: a false "you're offline" over a working app is worse
 * than a late one.
 */
export function isOfflineState(
  state: Pick<NetworkState, 'isConnected' | 'isInternetReachable'>,
): boolean {
  return state.isConnected === false || state.isInternetReachable === false;
}

/** One fresh read of the OS state. A failed read counts as online. */
export async function readIsOffline(): Promise<boolean> {
  try {
    return isOfflineState(await Network.getNetworkStateAsync());
  } catch {
    return false;
  }
}

/** Calls `listener` on every OS connectivity change. Returns the unsubscribe. */
export function subscribeIsOffline(listener: (isOffline: boolean) => void): () => void {
  const subscription = Network.addNetworkStateListener((state) => {
    listener(isOfflineState(state));
  });
  return () => subscription.remove();
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run:
```bash
cd D:/Projects/nanny-app/apps/mobile && pnpm jest src/lib/__tests__/network.test.ts
```
Expected: PASS, 7 tests.

- [ ] **Step 7: Typecheck and commit**

Run:
```bash
cd D:/Projects/nanny-app/apps/mobile && pnpm typecheck
```
Expected: no errors.

```bash
cd D:/Projects/nanny-app && git add apps/mobile/package.json pnpm-lock.yaml apps/mobile/jest.setup.js apps/mobile/src/lib/network.ts apps/mobile/src/lib/__tests__/network.test.ts && git commit -m "feat(mobile): wrap expo-network behind one isOffline boolean

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Bind React Query's `onlineManager` (`lib/queryClient.ts`)

**Files:**
- Modify: `apps/mobile/src/lib/queryClient.ts`
- Test: `apps/mobile/src/lib/__tests__/queryClient.test.ts`

**Interfaces:**
- Consumes: the `subscribeIsOffline` signature from Task 1 (passed in, not imported — keeps `queryClient.ts` free of native modules).
- Produces: `bindOnlineManager(subscribe: (listener: (isOffline: boolean) => void) => () => void): void`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/lib/__tests__/queryClient.test.ts`:

```ts
import { onlineManager } from '@tanstack/react-query';

import { bindOnlineManager } from '@mobile/lib/queryClient';

afterEach(() => {
  // Leave the singleton the way React Query ships it for other test files.
  onlineManager.setEventListener(() => undefined);
  onlineManager.setOnline(true);
});

it('drives onlineManager from the offline subscription', () => {
  let emit: ((isOffline: boolean) => void) | undefined;
  const unsubscribe = jest.fn();

  bindOnlineManager((listener) => {
    emit = listener;
    return unsubscribe;
  });

  emit?.(true);
  expect(onlineManager.isOnline()).toBe(false);

  emit?.(false);
  expect(onlineManager.isOnline()).toBe(true);
});

it('tears down the previous subscription when the listener is replaced', () => {
  const unsubscribe = jest.fn();
  bindOnlineManager(() => unsubscribe);

  onlineManager.setEventListener(() => undefined);

  expect(unsubscribe).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cd D:/Projects/nanny-app/apps/mobile && pnpm jest src/lib/__tests__/queryClient.test.ts
```
Expected: FAIL — `bindOnlineManager is not a function`.

- [ ] **Step 3: Implement `bindOnlineManager`**

Replace `apps/mobile/src/lib/queryClient.ts` with:

```ts
import { QueryClient, onlineManager } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60, // 1 minute
    },
  },
});

/**
 * Point React Query's online/offline awareness at the OS instead of its
 * default (`navigator.onLine`, meaningless on a device). Queries that fail
 * while offline pause instead of burning their retries, and refetch by
 * themselves (`refetchOnReconnect`) the moment `subscribe` reports the
 * network is back. Called once at app start with `subscribeIsOffline`.
 */
export function bindOnlineManager(
  subscribe: (listener: (isOffline: boolean) => void) => () => void,
): void {
  onlineManager.setEventListener((setOnline) =>
    subscribe((isOffline) => setOnline(!isOffline)),
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
cd D:/Projects/nanny-app/apps/mobile && pnpm jest src/lib/__tests__/queryClient.test.ts
```
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
cd D:/Projects/nanny-app && git add apps/mobile/src/lib/queryClient.ts apps/mobile/src/lib/__tests__/queryClient.test.ts && git commit -m "feat(mobile): bind React Query onlineManager to device connectivity

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `useNetworkStatus` hook

**Files:**
- Create: `apps/mobile/src/hooks/useNetworkStatus.ts`
- Test: `apps/mobile/src/hooks/__tests__/useNetworkStatus.test.tsx`

**Interfaces:**
- Consumes: `readIsOffline`, `subscribeIsOffline` from `@mobile/lib/network` (Task 1).
- Produces: `useNetworkStatus(): { isOffline: boolean; recheck: () => Promise<boolean> }` — `recheck` resolves to the fresh `isOffline` **after** applying it to the hook state.

- [ ] **Step 1: Write the failing tests**

Create `apps/mobile/src/hooks/__tests__/useNetworkStatus.test.tsx`:

```tsx
import { act, renderHook, waitFor } from '@testing-library/react-native';

// The hook only needs the two lib/network primitives; mock them directly so
// this test never touches expo-network's shape.
const mockReadIsOffline = jest.fn(async () => false);
let mockEmitOffline: ((isOffline: boolean) => void) | undefined;
const mockUnsubscribe = jest.fn();
jest.mock('@mobile/lib/network', () => ({
  readIsOffline: () => mockReadIsOffline(),
  subscribeIsOffline: (listener: (isOffline: boolean) => void) => {
    mockEmitOffline = listener;
    return mockUnsubscribe;
  },
}));

import { useNetworkStatus } from '@mobile/hooks/useNetworkStatus';

beforeEach(() => {
  jest.clearAllMocks();
  mockReadIsOffline.mockResolvedValue(false);
  mockEmitOffline = undefined;
});

it('starts online and stays online after the first read agrees', async () => {
  const { result } = renderHook(() => useNetworkStatus());

  expect(result.current.isOffline).toBe(false);
  await act(async () => {});
  expect(result.current.isOffline).toBe(false);
});

it('seeds from the first read when the device is already offline', async () => {
  mockReadIsOffline.mockResolvedValue(true);

  const { result } = renderHook(() => useNetworkStatus());

  await waitFor(() => expect(result.current.isOffline).toBe(true));
});

it('follows OS events', async () => {
  const { result } = renderHook(() => useNetworkStatus());
  await act(async () => {});

  act(() => mockEmitOffline?.(true));
  expect(result.current.isOffline).toBe(true);

  act(() => mockEmitOffline?.(false));
  expect(result.current.isOffline).toBe(false);
});

it('recheck applies the fresh read and returns it', async () => {
  const { result } = renderHook(() => useNetworkStatus());
  await act(async () => {});
  act(() => mockEmitOffline?.(true));

  mockReadIsOffline.mockResolvedValue(false);
  let outcome: boolean | undefined;
  await act(async () => {
    outcome = await result.current.recheck();
  });

  expect(outcome).toBe(false);
  expect(result.current.isOffline).toBe(false);
});

it('unsubscribes on unmount', async () => {
  const { unmount } = renderHook(() => useNetworkStatus());
  await act(async () => {});

  unmount();

  expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
cd D:/Projects/nanny-app/apps/mobile && pnpm jest src/hooks/__tests__/useNetworkStatus.test.tsx
```
Expected: FAIL — `Cannot find module '@mobile/hooks/useNetworkStatus'`.

- [ ] **Step 3: Implement the hook**

Create `apps/mobile/src/hooks/useNetworkStatus.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';

import { readIsOffline, subscribeIsOffline } from '@mobile/lib/network';

/**
 * "Is the device offline?" for the offline gate. Starts optimistic (online)
 * until the first OS read lands, then follows OS events.
 *
 * `recheck` backs the "Try again" button: one fresh read, applied to the hook
 * and returned, so the caller can act on the outcome without waiting for a
 * re-render.
 */
export function useNetworkStatus() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void readIsOffline().then((offline) => {
      if (!cancelled) setIsOffline(offline);
    });
    const unsubscribe = subscribeIsOffline(setIsOffline);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const recheck = useCallback(async () => {
    const offline = await readIsOffline();
    setIsOffline(offline);
    return offline;
  }, []);

  return { isOffline, recheck };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
cd D:/Projects/nanny-app/apps/mobile && pnpm jest src/hooks/__tests__/useNetworkStatus.test.tsx
```
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
cd D:/Projects/nanny-app && git add apps/mobile/src/hooks/useNetworkStatus.ts apps/mobile/src/hooks/__tests__/useNetworkStatus.test.tsx && git commit -m "feat(mobile): useNetworkStatus hook

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: `OfflineScreen`

**Files:**
- Create: `apps/mobile/src/screens/OfflineScreen.tsx`
- Create: `apps/mobile/src/screens/styles/offline-screen.styles.ts`
- Test: `apps/mobile/src/screens/__tests__/OfflineScreen.test.tsx`

**Interfaces:**
- Consumes: `Button`, `IconCircle`, `ScreenContainer` from `@mobile/components/ui`; `useRefreshByUser(onRefresh: () => Promise<unknown>): { isRefreshingByUser: boolean; refreshByUser: () => Promise<void> }` from `@mobile/hooks/useRefreshByUser`.
- Produces: `export default function OfflineScreen(props: { onRetry: () => Promise<void> })`.

- [ ] **Step 1: Write the failing tests**

Create `apps/mobile/src/screens/__tests__/OfflineScreen.test.tsx`:

```tsx
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import OfflineScreen from '@mobile/screens/OfflineScreen';

it('shows the friendly copy and a Try again button', () => {
  const { getByText } = render(<OfflineScreen onRetry={jest.fn(async () => undefined)} />);

  expect(getByText("You're offline")).toBeTruthy();
  expect(
    getByText("Check your Wi‑Fi or mobile data and we'll pick up right where you left off."),
  ).toBeTruthy();
  expect(getByText('Try again')).toBeTruthy();
});

it('calls onRetry and shows a spinner in the button until it settles', async () => {
  let settle: (() => void) | undefined;
  const onRetry = jest.fn(
    () =>
      new Promise<void>((resolve) => {
        settle = resolve;
      }),
  );
  const { getByText, queryByText } = render(<OfflineScreen onRetry={onRetry} />);

  fireEvent.press(getByText('Try again'));

  expect(onRetry).toHaveBeenCalledTimes(1);
  // Button swaps its label for an ActivityIndicator while `loading`.
  await waitFor(() => expect(queryByText('Try again')).toBeNull());

  await act(async () => {
    settle?.();
  });
  expect(getByText('Try again')).toBeTruthy();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
cd D:/Projects/nanny-app/apps/mobile && pnpm jest src/screens/__tests__/OfflineScreen.test.tsx
```
Expected: FAIL — `Cannot find module '@mobile/screens/OfflineScreen'`.

- [ ] **Step 3: Write the styles**

Create `apps/mobile/src/screens/styles/offline-screen.styles.ts`:

```ts
import { StyleSheet } from 'react-native';

import { colors, spacing, screenPadding, typeScale } from '@mobile/theme';

export const styles = StyleSheet.create({
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: screenPadding,
  },
  iconCircle: {
    marginBottom: spacing.xl,
  },
  headline: {
    ...typeScale.displaySm,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  body: {
    ...typeScale.bodyLg,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: screenPadding,
    // Plain screen with no nav bar — the standard bottom clearance token.
    paddingBottom: spacing['4xl'],
  },
});
```

- [ ] **Step 4: Write the screen**

Create `apps/mobile/src/screens/OfflineScreen.tsx`:

```tsx
import React from 'react';
import { View, Text } from 'react-native';

import { useRefreshByUser } from '@mobile/hooks/useRefreshByUser';
import { colors } from '@mobile/theme';
import { Button, IconCircle, ScreenContainer } from '@mobile/components/ui';
import { styles } from './styles/offline-screen.styles';

interface OfflineScreenProps {
  /** Re-checks connectivity; resolves once the check is done, whatever the outcome. */
  onRetry: () => Promise<void>;
}

/**
 * Full-screen "you're offline" state. OfflineGate renders it over the whole
 * app while the device has no connection and un-mounts it the moment the
 * network returns, so it has no navigation of its own — the user lands back
 * exactly where they were.
 */
export default function OfflineScreen({ onRetry }: OfflineScreenProps) {
  // Same "spinner for the whole user-initiated check" semantics as pull-to-refresh.
  const { isRefreshingByUser: isChecking, refreshByUser: retry } = useRefreshByUser(onRetry);

  return (
    <ScreenContainer useSafeArea={false}>
      <View style={styles.content}>
        <IconCircle
          icon="cloud-offline-outline"
          size="xl"
          backgroundColor={colors.warmSubtle}
          iconColor={colors.primaryDark}
          style={styles.iconCircle}
        />
        <Text style={styles.headline}>You're offline</Text>
        <Text style={styles.body}>
          Check your Wi‑Fi or mobile data and we'll pick up right where you left off.
        </Text>
      </View>

      <View style={styles.footer}>
        <Button title="Try again" onPress={() => void retry()} loading={isChecking} />
      </View>
    </ScreenContainer>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run:
```bash
cd D:/Projects/nanny-app/apps/mobile && pnpm jest src/screens/__tests__/OfflineScreen.test.tsx
```
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
cd D:/Projects/nanny-app && git add apps/mobile/src/screens/OfflineScreen.tsx apps/mobile/src/screens/styles/offline-screen.styles.ts apps/mobile/src/screens/__tests__/OfflineScreen.test.tsx && git commit -m "feat(mobile): friendly OfflineScreen

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: `OfflineGate` + root mount

**Files:**
- Create: `apps/mobile/src/components/OfflineGate.tsx`
- Test: `apps/mobile/src/components/__tests__/OfflineGate.test.tsx`
- Modify: `apps/mobile/app/_layout.tsx`

**Interfaces:**
- Consumes: `useNetworkStatus` (Task 3), `OfflineScreen` (Task 4), `queryClient` + `bindOnlineManager` (Task 2), `subscribeIsOffline` (Task 1).
- Produces: `export default function OfflineGate(): JSX.Element | null`.

- [ ] **Step 1: Write the failing tests**

Create `apps/mobile/src/components/__tests__/OfflineGate.test.tsx`:

```tsx
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

// Drive the gate through the real hook by faking only the lib/network
// primitives, so a test reads like the device going on and off the network.
const mockReadIsOffline = jest.fn(async () => false);
let mockEmitOffline: ((isOffline: boolean) => void) | undefined;
jest.mock('@mobile/lib/network', () => ({
  readIsOffline: () => mockReadIsOffline(),
  subscribeIsOffline: (listener: (isOffline: boolean) => void) => {
    mockEmitOffline = listener;
    return () => {
      mockEmitOffline = undefined;
    };
  },
}));

import OfflineGate from '@mobile/components/OfflineGate';
import { queryClient } from '@mobile/lib/queryClient';

const HEADLINE = "You're offline";

beforeEach(() => {
  jest.clearAllMocks();
  mockReadIsOffline.mockResolvedValue(false);
  jest.spyOn(queryClient, 'refetchQueries').mockResolvedValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

it('renders nothing while the device is online', async () => {
  const { queryByText } = render(<OfflineGate />);
  await act(async () => {});

  expect(queryByText(HEADLINE)).toBeNull();
});

it('covers the app when the OS reports the network is gone, and lifts when it returns', async () => {
  const { queryByText } = render(<OfflineGate />);
  await act(async () => {});

  act(() => mockEmitOffline?.(true));
  expect(queryByText(HEADLINE)).toBeTruthy();

  act(() => mockEmitOffline?.(false));
  expect(queryByText(HEADLINE)).toBeNull();
});

it('starts covered when the first read says offline', async () => {
  mockReadIsOffline.mockResolvedValue(true);

  const { findByText } = render(<OfflineGate />);

  expect(await findByText(HEADLINE)).toBeTruthy();
});

it('Try again keeps the screen up and refetches nothing while still offline', async () => {
  mockReadIsOffline.mockResolvedValue(true);
  const { findByText, getByText } = render(<OfflineGate />);
  await findByText(HEADLINE);

  await act(async () => {
    fireEvent.press(getByText('Try again'));
  });

  expect(getByText(HEADLINE)).toBeTruthy();
  expect(queryClient.refetchQueries).not.toHaveBeenCalled();
});

it('Try again lifts the gate and refetches active queries once back online', async () => {
  mockReadIsOffline.mockResolvedValueOnce(true);
  const { findByText, getByText, queryByText } = render(<OfflineGate />);
  await findByText(HEADLINE);

  mockReadIsOffline.mockResolvedValueOnce(false);
  await act(async () => {
    fireEvent.press(getByText('Try again'));
  });

  await waitFor(() => expect(queryByText(HEADLINE)).toBeNull());
  expect(queryClient.refetchQueries).toHaveBeenCalledWith({ type: 'active' });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
cd D:/Projects/nanny-app/apps/mobile && pnpm jest src/components/__tests__/OfflineGate.test.tsx
```
Expected: FAIL — `Cannot find module '@mobile/components/OfflineGate'`.

- [ ] **Step 3: Implement the gate**

Create `apps/mobile/src/components/OfflineGate.tsx`:

```tsx
import React from 'react';
import { StyleSheet, View } from 'react-native';

import OfflineScreen from '@mobile/screens/OfflineScreen';
import { useNetworkStatus } from '@mobile/hooks/useNetworkStatus';
import { queryClient } from '@mobile/lib/queryClient';
import { colors } from '@mobile/theme';

/**
 * Mount once in the root layout. Covers the whole app with OfflineScreen
 * while the device has no connection and gets out of the way the moment it
 * returns. It is an overlay, not a route: navigation state is untouched, so
 * "back online" simply reveals the screen the user was already on.
 *
 * Reconnects the OS notices by itself are handled by React Query's
 * onlineManager (`refetchOnReconnect`); the explicit refetch here is for
 * "Try again", which also has to revive queries that already exhausted their
 * retries before the device knew it was offline.
 */
export default function OfflineGate() {
  const { isOffline, recheck } = useNetworkStatus();

  const handleRetry = async () => {
    const stillOffline = await recheck();
    if (!stillOffline) await queryClient.refetchQueries({ type: 'active' });
  };

  if (!isOffline) return null;

  return (
    <View style={styles.overlay}>
      <OfflineScreen onRetry={handleRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
    // Above the router stack and the root-mounted hosts on both platforms.
    zIndex: 1000,
    elevation: 1000,
  },
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
cd D:/Projects/nanny-app/apps/mobile && pnpm jest src/components/__tests__/OfflineGate.test.tsx
```
Expected: PASS, 5 tests.

- [ ] **Step 5: Mount in the root layout and bind onlineManager**

Edit `apps/mobile/app/_layout.tsx`:

Add to the imports (after the `queryClient` import):

```ts
import { queryClient, bindOnlineManager } from '@mobile/lib/queryClient';
import { subscribeIsOffline } from '@mobile/lib/network';
import OfflineGate from '@mobile/components/OfflineGate';
```
(replace the existing `import { queryClient } from '@mobile/lib/queryClient';` line with the first of these).

After `SplashScreen.preventAutoHideAsync();` add:

```ts
// Let React Query pause/resume on real device connectivity rather than
// `navigator.onLine`. Module level: once per app process, before any query.
bindOnlineManager(subscribeIsOffline);
```

In the JSX, after `<ConfirmDialogHost />` add:

```tsx
        {/* Full-screen "you're offline" overlay — covers every area of the app
            while the device has no connection and lifts by itself. */}
        <OfflineGate />
```

- [ ] **Step 6: Typecheck and run the whole mobile suite**

Run:
```bash
cd D:/Projects/nanny-app/apps/mobile && pnpm typecheck && pnpm jest
```
Expected: typecheck clean; all suites pass (the global `expo-network` mock keeps every other screen test "online").

- [ ] **Step 7: Commit**

```bash
cd D:/Projects/nanny-app && git add apps/mobile/src/components/OfflineGate.tsx apps/mobile/src/components/__tests__/OfflineGate.test.tsx apps/mobile/app/_layout.tsx && git commit -m "feat(mobile): show OfflineScreen over the app whenever the device is offline

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Visual check + docs

**Files:**
- Create: `apps/mobile/src/__preview__/OfflinePreview.tsx`
- Modify: `apps/mobile/CLAUDE.md`

- [ ] **Step 1: Add a web preview wrapper**

Create `apps/mobile/src/__preview__/OfflinePreview.tsx`:

```tsx
/* Visual-validation harness for the offline overlay. */
import React from 'react';

import OfflineScreen from '@mobile/screens/OfflineScreen';
import { PreviewProviders } from './harness';

// Resolves after a beat so the button's loading spinner is visible in a screenshot.
const fakeRetry = () => new Promise<void>((resolve) => setTimeout(resolve, 1500));

export default function OfflinePreview() {
  return (
    <PreviewProviders>
      <OfflineScreen onRetry={fakeRetry} />
    </PreviewProviders>
  );
}
```

- [ ] **Step 2: Build and serve the preview, screenshot it**

Run:
```bash
cd D:/Projects/nanny-app/apps/mobile && COMPONENT="src/__preview__/OfflinePreview.tsx" pnpm preview:web
```
Expected: `dist/preview/preview-index.html` built.

Serve in the background:
```bash
cd D:/Projects/nanny-app/apps/mobile && ./node_modules/.bin/vite preview --config vite.preview.config.ts --port 3177 --strictPort
```
Open `http://localhost:3177/preview-index.html` in the browser pane; confirm: icon circle, headline, body, full-width primary button; press **Try again** and confirm the spinner. Screenshot for the user.

- [ ] **Step 3: Document the pattern**

In `apps/mobile/CLAUDE.md`, under **Core Patterns**, append:

```md
- Connectivity: `src/lib/network.ts` is the only importer of `expo-network`. `OfflineGate` (mounted
  once in `app/_layout.tsx`) covers the app with `screens/OfflineScreen` while the device is offline;
  `bindOnlineManager` keeps React Query's pause/resume in step. Never read `expo-network` elsewhere.
```

- [ ] **Step 4: Commit**

```bash
cd D:/Projects/nanny-app && git add apps/mobile/src/__preview__/OfflinePreview.tsx apps/mobile/CLAUDE.md && git commit -m "docs(mobile): offline overlay pattern + preview wrapper

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Not in this plan (report to the user at the end)

- **A native rebuild is required** — `expo-network` is a new native module, so the existing dev client / EAS builds won't load it until rebuilt (`releasing-a-new-build` skill).
- Device E2E: if the Android emulator's captive-portal check fails on this machine, `isInternetReachable` is `false` and the gate will cover the app during Maestro runs. Not observed yet; revisit only if a flow starts hanging on the offline screen.
