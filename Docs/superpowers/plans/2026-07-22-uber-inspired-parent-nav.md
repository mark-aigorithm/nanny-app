# Uber-Inspired Parent Nav Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the parent app's navigation into an Uber-style floating pill tab bar (Home · Services · Activity · Account), add a Services hub screen, restyle the bookings screen as Activity, and rebuild the profile screen as an Uber-style Account screen — all in NannyNow's existing sage/cream design tokens.

**Architecture:** Rebuild in place. `BottomNav.tsx` is restyled into the floating pill and its tab union changes; nine parent screens remap their `activeTab` prop. One new route (`services`). `bookings` and `mother-profile` routes are reused as the Activity and Account tabs. No new theme tokens.

**Tech Stack:** Expo (React Native), expo-router, React Query, Zustand, jest-expo + React Native Testing Library, Manrope/Ionicons, `@mobile/theme` tokens.

**Spec:** `Docs/superpowers/specs/2026-07-22-uber-inspired-parent-nav-design.md`

## Global Constraints

- **Tokens only:** never hardcode hex colors, font family strings, or shadow objects — use `colors.*`, `fontFamily.*`/`typeScale.*`, `...shadows.*` from `@mobile/theme`. If no token fits, use the closest existing one; never invent values.
- Screen styles live in `src/screens/parent/styles/<screen-name>.styles.ts`, importing only from `@mobile/theme`.
- No `any`; `import type` for type-only imports; kebab-case file names.
- Canonical background is `colors.background` (`#fdfaf8`).
- `BOTTOM_NAV_HEIGHT` (80) is the **nanny** bar's height — do not change it; parent screens use the new `FLOATING_NAV_CLEARANCE`.
- Tab labels are exactly: `Home`, `Services`, `Activity`, `Account`.
- Guest-gate messages verbatim: Activity → `Create your free account to book and manage care.` Account → `Create your free account to set up your profile.`
- Run all commands from `apps/mobile/` unless stated otherwise. Tests: `npx jest <path> -t "<name>"` or `pnpm test`.
- Commit after every task (small, conventional commits).

## Spec amendments (decided during planning, flagged to user)

1. **Former tab screens keep the floating bar** (with the owning hub tab active) instead of switching to back headers: Community/CommunityFeed/EventsMeetups/Marketplace show `services` active; Messages shows `account` active. Less churn, persistent navigation.
2. **Account 2×2 tiles are Help / Wallet / Inbox / Notifications.** The spec's "Safety → live monitor" tile is dropped because the live monitor is booking-bound (needs an `IN_PROGRESS` booking with a camera) and would dead-end from Account.
3. **Rating pill:** `UserResponse` has no rating field. The pill under the name shows **"✓ Verified"** (`shield-checkmark`) when `idVerificationStatus === 'APPROVED'`, otherwise **"Member since YYYY"** from `createdAt`.
4. **Services grid** is the hero tile + 4 tiles (Community, Marketplace, Events & Meetups, Care Points). Refer-a-friend stays an Account promo card only.

---

### Task 1: Floating pill tab bar + tab remap

**Files:**
- Modify: `src/components/BottomNav.tsx` (full rewrite below)
- Modify: `src/theme/layout.ts` (add `FLOATING_NAV_CLEARANCE`, rebase `PARENT_TAB_SCROLL_BOTTOM`/`PARENT_TAB_FAB_BOTTOM`)
- Modify: `src/theme/index.ts` (export `FLOATING_NAV_CLEARANCE`)
- Modify: `src/hooks/useMessaging.ts:99-106` (`useUnreadMessageCount` gains `enabled`)
- Modify: `src/lib/profileUtils.ts` (decouple `ProfileReturnTo` from `BottomNavTab`, add `services`)
- Modify (one-line `activeTab` prop each): `src/screens/parent/HomeScreen.tsx:118`, `BookingHistoryScreen.tsx:163`, `CareActivityFeedScreen.tsx:135`, `CommunityScreen.tsx:169`, `CommunityFeedScreen.tsx:225`, `EventsMeetupsScreen.tsx:178`, `MarketplaceScreen.tsx:174`, `MessagesScreen.tsx:151`, `NotificationsScreen.tsx:220`
- Modify (mechanical `BOTTOM_NAV_HEIGHT` → `FLOATING_NAV_CLEARANCE` swap): `src/screens/parent/styles/community-screen.styles.ts`, `marketplace-screen.styles.ts`, `community-feed-screen.styles.ts`, `marketplace-item-detail-screen.styles.ts`, `booking-history-screen.styles.ts`, `events-meetups-screen.styles.ts`, `notifications-screen.styles.ts`, `care-activity-feed-screen.styles.ts`
- Test: `src/components/__tests__/BottomNav.test.tsx` (new)

**Interfaces:**
- Consumes: `useGuestGate()` → `{ isGuest, gate }`; `useUnreadMessageCount(enabled?)` → React Query result with `data?.unreadCount`.
- Produces: `BottomNav` component with props `{ activeTab: BottomNavTab }` (no more `messagesBadge`); `export type BottomNavTab = 'home' | 'services' | 'activity' | 'account'`; theme export `FLOATING_NAV_CLEARANCE: number`. Later tasks rely on: Services tab href `/(parent)/services`, Account tab href `/(parent)/mother-profile`, `ProfileReturnTo` including `'services'`.

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/BottomNav.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// `@mobile/lib/api` imports firebase, which eagerly initializes the real SDK
// at module-load time and crashes jest-expo's transform. Stub the API layer.
jest.mock('@mobile/lib/api', () => ({
  api: { get: jest.fn().mockResolvedValue({ data: { data: { unreadCount: 0 }, error: null } }) },
  unwrap: jest.fn((promise: Promise<{ data: { data: unknown; error: string | null } }>) =>
    promise.then((res) => res.data.data),
  ),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

// No SafeAreaProvider in jest — stub the insets hook the floating bar uses.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import BottomNav from '@mobile/components/BottomNav';
import { useGuestStore } from '@mobile/store/guestStore';
import { useRegisterPromptStore } from '@mobile/store/registerPromptStore';

function renderNav(activeTab: React.ComponentProps<typeof BottomNav>['activeTab'] = 'home') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BottomNav activeTab={activeTab} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useGuestStore.setState({ isGuest: false });
  useRegisterPromptStore.setState({ message: null });
});

describe('BottomNav', () => {
  it('renders the four Uber-style tabs', () => {
    const { getByText } = renderNav();
    getByText('Home');
    getByText('Services');
    getByText('Activity');
    getByText('Account');
  });

  it('navigates to the services hub', () => {
    const { getByText } = renderNav();
    fireEvent.press(getByText('Services'));
    expect(mockPush).toHaveBeenCalledWith('/(parent)/services');
  });

  it('navigates to bookings for Activity and mother-profile for Account when signed in', () => {
    const { getByText } = renderNav();
    fireEvent.press(getByText('Activity'));
    expect(mockPush).toHaveBeenCalledWith('/(parent)/bookings');
    fireEvent.press(getByText('Account'));
    expect(mockPush).toHaveBeenCalledWith('/(parent)/mother-profile');
  });

  it('gates Activity and Account behind the register prompt for guests', () => {
    useGuestStore.setState({ isGuest: true });
    const { getByText } = renderNav();

    fireEvent.press(getByText('Activity'));
    expect(mockPush).not.toHaveBeenCalled();
    expect(useRegisterPromptStore.getState().message).toBe(
      'Create your free account to book and manage care.',
    );

    useRegisterPromptStore.setState({ message: null });
    fireEvent.press(getByText('Account'));
    expect(mockPush).not.toHaveBeenCalled();
    expect(useRegisterPromptStore.getState().message).toBe(
      'Create your free account to set up your profile.',
    );
  });

  it('does not gate Home or Services for guests', () => {
    useGuestStore.setState({ isGuest: true });
    const { getByText } = renderNav();
    fireEvent.press(getByText('Services'));
    expect(mockPush).toHaveBeenCalledWith('/(parent)/services');
    expect(useRegisterPromptStore.getState().message).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/__tests__/BottomNav.test.tsx`
Expected: FAIL — `getByText('Services')` not found (old tabs still rendered).

- [ ] **Step 3: Add `FLOATING_NAV_CLEARANCE` to the theme**

In `src/theme/layout.ts`, replace:

```ts
export const BOTTOM_NAV_HEIGHT = 80;
```

with:

```ts
export const BOTTOM_NAV_HEIGHT = 80;

/**
 * Bottom content clearance for the parent floating pill tab bar:
 * pill height (~72) + bottom offset + breathing room. Screens that scroll
 * under the floating bar pad their content with this, NOT BOTTOM_NAV_HEIGHT
 * (which remains the nanny bar's in-flow height).
 */
export const FLOATING_NAV_CLEARANCE = 112;
```

and replace the two derived constants at the bottom of the file:

```ts
export const PARENT_TAB_SCROLL_BOTTOM = BOTTOM_NAV_HEIGHT + spacing.lg + 16;

export const PARENT_TAB_FAB_BOTTOM = BOTTOM_NAV_HEIGHT + spacing.lg;
```

with:

```ts
export const PARENT_TAB_SCROLL_BOTTOM = FLOATING_NAV_CLEARANCE + spacing.lg;

export const PARENT_TAB_FAB_BOTTOM = FLOATING_NAV_CLEARANCE + spacing.sm;
```

In `src/theme/index.ts`, add `FLOATING_NAV_CLEARANCE` to the layout export list:

```ts
export { STATUS_BAR_HEIGHT, HEADER_HEIGHT, BOTTOM_NAV_HEIGHT, FLOATING_NAV_CLEARANCE, PARENT_TAB_SEARCH_BAR_HEIGHT, PARENT_TAB_SEARCH_STRIP_HEIGHT, PARENT_TAB_CONTENT_TOP, PARENT_TAB_CONTENT_TOP_WITH_SEARCH, PARENT_TAB_SCROLL_BOTTOM, PARENT_TAB_FAB_BOTTOM } from './layout';
```

- [ ] **Step 4: Add `enabled` to `useUnreadMessageCount`**

In `src/hooks/useMessaging.ts`, replace:

```ts
export function useUnreadMessageCount() {
  return useQuery({
    queryKey: [MESSAGING_KEY, 'unread-count'],
    queryFn: async () => unwrap<UnreadCountResponse>(api.get('/conversations/unread-count')),
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });
}
```

with:

```ts
/** Pass `enabled: false` for guests — the endpoint requires auth. */
export function useUnreadMessageCount(enabled = true) {
  return useQuery({
    queryKey: [MESSAGING_KEY, 'unread-count'],
    queryFn: async () => unwrap<UnreadCountResponse>(api.get('/conversations/unread-count')),
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    enabled,
  });
}
```

(Existing call in `MessagesScreen.tsx` keeps working — the parameter defaults to `true`.)

- [ ] **Step 5: Rewrite `BottomNav.tsx` as the floating pill**

Replace the entire contents of `src/components/BottomNav.tsx` with:

```tsx
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fontFamily, spacing, borderRadius, shadows } from '@mobile/theme';
import { useGuestGate } from '@mobile/hooks/useGuestGate';
import { useUnreadMessageCount } from '@mobile/hooks/useMessaging';

export type BottomNavTab = 'home' | 'services' | 'activity' | 'account';

// Account-bound tabs open the register prompt for guests instead of navigating.
const GUEST_GATE_MESSAGES: Partial<Record<BottomNavTab, string>> = {
  activity: 'Create your free account to book and manage care.',
  account: 'Create your free account to set up your profile.',
};

interface Props {
  activeTab: BottomNavTab;
}

const TABS: {
  key: BottomNavTab;
  label: string;
  activeIcon: keyof typeof Ionicons.glyphMap;
  inactiveIcon: keyof typeof Ionicons.glyphMap;
  href: '/(parent)/home' | '/(parent)/services' | '/(parent)/bookings' | '/(parent)/mother-profile';
}[] = [
  {
    key: 'home',
    label: 'Home',
    activeIcon: 'home',
    inactiveIcon: 'home-outline',
    href: '/(parent)/home',
  },
  {
    key: 'services',
    label: 'Services',
    activeIcon: 'grid',
    inactiveIcon: 'grid-outline',
    href: '/(parent)/services',
  },
  {
    key: 'activity',
    label: 'Activity',
    activeIcon: 'receipt',
    inactiveIcon: 'receipt-outline',
    href: '/(parent)/bookings',
  },
  {
    key: 'account',
    label: 'Account',
    activeIcon: 'person',
    inactiveIcon: 'person-outline',
    href: '/(parent)/mother-profile',
  },
];

/**
 * Uber-style floating pill tab bar. Absolutely positioned above the bottom
 * safe area — screens keep it in JSX flow but pad scroll content with
 * FLOATING_NAV_CLEARANCE so nothing hides behind it.
 */
export default function BottomNav({ activeTab }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isGuest, gate } = useGuestGate();
  const { data: unreadData } = useUnreadMessageCount(!isGuest);
  const hasUnread = (unreadData?.unreadCount ?? 0) > 0;

  return (
    <View
      style={[styles.wrapper, { bottom: insets.bottom + spacing.md }]}
      pointerEvents="box-none"
    >
      <View style={styles.pill}>
        {TABS.map(tab => {
          const isActive = tab.key === activeTab;
          const guestMessage = GUEST_GATE_MESSAGES[tab.key];
          const navigate = () => router.push(tab.href);
          return (
            <Pressable
              key={tab.key}
              style={styles.navItem}
              onPress={guestMessage ? gate(navigate, guestMessage) : navigate}
            >
              <View style={[styles.iconCircle, isActive && styles.iconCircleActive]}>
                <Ionicons
                  name={isActive ? tab.activeIcon : tab.inactiveIcon}
                  size={20}
                  color={isActive ? colors.textPrimary : colors.textMuted}
                />
                {tab.key === 'account' && hasUnread && (
                  <View style={styles.badge} testID="account-unread-badge" />
                )}
              </View>
              <Text style={[styles.label, isActive && styles.labelActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: spacing['2xl'],
    right: spacing['2xl'],
    alignItems: 'center',
    zIndex: 100,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    ...shadows.lg,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
    gap: spacing.xxs,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleActive: {
    backgroundColor: colors.primaryMuted,
  },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 14,
  },
  labelActive: {
    fontFamily: fontFamily.bold,
    color: colors.textPrimary,
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.error,
  },
});
```

- [ ] **Step 6: Decouple `ProfileReturnTo` and add `services`**

In `src/lib/profileUtils.ts`, replace the top of the file (imports + type + `RETURN_HREF` + `PARENT_TAB_SEGMENTS`) so it no longer imports `BottomNavTab`:

```ts
/**
 * Where a pushed-over screen (rewards, refer, support…) returns to.
 * Keys are historical route names, NOT tab keys — 'bookings' is the
 * Activity tab's route, 'mother-profile' the Account tab's.
 */
export type ProfileReturnTo =
  | 'home'
  | 'services'
  | 'bookings'
  | 'community'
  | 'messages'
  | 'customer-support'
  | 'events-meetups'
  | 'mother-profile';

const RETURN_HREF: Record<ProfileReturnTo, string> = {
  home: '/(parent)/home',
  services: '/(parent)/services',
  bookings: '/(parent)/bookings',
  community: '/(parent)/community',
  messages: '/(parent)/messages',
  'customer-support': '/(parent)/customer-support',
  'events-meetups': '/(parent)/events-meetups',
  'mother-profile': '/(parent)/mother-profile',
};

export function getProfileReturnHref(returnTo?: string): string {
  if (returnTo && returnTo in RETURN_HREF) {
    return RETURN_HREF[returnTo as ProfileReturnTo];
  }
  return RETURN_HREF.home;
}

export const PARENT_TAB_SEGMENTS = ['home', 'services', 'bookings', 'community', 'messages'] as const;

export function getReturnToFromSegments(segments: string[]): ProfileReturnTo {
  const tab = segments.find((s): s is (typeof PARENT_TAB_SEGMENTS)[number] =>
    (PARENT_TAB_SEGMENTS as readonly string[]).includes(s),
  );
  if (tab) return tab;

  if (segments.includes('customer-support')) return 'customer-support';
  if (segments.includes('events-meetups')) return 'events-meetups';

  return 'home';
}
```

- [ ] **Step 7: Remap `activeTab` on the nine screens**

One-line changes (also delete the now-invalid `messagesBadge` prop in MessagesScreen — the badge lives inside BottomNav now):

| File | Old | New |
|---|---|---|
| `HomeScreen.tsx:118` | `<BottomNav activeTab="home" />` | unchanged |
| `BookingHistoryScreen.tsx:163` | `activeTab="bookings"` | `activeTab="activity"` |
| `CareActivityFeedScreen.tsx:135` | `activeTab="bookings"` | `activeTab="activity"` |
| `CommunityScreen.tsx:169` | `activeTab="community"` | `activeTab="services"` |
| `CommunityFeedScreen.tsx:225` | `activeTab="community"` | `activeTab="services"` |
| `EventsMeetupsScreen.tsx:178` | `activeTab="community"` | `activeTab="services"` |
| `MarketplaceScreen.tsx:174` | `activeTab="home"` | `activeTab="services"` |
| `MessagesScreen.tsx:151` | `activeTab="messages" messagesBadge={unreadData?.unreadCount}` | `activeTab="account"` |
| `NotificationsScreen.tsx:220` | `activeTab="home"` | unchanged |

In `MessagesScreen.tsx`, keep the `useUnreadMessageCount()` usage if it is used elsewhere in the screen; if `unreadData` was only feeding the badge prop, remove the variable (check compile).

- [ ] **Step 8: Swap `BOTTOM_NAV_HEIGHT` → `FLOATING_NAV_CLEARANCE` in parent style files**

In each of these files, change the `@mobile/theme` import and every usage (padding/bottom offsets only — these are all parent screens scrolling under the floating bar):

- `community-screen.styles.ts:10,58`
- `marketplace-screen.styles.ts:10,25`
- `community-feed-screen.styles.ts:10,119,300`
- `marketplace-item-detail-screen.styles.ts:10,25`
- `booking-history-screen.styles.ts:12,28`
- `events-meetups-screen.styles.ts:9,81,286`
- `notifications-screen.styles.ts:11,90`
- `care-activity-feed-screen.styles.ts:12,27`

Mechanical rule: swap the constant name in the import and at every usage, keeping the original `+ …` term unchanged. Example (`community-screen.styles.ts`): `BOTTOM_NAV_HEIGHT,` → `FLOATING_NAV_CLEARANCE,` in the import; `paddingBottom: BOTTOM_NAV_HEIGHT + spacing['3xl'],` → `paddingBottom: FLOATING_NAV_CLEARANCE + spacing['3xl'],`. Same for the FAB-style `bottom:` offsets at `community-feed-screen.styles.ts:300` and `events-meetups-screen.styles.ts:286`.

- [ ] **Step 9: Run the new test + typecheck**

Run: `npx jest src/components/__tests__/BottomNav.test.tsx`
Expected: PASS (5 tests).
Run: `npx tsc --noEmit`
Expected: clean (this catches any missed `activeTab`/`messagesBadge`/constant reference).

- [ ] **Step 10: Update the tab title in the layout**

In `app/(parent)/_layout.tsx:18`, change `<Tabs.Screen name="bookings" options={{ title: 'Bookings' }} />` to `options={{ title: 'Activity' }}`.

- [ ] **Step 11: Commit**

```bash
git add -A apps/mobile
git commit -m "feat(mobile): Uber-style floating pill tab bar with Home/Services/Activity/Account"
```

---

### Task 2: Services hub screen

**Files:**
- Create: `src/screens/parent/ServicesHubScreen.tsx`
- Create: `src/screens/parent/styles/services-hub-screen.styles.ts`
- Create: `app/(parent)/services.tsx`
- Modify: `app/(parent)/_layout.tsx` (add the route)
- Test: `src/screens/parent/__tests__/ServicesHubScreen.test.tsx` (new)

**Interfaces:**
- Consumes: `BottomNav` with `activeTab="services"` (Task 1); `useGuestGate().gate`; `useIdGate().gate`; `ProfileReturnTo` `'services'` key (Task 1).
- Produces: route `/(parent)/services` (the Services tab target). Default-exported `ServicesHubScreen` component, no props.

- [ ] **Step 1: Write the failing test**

Create `src/screens/parent/__tests__/ServicesHubScreen.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@mobile/lib/api', () => ({
  api: { get: jest.fn().mockResolvedValue({ data: { data: { unreadCount: 0 }, error: null } }) },
  unwrap: jest.fn((promise: Promise<{ data: { data: unknown; error: string | null } }>) =>
    promise.then((res) => res.data.data),
  ),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

// ID gate passes through by default (verified mother).
jest.mock('@mobile/hooks/useIdGate', () => ({
  useIdGate: () => ({ needsId: false, gate: (fn: () => void) => fn }),
}));

// No SafeAreaProvider in jest — stub the insets hook the floating bar uses.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import ServicesHubScreen from '@mobile/screens/parent/ServicesHubScreen';
import { useGuestStore } from '@mobile/store/guestStore';
import { useRegisterPromptStore } from '@mobile/store/registerPromptStore';

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ServicesHubScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useGuestStore.setState({ isGuest: false });
  useRegisterPromptStore.setState({ message: null });
});

describe('ServicesHubScreen', () => {
  it('shows the hero and the four service tiles', () => {
    const { getByText } = renderScreen();
    getByText('Book a Nanny');
    getByText('Community');
    getByText('Marketplace');
    getByText('Events & Meetups');
    getByText('Care Points');
  });

  it('navigates to each destination', () => {
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Book a Nanny'));
    expect(mockPush).toHaveBeenCalledWith('/(parent)/book/booking-date-picker');

    fireEvent.press(getByText('Community'));
    expect(mockPush).toHaveBeenCalledWith('/(parent)/community');

    fireEvent.press(getByText('Marketplace'));
    expect(mockPush).toHaveBeenCalledWith('/(parent)/marketplace');

    fireEvent.press(getByText('Events & Meetups'));
    expect(mockPush).toHaveBeenCalledWith('/(parent)/events-meetups');

    fireEvent.press(getByText('Care Points'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(parent)/rewards',
      params: { returnTo: 'services' },
    });
  });

  it('gates booking and Care Points for guests but leaves browsing open', () => {
    useGuestStore.setState({ isGuest: true });
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Book a Nanny'));
    expect(mockPush).not.toHaveBeenCalled();
    expect(useRegisterPromptStore.getState().message).toBe(
      'Create your free account to book trusted, vetted nannies.',
    );

    useRegisterPromptStore.setState({ message: null });
    fireEvent.press(getByText('Care Points'));
    expect(mockPush).not.toHaveBeenCalled();
    expect(useRegisterPromptStore.getState().message).toBe(
      'Create your free account to earn Care Points.',
    );

    fireEvent.press(getByText('Community'));
    expect(mockPush).toHaveBeenCalledWith('/(parent)/community');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/screens/parent/__tests__/ServicesHubScreen.test.tsx`
Expected: FAIL — cannot resolve `@mobile/screens/parent/ServicesHubScreen`.

- [ ] **Step 3: Create the style file**

Create `src/screens/parent/styles/services-hub-screen.styles.ts`:

```ts
import { StyleSheet } from 'react-native';

import {
  colors,
  typeScale,
  spacing,
  screenPadding,
  borderRadius,
  shadows,
  STATUS_BAR_HEIGHT,
  FLOATING_NAV_CLEARANCE,
} from '@mobile/theme';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: screenPadding,
    paddingTop: STATUS_BAR_HEIGHT + spacing.xl,
    paddingBottom: FLOATING_NAV_CLEARANCE + spacing.lg,
    gap: spacing.lg,
  },

  // Uber-style big screen title
  screenTitle: {
    ...typeScale.displayMd,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },

  // Hero tile: Book a Nanny
  heroTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.primaryMuted,
    borderRadius: borderRadius['2xl'],
    padding: spacing.xl,
    ...shadows.sm,
  },
  heroTextWrap: {
    flex: 1,
  },
  heroTitle: {
    ...typeScale.headingMd,
    color: colors.textPrimary,
  },
  heroSubtitle: {
    ...typeScale.bodySm,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },

  // 2-column tile grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
  },
  tile: {
    flexBasis: '45%',
    flexGrow: 1,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    gap: spacing.md,
    minHeight: 104,
  },
  tilePressed: {
    opacity: 0.7,
  },
  tileLabel: {
    ...typeScale.labelMd,
    color: colors.textPrimary,
  },
});
```

- [ ] **Step 4: Create the screen**

Create `src/screens/parent/ServicesHubScreen.tsx`:

```tsx
import React from 'react';
import { View, Text, ScrollView, Pressable, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import BottomNav from '@mobile/components/BottomNav';
import { IconCircle } from '@mobile/components/ui';
import { useGuestGate } from '@mobile/hooks/useGuestGate';
import { useIdGate } from '@mobile/hooks/useIdGate';
import { colors } from '@mobile/theme';
import { styles } from './styles/services-hub-screen.styles';

// Uber-style services hub: one hero action plus a grid of everything else
// the app offers. Screen-specific tile config stays local (see CLAUDE.md).
const TILES: {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}[] = [
  { key: 'community', label: 'Community', icon: 'people-outline' },
  { key: 'marketplace', label: 'Marketplace', icon: 'storefront-outline' },
  { key: 'events', label: 'Events & Meetups', icon: 'calendar-outline' },
  { key: 'rewards', label: 'Care Points', icon: 'gift-outline' },
];

export default function ServicesHubScreen() {
  const router = useRouter();
  const { gate } = useGuestGate();
  const { gate: idGate } = useIdGate();

  const openBooking = gate(
    idGate(() => router.push('/(parent)/book/booking-date-picker')),
    'Create your free account to book trusted, vetted nannies.',
  );

  const openTile = (key: string) => {
    switch (key) {
      case 'community':
        router.push('/(parent)/community');
        break;
      case 'marketplace':
        router.push('/(parent)/marketplace');
        break;
      case 'events':
        router.push('/(parent)/events-meetups');
        break;
      case 'rewards':
        router.push({
          pathname: '/(parent)/rewards',
          params: { returnTo: 'services' },
        } as never);
        break;
      default:
        break;
    }
  };

  const tileHandler = (key: string) =>
    key === 'rewards'
      ? gate(() => openTile(key), 'Create your free account to earn Care Points.')
      : () => openTile(key);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor={colors.transparent} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.screenTitle}>Services</Text>

        <Pressable
          style={({ pressed }) => [styles.heroTile, pressed && styles.tilePressed]}
          onPress={openBooking}
        >
          <IconCircle icon="add" size="lg" backgroundColor={colors.primary} iconColor={colors.white} />
          <View style={styles.heroTextWrap}>
            <Text style={styles.heroTitle}>Book a Nanny</Text>
            <Text style={styles.heroSubtitle}>One request reaches every available nanny</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.primaryDark} />
        </Pressable>

        <View style={styles.grid}>
          {TILES.map((tile) => (
            <Pressable
              key={tile.key}
              style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
              onPress={tileHandler(tile.key)}
            >
              <Ionicons name={tile.icon} size={24} color={colors.textPrimary} />
              <Text style={styles.tileLabel}>{tile.label}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <BottomNav activeTab="services" />
    </View>
  );
}
```

- [ ] **Step 5: Create the route and register it**

Create `app/(parent)/services.tsx`:

```tsx
export { default } from '@mobile/screens/parent/ServicesHubScreen';
```

In `app/(parent)/_layout.tsx`, add after the `home` entry (line 15):

```tsx
        <Tabs.Screen name="services" options={{ title: 'Services' }} />
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest src/screens/parent/__tests__/ServicesHubScreen.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add -A apps/mobile
git commit -m "feat(mobile): Services hub tab screen"
```

---

### Task 3: Activity restyle of the bookings screen

**Files:**
- Modify: `src/screens/parent/BookingHistoryScreen.tsx`
- Modify: `src/screens/parent/styles/booking-history-screen.styles.ts`

**Interfaces:**
- Consumes: `BottomNav activeTab="activity"` (set in Task 1).
- Produces: no API change — visual only. `ParentTabHeader` is removed from this screen (Uber's Activity page has just the big title).

- [ ] **Step 1: Swap the header for a big title**

In `src/screens/parent/BookingHistoryScreen.tsx`:

1. Remove the import `import ParentTabHeader from '@mobile/components/ParentTabHeader';` and the `<ParentTabHeader />` element near the bottom of the JSX (line ~161).
2. Change the theme import `import { colors, HEADER_HEIGHT } from '@mobile/theme';` to `import { colors, STATUS_BAR_HEIGHT } from '@mobile/theme';`
3. In the `RefreshControl`, change `progressViewOffset={HEADER_HEIGHT}` to `progressViewOffset={STATUS_BAR_HEIGHT}`.
4. Add the title as the first child inside the `ScrollView` (before `<OngoingBookingBanner …>`):

```tsx
        <Text style={styles.screenTitle}>Activity</Text>
```

- [ ] **Step 2: Update the styles**

In `src/screens/parent/styles/booking-history-screen.styles.ts`:

1. In the theme import list, remove `PARENT_TAB_CONTENT_TOP,` and add `STATUS_BAR_HEIGHT,` (`typeScale` is already imported — leave it).
2. Change `scrollContent`:

```ts
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: STATUS_BAR_HEIGHT + spacing.xl,
    paddingBottom: FLOATING_NAV_CLEARANCE + screenPadding,
  },
```

(`FLOATING_NAV_CLEARANCE` was already swapped in here by Task 1 Step 8.)

3. Add below `scrollContent`:

```ts
  // Uber-style big screen title
  screenTitle: {
    ...typeScale.displayMd,
    color: colors.textPrimary,
    marginBottom: spacing.xl,
  },
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: clean.
Run: `pnpm test` (mobile package)
Expected: all suites pass (no test covers this screen directly; the suite guards against import breakage).

- [ ] **Step 4: Commit**

```bash
git add -A apps/mobile
git commit -m "feat(mobile): restyle bookings screen as Uber-style Activity tab"
```

---

### Task 4: Uber-style Account screen

**Files:**
- Modify: `src/screens/parent/MotherProfileWalletScreen.tsx` (full rewrite below)
- Modify: `src/screens/parent/styles/mother-profile-wallet-screen.styles.ts` (full rewrite below)
- Modify: `src/components/ParentTabHeader.tsx` (drop `returnTo` param when opening the profile)
- Modify: `src/mocks/profile.ts` + `src/mocks/index.ts` (remove `SETTINGS_ITEMS`)
- Test: `src/screens/parent/__tests__/AccountScreen.test.tsx` (new)

**Interfaces:**
- Consumes: `useUserProfileStore` (`profile: UserResponse | null` — fields `firstName`, `lastName`, `avatarUrl`, `idVerificationStatus`, `createdAt`); `useUnreadMessageCount(enabled)` (Task 1); `useSignOut()` from `@mobile/hooks/useAuth` (`.mutate(undefined, { onSuccess })`, `.isPending`); `Avatar`, `IconCircle` from `@mobile/components/ui`; `getProfileReturnHref` keys `'mother-profile'`.
- Produces: the Account tab screen (still default-exported `MotherProfileWalletScreen` at the same path — routes `mother-profile.tsx` and `profile.tsx` keep working). Pushes child screens with `returnTo: 'mother-profile'` so their back buttons return to this tab. `SettingsItem` type stays in `types/profile.ts` (unused elsewhere is fine to leave; do NOT delete the type).

- [ ] **Step 1: Write the failing test**

Create `src/screens/parent/__tests__/AccountScreen.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { UserResponse } from '@nanny-app/shared';

jest.mock('@mobile/lib/api', () => ({
  api: { get: jest.fn().mockResolvedValue({ data: { data: { unreadCount: 2 }, error: null } }) },
  unwrap: jest.fn((promise: Promise<{ data: { data: unknown; error: string | null } }>) =>
    promise.then((res) => res.data.data),
  ),
}));

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

const mockSignOutMutate = jest.fn();
jest.mock('@mobile/hooks/useAuth', () => ({
  useSignOut: () => ({ mutate: mockSignOutMutate, isPending: false }),
}));

// No SafeAreaProvider in jest — stub the insets hook the floating bar uses.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import MotherProfileWalletScreen from '@mobile/screens/parent/MotherProfileWalletScreen';
import { useUserProfileStore } from '@mobile/store/userProfileStore';

const PROFILE = {
  id: 1,
  firebaseUid: 'uid',
  email: 'mina@example.com',
  phone: null,
  firstName: 'Mina',
  lastName: 'Roger',
  dateOfBirth: null,
  avatarUrl: null,
  role: 'MOTHER',
  isEmailVerified: true,
  isPhoneVerified: false,
  idVerificationStatus: 'APPROVED',
  idDocumentType: null,
  idRejectionReason: null,
  address: null,
  latitude: null,
  longitude: null,
  createdAt: '2026-01-15T00:00:00.000Z',
} as UserResponse;

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MotherProfileWalletScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useUserProfileStore.setState({ profile: PROFILE });
});

describe('Account screen', () => {
  it('shows the big name header and verified pill', () => {
    const { getByText } = renderScreen();
    getByText('Mina Roger');
    getByText('Verified');
  });

  it('shows Member since year when not verified', () => {
    useUserProfileStore.setState({
      profile: { ...PROFILE, idVerificationStatus: 'PENDING_ID' },
    });
    const { getByText } = renderScreen();
    getByText('Member since 2026');
  });

  it('routes the quick tiles', () => {
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Help'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(parent)/customer-support',
      params: { returnTo: 'mother-profile' },
    });

    fireEvent.press(getByText('Wallet'));
    expect(mockPush).toHaveBeenCalledWith('/(parent)/payment-methods');

    fireEvent.press(getByText('Inbox'));
    expect(mockPush).toHaveBeenCalledWith('/(parent)/messages');

    fireEvent.press(getByText('Notifications'));
    expect(mockPush).toHaveBeenCalledWith('/(parent)/notifications');
  });

  it('routes the promo cards with returnTo mother-profile', () => {
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Care Points'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(parent)/rewards',
      params: { returnTo: 'mother-profile' },
    });

    fireEvent.press(getByText('Refer a friend'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(parent)/refer-a-friend',
      params: { returnTo: 'mother-profile' },
    });
  });

  it('signs out from the list section', () => {
    const { getByText } = renderScreen();
    fireEvent.press(getByText('Sign out'));
    expect(mockSignOutMutate).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/screens/parent/__tests__/AccountScreen.test.tsx`
Expected: FAIL — e.g. `getByText('Verified')` / `getByText('Help')` not found (old layout).

- [ ] **Step 3: Rewrite the style file**

Replace the entire contents of `src/screens/parent/styles/mother-profile-wallet-screen.styles.ts` with:

```ts
import { StyleSheet } from 'react-native';

import {
  colors,
  typeScale,
  fontFamily,
  spacing,
  screenPadding,
  borderRadius,
  shadows,
  STATUS_BAR_HEIGHT,
  FLOATING_NAV_CLEARANCE,
} from '@mobile/theme';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: screenPadding,
    paddingTop: STATUS_BAR_HEIGHT + spacing.xl,
    paddingBottom: FLOATING_NAV_CLEARANCE + spacing.lg,
    gap: spacing.lg,
  },

  // Name header (Uber-style: big bold name left, avatar right)
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  name: {
    ...typeScale.displayLg,
    color: colors.textPrimary,
    flex: 1,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  statusPillText: {
    ...typeScale.labelSm,
    color: colors.textPrimary,
  },

  // 2x2 quick tiles
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  tile: {
    flexBasis: '45%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    minHeight: 56,
  },
  tilePressed: {
    opacity: 0.7,
  },
  tileLabel: {
    ...typeScale.labelMd,
    color: colors.textPrimary,
  },
  tileIconWrap: {
    position: 'relative',
  },
  tileBadge: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: 8,
    height: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.error,
  },

  // Promo cards (title + subtitle left, icon circle right)
  promoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    ...shadows.sm,
  },
  promoTextWrap: {
    flex: 1,
  },
  promoTitle: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },
  promoSubtitle: {
    ...typeScale.bodySm,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },

  // List section
  listSection: {
    marginTop: spacing.sm,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.lg,
  },
  listItemLabel: {
    ...typeScale.labelLg,
    color: colors.textPrimary,
    flex: 1,
  },
  listItemDestructive: {
    color: colors.errorDark,
  },
  listDivider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
  },
  signOutPendingLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.textMuted,
  },
});
```

- [ ] **Step 4: Rewrite the screen**

Replace the entire contents of `src/screens/parent/MotherProfileWalletScreen.tsx` with:

```tsx
import React from 'react';
import { View, Text, ScrollView, Pressable, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import BottomNav from '@mobile/components/BottomNav';
import { Avatar, IconCircle } from '@mobile/components/ui';
import { useSignOut } from '@mobile/hooks/useAuth';
import { useGuestGate } from '@mobile/hooks/useGuestGate';
import { useUnreadMessageCount } from '@mobile/hooks/useMessaging';
import { useUserProfileStore } from '@mobile/store/userProfileStore';
import { colors } from '@mobile/theme';
import { styles } from './styles/mother-profile-wallet-screen.styles';

// Uber-style Account tab: name header, 2x2 quick tiles, promo cards, list.
// Screen-specific config stays local (see CLAUDE.md).
const QUICK_TILES: {
  key: 'help' | 'wallet' | 'inbox' | 'notifications';
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}[] = [
  { key: 'help', label: 'Help', icon: 'help-buoy-outline' },
  { key: 'wallet', label: 'Wallet', icon: 'wallet-outline' },
  { key: 'inbox', label: 'Inbox', icon: 'mail-outline' },
  { key: 'notifications', label: 'Notifications', icon: 'notifications-outline' },
];

export default function MotherProfileWalletScreen() {
  const router = useRouter();
  const profile = useUserProfileStore((s) => s.profile);
  const signOut = useSignOut();
  const { isGuest } = useGuestGate();
  const { data: unreadData } = useUnreadMessageCount(!isGuest);
  const hasUnread = (unreadData?.unreadCount ?? 0) > 0;

  const displayName = profile
    ? `${profile.firstName} ${profile.lastName}`.trim()
    : '';
  const isVerified = profile?.idVerificationStatus === 'APPROVED';
  const memberYear = profile ? new Date(profile.createdAt).getFullYear() : null;

  const handleTilePress = (key: (typeof QUICK_TILES)[number]['key']) => {
    switch (key) {
      case 'help':
        router.push({
          pathname: '/(parent)/customer-support',
          params: { returnTo: 'mother-profile' },
        } as never);
        break;
      case 'wallet':
        router.push('/(parent)/payment-methods' as never);
        break;
      case 'inbox':
        router.push('/(parent)/messages' as never);
        break;
      case 'notifications':
        router.push('/(parent)/notifications' as never);
        break;
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor={colors.transparent} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Name header */}
        <View style={styles.headerRow}>
          <Text style={styles.name} numberOfLines={1}>
            {displayName}
          </Text>
          <Avatar
            uri={profile?.avatarUrl ?? undefined}
            size="xl"
            fallbackInitial={profile?.firstName?.[0]}
          />
        </View>
        <View style={styles.statusPill}>
          {isVerified ? (
            <>
              <Ionicons name="shield-checkmark" size={12} color={colors.primaryDark} />
              <Text style={styles.statusPillText}>Verified</Text>
            </>
          ) : (
            <Text style={styles.statusPillText}>
              {memberYear ? `Member since ${memberYear}` : 'Member'}
            </Text>
          )}
        </View>

        {/* 2x2 quick tiles */}
        <View style={styles.tileGrid}>
          {QUICK_TILES.map((tile) => (
            <Pressable
              key={tile.key}
              style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
              onPress={() => handleTilePress(tile.key)}
            >
              <View style={styles.tileIconWrap}>
                <Ionicons name={tile.icon} size={22} color={colors.textPrimary} />
                {tile.key === 'inbox' && hasUnread && <View style={styles.tileBadge} />}
              </View>
              <Text style={styles.tileLabel}>{tile.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Promo cards */}
        <Pressable
          style={({ pressed }) => [styles.promoCard, pressed && styles.tilePressed]}
          onPress={() =>
            router.push({
              pathname: '/(parent)/rewards',
              params: { returnTo: 'mother-profile' },
            } as never)
          }
        >
          <View style={styles.promoTextWrap}>
            <Text style={styles.promoTitle}>Care Points</Text>
            <Text style={styles.promoSubtitle}>Earn rewards on every booking</Text>
          </View>
          <IconCircle
            icon="gift-outline"
            size="lg"
            backgroundColor={colors.tintYellow}
            iconColor={colors.tintAmber}
          />
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.promoCard, pressed && styles.tilePressed]}
          onPress={() =>
            router.push({
              pathname: '/(parent)/refer-a-friend',
              params: { returnTo: 'mother-profile' },
            } as never)
          }
        >
          <View style={styles.promoTextWrap}>
            <Text style={styles.promoTitle}>Refer a friend</Text>
            <Text style={styles.promoSubtitle}>You each get a discount</Text>
          </View>
          <IconCircle icon="people-outline" size="lg" />
        </Pressable>

        {/* List section */}
        <View style={styles.listSection}>
          <Pressable
            style={styles.listItem}
            onPress={() =>
              router.push({
                pathname: '/(parent)/account-details',
                params: { returnTo: 'mother-profile' },
              } as never)
            }
          >
            <Ionicons name="person-circle-outline" size={22} color={colors.textPrimary} />
            <Text style={styles.listItemLabel}>Account details</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </Pressable>

          <View style={styles.listDivider} />

          <Pressable
            style={styles.listItem}
            disabled={signOut.isPending}
            onPress={() =>
              signOut.mutate(undefined, {
                onSuccess: () => router.replace('/'),
              })
            }
          >
            <Ionicons name="log-out-outline" size={22} color={colors.errorDark} />
            <Text style={[styles.listItemLabel, styles.listItemDestructive]}>
              {signOut.isPending ? 'Signing out…' : 'Sign out'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      <BottomNav activeTab="account" />
    </View>
  );
}
```

- [ ] **Step 5: Simplify `ParentTabHeader` profile push**

In `src/components/ParentTabHeader.tsx`, the Account screen no longer reads `returnTo`. Replace:

```tsx
  const openProfile = () => {
    router.push({
      pathname: '/(parent)/mother-profile',
      params: { returnTo: getReturnToFromSegments(segments) },
    } as never);
  };
```

with:

```tsx
  const openProfile = () => {
    router.push('/(parent)/mother-profile' as never);
  };
```

and remove the now-unused imports `useSegments` (keep `useRouter`) and `getReturnToFromSegments`, plus the `const segments = useSegments();` line. (If `getReturnToFromSegments` then has no remaining importers anywhere — check with grep — leave the function in `profileUtils.ts`; other screens still pass literal `returnTo` strings through `getProfileReturnHref`.)

- [ ] **Step 6: Remove `SETTINGS_ITEMS` from mocks**

- In `src/mocks/profile.ts`: delete the `SETTINGS_ITEMS` export (lines 14–20) and drop `SettingsItem` from the type import on line 1.
- In `src/mocks/index.ts:16`: change `export { MOCK_PROFILE, SETTINGS_ITEMS } from './profile';` to `export { MOCK_PROFILE } from './profile';`
- Do NOT remove the `SettingsItem` type from `src/types/profile.ts` (types stay centralized even if temporarily unused — removing it would also break the `types/index.ts` barrel line).

Verify nothing else references it: `grep -rn "SETTINGS_ITEMS" src/` → expect no matches.

- [ ] **Step 7: Run tests + typecheck**

Run: `npx jest src/screens/parent/__tests__/AccountScreen.test.tsx`
Expected: PASS (5 tests).
Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add -A apps/mobile
git commit -m "feat(mobile): Uber-style Account tab screen"
```

---

### Task 5: Full verification + visual validation

**Files:** none new (fixes only if verification finds problems).

- [ ] **Step 1: Run the full mobile test suite**

Run (repo root): `pnpm test --filter=@nanny-app/mobile` — or `cd apps/mobile && pnpm test`.
Expected: all suites pass. Fix any breakage caused by the nav changes (most likely: tests that mock or render screens embedding `BottomNav`).

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && pnpm lint` (from `apps/mobile`, if a lint script exists — check `package.json`; otherwise skip lint).
Expected: clean.

- [ ] **Step 3: Visual validation**

Follow the Visual Validation Workflow in `apps/mobile/CLAUDE.md` (build → serve on 3100 → Playwright MCP screenshot at 390×844 → teardown) for each of:

1. `src/screens/parent/ServicesHubScreen.tsx`
2. `src/screens/parent/MotherProfileWalletScreen.tsx`
3. `src/screens/parent/BookingHistoryScreen.tsx`
4. `src/screens/parent/HomeScreen.tsx` (confirms the floating pill bar)

Check each against the aesthetic bar: floating pill detached with soft shadow, active tab in a sage-tinted circle, big bold Manrope titles, warm surfaces, nothing trapped under the bar. Fix and re-shoot as needed.

- [ ] **Step 4: Final commit**

```bash
git add -A apps/mobile
git commit -m "chore(mobile): verification fixes for Uber-style nav redesign"
```

(Skip the commit if Steps 1–3 required no changes.)
