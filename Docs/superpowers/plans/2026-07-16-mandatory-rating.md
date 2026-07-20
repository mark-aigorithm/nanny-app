# Mandatory Nanny Rating After Booking Completion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a booking completes, force the parent to rate the nanny via a non-dismissible bottom sheet that appears on app open/foreground and on live completion, and reappears until a rating is submitted.

**Architecture:** Copy the existing global prompt pattern (`NannyShiftPromptHost` + `nannyShiftPromptStore`, and `RegisterPromptModal` mounted in a layout). A Zustand `ratingPromptStore` holds the booking currently being force-rated; a `usePendingRating` hook detects the most-recent unrated COMPLETED booking via the existing `GET /bookings` endpoint and pushes it into the store; a `RatingPromptHost` mounted in `app/(parent)/_layout.tsx` renders a non-dismissible `Modal` bottom sheet (`RatingPromptSheet`) that submits through the existing `useCreateReview` hook. A shared `StarRatingInput` component is extracted from `ReviewScreen` so both surfaces stay identical.

**Tech Stack:** Expo Router, React Native, Zustand, TanStack React Query, `@nanny-app/shared` Zod types, Jest + jest-expo + React Native Testing Library.

## Global Constraints

- **Strict TypeScript, no `any`** — use `unknown` + guards or fix the type. Use `import type` for type-only imports.
- **Theme tokens only** — never hardcode hex colors, font family strings, or shadow properties. Use `colors.*`, `...typeScale.*` / `fontFamily.*`, `...shadows.*`, `spacing.*`, `borderRadius.*` from `@mobile/theme`. Canonical background is `colors.background` (`#fdfaf8`). If no token fits, pick the closest existing one — never invent a value.
- **Reuse-first UI** — compose from `@mobile/components/ui` (`Button`, `Avatar`, `TextInputField`) before building raw views.
- **Screen/component styles live in a dedicated file** — for screens, `screens/<area>/styles/<name>.styles.ts`. For shared components, a co-located `StyleSheet.create` block is consistent with existing components (`NannyShiftPromptModal.tsx`, `TimeSelectSheet.tsx`) — follow that.
- **Server state via React Query, UI state via Zustand** — no manual fetch/useEffect for data.
- **Audience gate** — this feature is for authenticated **MOTHER** users only. `Role` values are `'MOTHER' | 'NANNY'` from `@nanny-app/shared`. Read the role from `useUserProfileStore((s) => s.profile?.role)`.
- **Path aliases** — `@mobile/*` → `apps/mobile/src/*`, `@nanny-app/shared` for shared types.
- **Backend is unchanged.** `POST /nanny/bookings/:bookingId/review` already enforces `status === COMPLETED` (400 otherwise) and one-review-per-booking (409 `"You have already reviewed this booking."`).
- Run all commands from `apps/mobile/`. Tests: `pnpm test`. Typecheck: `pnpm typecheck`.

---

## File Structure

**Create:**
- `apps/mobile/src/components/ui/star-rating-input.tsx` — shared 1–5 star input (extracted from `ReviewScreen`).
- `apps/mobile/src/store/ratingPromptStore.ts` — Zustand store: the booking being force-rated + show/dismiss actions.
- `apps/mobile/src/hooks/usePendingRating.ts` — detection hook: finds the most-recent unrated COMPLETED booking and feeds the store.
- `apps/mobile/src/components/RatingPromptSheet.tsx` — the non-dismissible bottom sheet UI.
- `apps/mobile/src/components/RatingPromptHost.tsx` — mounts the hook + sheet; mounted in the parent layout.
- Test files (see each task).

**Modify:**
- `apps/mobile/src/components/ui/index.ts` — export `StarRatingInput`.
- `apps/mobile/src/screens/parent/ReviewScreen.tsx` — consume `StarRatingInput` instead of the inline star row.
- `apps/mobile/app/(parent)/_layout.tsx` — mount `<RatingPromptHost />` next to `<Tabs>`.
- `apps/mobile/src/hooks/usePushNotifications.ts` — on `booking_completed` foreground-receive, invalidate the pending-rating query; on tap, route to the rating prompt instead of `/(parent)/bookings`.

---

### Task 1: Extract `StarRatingInput` shared component

Pull the star row + label out of `ReviewScreen` into a reusable component so `ReviewScreen` and the new sheet render identical stars. Behaviour-preserving for `ReviewScreen`.

**Files:**
- Create: `apps/mobile/src/components/ui/star-rating-input.tsx`
- Modify: `apps/mobile/src/components/ui/index.ts`
- Modify: `apps/mobile/src/screens/parent/ReviewScreen.tsx:107-120` (replace inline stars section)
- Test: `apps/mobile/src/components/ui/__tests__/star-rating-input.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  interface StarRatingInputProps {
    rating: number;                 // 0 = none selected, 1–5 selected
    onChange: (rating: number) => void;
    showLabel?: boolean;            // default true — renders RATING_LABELS[rating]
  }
  export default function StarRatingInput(props: StarRatingInputProps): JSX.Element;
  export const RATING_LABELS: readonly string[]; // ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent']
  ```

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/components/ui/__tests__/star-rating-input.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import StarRatingInput, { RATING_LABELS } from '@mobile/components/ui/star-rating-input';

describe('StarRatingInput', () => {
  it('renders five star buttons', () => {
    const { getAllByRole } = render(<StarRatingInput rating={0} onChange={() => {}} />);
    expect(getAllByRole('button')).toHaveLength(5);
  });

  it('calls onChange with the tapped star value', () => {
    const onChange = jest.fn();
    const { getAllByRole } = render(<StarRatingInput rating={0} onChange={onChange} />);
    fireEvent.press(getAllByRole('button')[3]);
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('shows the label for the current rating when showLabel is set', () => {
    const { getByText } = render(<StarRatingInput rating={5} onChange={() => {}} showLabel />);
    expect(getByText(RATING_LABELS[5])).toBeTruthy();
  });

  it('hides the label when showLabel is false', () => {
    const { queryByText } = render(<StarRatingInput rating={5} onChange={() => {}} showLabel={false} />);
    expect(queryByText(RATING_LABELS[5])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test star-rating-input`
Expected: FAIL — cannot resolve `@mobile/components/ui/star-rating-input`.

- [ ] **Step 3: Create the component**

Create `apps/mobile/src/components/ui/star-rating-input.tsx`:

```tsx
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, typeScale, spacing } from '@mobile/theme';

export const RATING_LABELS = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'] as const;

interface StarRatingInputProps {
  rating: number;
  onChange: (rating: number) => void;
  showLabel?: boolean;
}

export default function StarRatingInput({ rating, onChange, showLabel = true }: StarRatingInputProps) {
  return (
    <View style={styles.section}>
      <View style={styles.row}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Pressable
            key={star}
            accessibilityRole="button"
            accessibilityLabel={`Rate ${star} star${star > 1 ? 's' : ''}`}
            style={styles.button}
            onPress={() => onChange(star)}
          >
            <Ionicons
              name={star <= rating ? 'star' : 'star-outline'}
              size={36}
              color={star <= rating ? colors.gold : colors.taupe}
            />
          </Pressable>
        ))}
      </View>
      {showLabel && rating > 0 ? <Text style={styles.label}>{RATING_LABELS[rating]}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { alignItems: 'center', gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  button: { padding: spacing.xs },
  label: { ...typeScale.labelMd, color: colors.primary },
});
```

- [ ] **Step 4: Export it from the ui barrel**

In `apps/mobile/src/components/ui/index.ts`, add after the `Divider` export line:

```ts
export { default as StarRatingInput, RATING_LABELS } from './star-rating-input';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test star-rating-input`
Expected: PASS (4 tests).

- [ ] **Step 6: Refactor `ReviewScreen` to use the shared component**

In `apps/mobile/src/screens/parent/ReviewScreen.tsx`:

Remove the local `RATING_LABELS` const (line 21) — it now comes from the shared component.

Add to the imports from `@mobile/components/ui` (create the import if absent):
```tsx
import { StarRatingInput } from '@mobile/components/ui';
```

Replace the stars section (lines 107-120, the `<View style={styles.starsSection}>…</View>` block) with:
```tsx
        <View style={styles.starsSection}>
          <StarRatingInput rating={rating} onChange={setRating} />
        </View>
```

Leave `styles.starsSection` in the style file (it still wraps the input); the now-unused `starsRow`, `starButton`, `ratingLabel` style keys may remain — do not chase unrelated cleanup.

- [ ] **Step 7: Typecheck and run the full mobile test suite**

Run: `pnpm typecheck && pnpm test`
Expected: typecheck clean; all tests pass. (No behaviour change to `ReviewScreen` — it renders the same stars.)

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/components/ui/star-rating-input.tsx \
        apps/mobile/src/components/ui/index.ts \
        apps/mobile/src/components/ui/__tests__/star-rating-input.test.tsx \
        apps/mobile/src/screens/parent/ReviewScreen.tsx
git commit -m "Extract shared StarRatingInput component"
```

---

### Task 2: `ratingPromptStore` (Zustand)

Holds the single booking currently being force-rated. A module-level flag prevents re-opening the sheet for the same booking within a session once dismissed by a successful submit, while still allowing re-detection on a fresh app launch.

**Files:**
- Create: `apps/mobile/src/store/ratingPromptStore.ts`
- Test: `apps/mobile/src/store/__tests__/ratingPromptStore.test.ts`

**Interfaces:**
- Consumes: `BookingResponse` from `@nanny-app/shared`.
- Produces:
  ```ts
  interface RatingPromptStore {
    booking: BookingResponse | null;
    showRatingPrompt: (booking: BookingResponse) => void;
    clearRatingPrompt: () => void;
  }
  export const useRatingPromptStore: UseBoundStore<StoreApi<RatingPromptStore>>;
  // Marks a booking as satisfied so detection won't reopen it this session:
  export function markRatingResolved(bookingId: string): void;
  export function isRatingResolved(bookingId: string): boolean;
  ```

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/store/__tests__/ratingPromptStore.test.ts`:

```ts
import type { BookingResponse } from '@nanny-app/shared';
import {
  useRatingPromptStore,
  markRatingResolved,
  isRatingResolved,
} from '@mobile/store/ratingPromptStore';

const booking = { id: 'bk_1' } as BookingResponse;

beforeEach(() => {
  useRatingPromptStore.setState({ booking: null });
});

describe('ratingPromptStore', () => {
  it('starts with no booking', () => {
    expect(useRatingPromptStore.getState().booking).toBeNull();
  });

  it('showRatingPrompt sets the booking', () => {
    useRatingPromptStore.getState().showRatingPrompt(booking);
    expect(useRatingPromptStore.getState().booking?.id).toBe('bk_1');
  });

  it('clearRatingPrompt resets the booking', () => {
    useRatingPromptStore.getState().showRatingPrompt(booking);
    useRatingPromptStore.getState().clearRatingPrompt();
    expect(useRatingPromptStore.getState().booking).toBeNull();
  });

  it('tracks resolved bookings', () => {
    expect(isRatingResolved('bk_2')).toBe(false);
    markRatingResolved('bk_2');
    expect(isRatingResolved('bk_2')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test ratingPromptStore`
Expected: FAIL — cannot resolve `@mobile/store/ratingPromptStore`.

- [ ] **Step 3: Create the store**

Create `apps/mobile/src/store/ratingPromptStore.ts`:

```ts
import { create } from 'zustand';
import type { BookingResponse } from '@nanny-app/shared';

interface RatingPromptStore {
  booking: BookingResponse | null;
  showRatingPrompt: (booking: BookingResponse) => void;
  clearRatingPrompt: () => void;
}

export const useRatingPromptStore = create<RatingPromptStore>((set) => ({
  booking: null,
  showRatingPrompt: (booking) => set({ booking }),
  clearRatingPrompt: () => set({ booking: null }),
}));

// Bookings the parent has already rated this session. Detection skips these so a
// just-submitted rating can't immediately reopen the sheet before queries settle.
// Cleared naturally on app relaunch (module reload).
const resolvedBookingIds = new Set<string>();

export function markRatingResolved(bookingId: string): void {
  resolvedBookingIds.add(bookingId);
}

export function isRatingResolved(bookingId: string): boolean {
  return resolvedBookingIds.has(bookingId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test ratingPromptStore`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/store/ratingPromptStore.ts \
        apps/mobile/src/store/__tests__/ratingPromptStore.test.ts
git commit -m "Add ratingPromptStore for mandatory rating prompt"
```

---

### Task 3: `usePendingRating` detection hook

Fetches the most-recent COMPLETED booking; if it is unrated and unresolved, pushes it into `ratingPromptStore`. Re-checks on foreground. Gated to authenticated MOTHER users. Exposes an imperative `openForBooking` used by the push tap handler.

**Files:**
- Create: `apps/mobile/src/hooks/usePendingRating.ts`
- Test: `apps/mobile/src/hooks/__tests__/usePendingRating.test.tsx`

**Interfaces:**
- Consumes:
  - `useRatingPromptStore`, `isRatingResolved` from `@mobile/store/ratingPromptStore` (Task 2).
  - `useAuthStore` (`s.user`), `useUserProfileStore` (`s.profile?.role`), `Role.MOTHER` from `@nanny-app/shared`.
  - `api`, `unwrap` from `@mobile/lib/api`; `BookingResponse` from `@nanny-app/shared`.
- Produces:
  ```ts
  export const PENDING_RATING_KEY: readonly ['pending-rating'];
  export function usePendingRating(): void;
  // Detection predicate, exported for testing and reuse by the push handler:
  export function pickPendingRating(bookings: BookingResponse[]): BookingResponse | null;
  ```
- Query key `['pending-rating']` is the invalidation target used by the push handler (Task 6).

- [ ] **Step 1: Write the failing test for the predicate**

Create `apps/mobile/src/hooks/__tests__/usePendingRating.test.tsx`:

```tsx
import type { BookingResponse } from '@nanny-app/shared';
import { pickPendingRating } from '@mobile/hooks/usePendingRating';
import { markRatingResolved } from '@mobile/store/ratingPromptStore';

function makeBooking(over: Partial<BookingResponse>): BookingResponse {
  return { id: 'bk', status: 'COMPLETED', myReview: null, ...over } as BookingResponse;
}

describe('pickPendingRating', () => {
  it('returns null for an empty list', () => {
    expect(pickPendingRating([])).toBeNull();
  });

  it('returns the completed booking when it has no review', () => {
    const b = makeBooking({ id: 'bk_1' });
    expect(pickPendingRating([b])?.id).toBe('bk_1');
  });

  it('returns null when the most recent completed booking is already reviewed', () => {
    const b = makeBooking({ id: 'bk_2', myReview: { id: 'r', rating: 5, comment: null, createdAt: 'now' } });
    expect(pickPendingRating([b])).toBeNull();
  });

  it('ignores bookings the user already resolved this session', () => {
    const b = makeBooking({ id: 'bk_3' });
    markRatingResolved('bk_3');
    expect(pickPendingRating([b])).toBeNull();
  });

  it('only considers the first (most recent) item', () => {
    const reviewed = makeBooking({ id: 'newest', myReview: { id: 'r', rating: 4, comment: null, createdAt: 'now' } });
    const unrated = makeBooking({ id: 'older' });
    // API returns newest-first; older unrated bookings must NOT force-prompt.
    expect(pickPendingRating([reviewed, unrated])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test usePendingRating`
Expected: FAIL — cannot resolve `@mobile/hooks/usePendingRating`.

- [ ] **Step 3: Create the hook**

Create `apps/mobile/src/hooks/usePendingRating.ts`:

```ts
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { BookingResponse } from '@nanny-app/shared';
import { Role } from '@nanny-app/shared';

import { api, unwrap } from '@mobile/lib/api';
import { useAuthStore } from '@mobile/store/authStore';
import { useUserProfileStore } from '@mobile/store/userProfileStore';
import {
  useRatingPromptStore,
  isRatingResolved,
} from '@mobile/store/ratingPromptStore';

export const PENDING_RATING_KEY = ['pending-rating'] as const;

/**
 * The single booking that should force a rating: the most-recently completed
 * booking, if it is unrated and not already resolved this session. Older unrated
 * bookings never force-prompt — they stay optionally rateable from history.
 */
export function pickPendingRating(bookings: BookingResponse[]): BookingResponse | null {
  const mostRecent = bookings[0];
  if (!mostRecent) return null;
  if (mostRecent.status !== 'COMPLETED') return null;
  if (mostRecent.myReview) return null;
  if (isRatingResolved(mostRecent.id)) return null;
  return mostRecent;
}

/**
 * Detects an unrated completed booking and drives the mandatory rating prompt.
 * Runs only for authenticated mothers. Re-checks when the app returns to the
 * foreground so a booking completed while backgrounded surfaces on next open.
 */
export function usePendingRating(): void {
  const firebaseUser = useAuthStore((s) => s.user);
  const role = useUserProfileStore((s) => s.profile?.role);
  const showRatingPrompt = useRatingPromptStore((s) => s.showRatingPrompt);
  const storeBooking = useRatingPromptStore((s) => s.booking);
  const queryClient = useQueryClient();

  const enabled = !!firebaseUser && role === Role.MOTHER;

  const { data } = useQuery<BookingResponse[]>({
    queryKey: PENDING_RATING_KEY,
    enabled,
    queryFn: () =>
      unwrap(
        api.get('/bookings', {
          params: { status: 'COMPLETED', sortBy: 'date', sortDir: 'desc', limit: 1 },
        }),
      ),
  });

  // Refetch on foreground so a completion that happened while backgrounded shows.
  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void queryClient.invalidateQueries({ queryKey: PENDING_RATING_KEY });
      }
    });
    return () => sub.remove();
  }, [enabled, queryClient]);

  // Feed the store whenever detection finds a pending rating and none is showing.
  useEffect(() => {
    if (!enabled || !data || storeBooking) return;
    const pending = pickPendingRating(data);
    if (pending) showRatingPrompt(pending);
  }, [enabled, data, storeBooking, showRatingPrompt]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test usePendingRating`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/hooks/usePendingRating.ts \
        apps/mobile/src/hooks/__tests__/usePendingRating.test.tsx
git commit -m "Add usePendingRating detection hook"
```

---

### Task 4: `RatingPromptSheet` non-dismissible bottom sheet

The forced-rating UI: nanny avatar + name, title, `StarRatingInput`, optional comment, submit button. Non-dismissible: no close button, backdrop press is a no-op, Android back (`onRequestClose`) is a no-op. Submits via `useCreateReview`; a 409 (already reviewed) is treated as success. On success it marks the booking resolved, invalidates queries, and clears the store.

**Files:**
- Create: `apps/mobile/src/components/RatingPromptSheet.tsx`
- Test: `apps/mobile/src/components/__tests__/RatingPromptSheet.test.tsx`

**Interfaces:**
- Consumes:
  - `useRatingPromptStore` (`booking`, `clearRatingPrompt`), `markRatingResolved` from Task 2.
  - `StarRatingInput` from `@mobile/components/ui` (Task 1).
  - `useCreateReview` from `@mobile/hooks/useNannies` — `useMutation<ReviewSummary, Error, CreateReviewRequest>`, `mutate(body, { onSuccess, onError })`, `.isPending`.
  - `PENDING_RATING_KEY` from `@mobile/hooks/usePendingRating` (Task 3) for invalidation.
  - `Button` from `@mobile/components/ui`; `NannySummary` shape lives on `booking.nanny` (`firstName`, `lastName`, `avatarUrl`).
- Produces: `export default function RatingPromptSheet(): JSX.Element | null;`

Note on the 409 path: `useCreateReview` calls `unwrap`, which converts the axios error into `new Error(getApiErrorMessage(err))`. For a 409 that message is the server text `"You have already reviewed this booking."`. Detect this in `onError` by matching that copy (case-insensitive substring `already reviewed`) and treat it as success (close + resolve) rather than showing an error.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/components/__tests__/RatingPromptSheet.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import type { BookingResponse } from '@nanny-app/shared';

const mutate = jest.fn();
jest.mock('@mobile/hooks/useNannies', () => ({
  useCreateReview: () => ({ mutate, isPending: false }),
}));

import RatingPromptSheet from '@mobile/components/RatingPromptSheet';
import { useRatingPromptStore } from '@mobile/store/ratingPromptStore';

const booking = {
  id: 'bk_1',
  status: 'COMPLETED',
  myReview: null,
  nanny: { nannyProfileId: 'np', firstName: 'Amina', lastName: 'K', avatarUrl: null, location: null },
} as unknown as BookingResponse;

beforeEach(() => {
  mutate.mockReset();
  useRatingPromptStore.setState({ booking: null });
});

describe('RatingPromptSheet', () => {
  it('renders nothing when no booking is pending', () => {
    const { toJSON } = render(<RatingPromptSheet />);
    expect(toJSON()).toBeNull();
  });

  it('shows the nanny name when a booking is pending', () => {
    useRatingPromptStore.setState({ booking });
    const { getByText } = render(<RatingPromptSheet />);
    expect(getByText(/Amina/)).toBeTruthy();
  });

  it('disables submit until a star is chosen, then submits the rating', () => {
    useRatingPromptStore.setState({ booking });
    const { getByText, getAllByLabelText } = render(<RatingPromptSheet />);

    fireEvent.press(getByText('Submit rating'));
    expect(mutate).not.toHaveBeenCalled();

    fireEvent.press(getAllByLabelText(/Rate 5 stars/)[0]);
    fireEvent.press(getByText('Submit rating'));
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ rating: 5 }),
      expect.any(Object),
    );
  });

  it('treats an "already reviewed" 409 as success and closes', async () => {
    useRatingPromptStore.setState({ booking });
    mutate.mockImplementation((_body, opts) =>
      opts.onError(new Error('You have already reviewed this booking.')),
    );
    const { getByText, getAllByLabelText } = render(<RatingPromptSheet />);
    fireEvent.press(getAllByLabelText(/Rate 4 stars/)[0]);
    fireEvent.press(getByText('Submit rating'));
    await waitFor(() => expect(useRatingPromptStore.getState().booking).toBeNull());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test RatingPromptSheet`
Expected: FAIL — cannot resolve `@mobile/components/RatingPromptSheet`.

- [ ] **Step 3: Create the component**

Create `apps/mobile/src/components/RatingPromptSheet.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { Avatar, Button, StarRatingInput } from '@mobile/components/ui';
import { useCreateReview } from '@mobile/hooks/useNannies';
import { PENDING_RATING_KEY } from '@mobile/hooks/usePendingRating';
import { getApiErrorMessage } from '@mobile/lib/api';
import {
  useRatingPromptStore,
  markRatingResolved,
} from '@mobile/store/ratingPromptStore';
import {
  colors,
  fontFamily,
  spacing,
  borderRadius,
  shadows,
  screenPadding,
  typeScale,
} from '@mobile/theme';

const MAX_CHARS = 500;

function isAlreadyReviewed(message: string): boolean {
  return message.toLowerCase().includes('already reviewed');
}

export default function RatingPromptSheet() {
  const booking = useRatingPromptStore((s) => s.booking);
  const clearRatingPrompt = useRatingPromptStore((s) => s.clearRatingPrompt);
  const queryClient = useQueryClient();
  const createReview = useCreateReview(booking?.id ?? '');

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Reset local state each time a new booking opens the sheet.
  useEffect(() => {
    setRating(0);
    setComment('');
    setError(null);
  }, [booking?.id]);

  if (!booking) return null;

  const nanny = booking.nanny;
  const nannyName = nanny ? `${nanny.firstName} ${nanny.lastName}` : 'your nanny';
  const canSubmit = rating > 0 && !createReview.isPending;

  const resolveAndClose = () => {
    markRatingResolved(booking.id);
    void queryClient.invalidateQueries({ queryKey: PENDING_RATING_KEY });
    clearRatingPrompt();
  };

  const handleSubmit = () => {
    if (rating < 1 || createReview.isPending) return;
    setError(null);
    createReview.mutate(
      { rating, ...(comment.trim() ? { comment: comment.trim() } : {}) },
      {
        onSuccess: () => resolveAndClose(),
        onError: (err) => {
          const message = getApiErrorMessage(err);
          if (isAlreadyReviewed(message)) {
            resolveAndClose();
            return;
          }
          setError(message);
        },
      },
    );
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={() => undefined}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.handle} />

            <Avatar uri={nanny?.avatarUrl ?? undefined} size="xl" fallbackInitial={nanny?.firstName?.[0]} />
            <Text style={styles.title}>How was your booking with {nannyName}?</Text>
            <Text style={styles.subtitle}>Rate your experience to continue.</Text>

            <StarRatingInput rating={rating} onChange={setRating} />

            <TextInput
              style={styles.input}
              placeholder="Add a comment (optional)…"
              placeholderTextColor={colors.textPlaceholder}
              value={comment}
              onChangeText={(t) => setComment(t.slice(0, MAX_CHARS))}
              multiline
              textAlignVertical="top"
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Button
              title="Submit rating"
              onPress={handleSubmit}
              disabled={!canSubmit}
              loading={createReview.isPending}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    maxHeight: '90%',
    ...shadows.lg,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: screenPadding,
    paddingTop: spacing.md,
    paddingBottom: spacing['3xl'],
    gap: spacing.lg,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: borderRadius.full,
    backgroundColor: colors.warmBorder,
    marginBottom: spacing.xs,
  },
  title: {
    ...typeScale.headingSm,
    fontFamily: fontFamily.bold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    minHeight: 96,
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.warmBorder,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typeScale.bodyMd,
    color: colors.textPrimary,
  },
  error: {
    ...typeScale.bodyMd,
    color: colors.error,
    textAlign: 'center',
  },
});
```

Note: verify each token used (`colors.overlay`, `colors.warmBorder`, `colors.textPlaceholder`, `colors.background`, `borderRadius.full`, `typeScale.headingSm`) exists in `@mobile/theme`. If any does not resolve, substitute the closest existing token (per Global Constraints) — do not invent a value.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test RatingPromptSheet`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/RatingPromptSheet.tsx \
        apps/mobile/src/components/__tests__/RatingPromptSheet.test.tsx
git commit -m "Add non-dismissible RatingPromptSheet"
```

---

### Task 5: `RatingPromptHost` + mount in parent layout

Wire detection to the sheet and mount both above every parent screen, mirroring `NannyShiftPromptHost`.

**Files:**
- Create: `apps/mobile/src/components/RatingPromptHost.tsx`
- Modify: `apps/mobile/app/(parent)/_layout.tsx`
- Test: `apps/mobile/src/components/__tests__/RatingPromptHost.test.tsx`

**Interfaces:**
- Consumes: `usePendingRating` (Task 3), `RatingPromptSheet` (Task 4).
- Produces: `export default function RatingPromptHost(): JSX.Element;`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/components/__tests__/RatingPromptHost.test.tsx`:

```tsx
import React from 'react';
import { render } from '@testing-library/react-native';

const usePendingRating = jest.fn();
jest.mock('@mobile/hooks/usePendingRating', () => ({
  usePendingRating: () => usePendingRating(),
  PENDING_RATING_KEY: ['pending-rating'],
}));
jest.mock('@mobile/components/RatingPromptSheet', () => {
  const { Text } = require('react-native');
  return { __esModule: true, default: () => <Text>sheet</Text> };
});

import RatingPromptHost from '@mobile/components/RatingPromptHost';

it('runs detection and renders the sheet', () => {
  const { getByText } = render(<RatingPromptHost />);
  expect(usePendingRating).toHaveBeenCalled();
  expect(getByText('sheet')).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test RatingPromptHost`
Expected: FAIL — cannot resolve `@mobile/components/RatingPromptHost`.

- [ ] **Step 3: Create the host**

Create `apps/mobile/src/components/RatingPromptHost.tsx`:

```tsx
import React from 'react';

import RatingPromptSheet from '@mobile/components/RatingPromptSheet';
import { usePendingRating } from '@mobile/hooks/usePendingRating';

/**
 * Mount once in the parent tab layout. Detects an unrated completed booking and
 * renders the mandatory rating sheet above all parent screens.
 */
export default function RatingPromptHost() {
  usePendingRating();
  return <RatingPromptSheet />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test RatingPromptHost`
Expected: PASS (1 test).

- [ ] **Step 5: Mount it in the parent layout**

In `apps/mobile/app/(parent)/_layout.tsx`, replace the file contents with (adds the host as a sibling of `<Tabs>`, matching the nanny layout pattern):

```tsx
import { Tabs } from 'expo-router';

import RatingPromptHost from '@mobile/components/RatingPromptHost';

export default function ParentLayout() {
  return (
    <>
      <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
        <Tabs.Screen name="home" options={{ title: 'Home' }} />
        <Tabs.Screen name="home-dashboard" options={{ headerShown: false }} />
        <Tabs.Screen name="search" options={{ title: 'Search' }} />
        <Tabs.Screen name="community" options={{ title: 'Community' }} />
        <Tabs.Screen name="messages" options={{ title: 'Messages' }} />
        <Tabs.Screen name="bookings" options={{ title: 'Bookings' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
        <Tabs.Screen name="notifications" options={{ title: 'Notifications' }} />
        <Tabs.Screen name="mother-profile" options={{ title: 'Profile' }} />
        <Tabs.Screen name="rewards" options={{ headerShown: false }} />
        <Tabs.Screen name="customer-support" options={{ title: 'Support' }} />
        <Tabs.Screen name="book" options={{ title: 'Book' }} />
        <Tabs.Screen name="chat" options={{ title: 'Chat' }} />
        <Tabs.Screen name="nanny" options={{ title: 'Nanny' }} />
        <Tabs.Screen name="marketplace" options={{ headerShown: false }} />
        <Tabs.Screen name="events-meetups" options={{ headerShown: false }} />
        <Tabs.Screen name="community-feed" options={{ headerShown: false }} />
        <Tabs.Screen name="booking-history" options={{ headerShown: false }} />
        <Tabs.Screen name="search-results" options={{ headerShown: false }} />
        <Tabs.Screen name="account-details" options={{ headerShown: false }} />
        <Tabs.Screen name="payment-methods" options={{ headerShown: false }} />
        <Tabs.Screen name="create-post" options={{ headerShown: false }} />
        <Tabs.Screen name="post-detail" options={{ headerShown: false }} />
        <Tabs.Screen name="create-event" options={{ headerShown: false }} />
        <Tabs.Screen name="marketplace-item-detail" options={{ headerShown: false }} />
        <Tabs.Screen name="create-listing" options={{ headerShown: false }} />
        <Tabs.Screen name="nanny-selection-guide" options={{ headerShown: false }} />
      </Tabs>
      <RatingPromptHost />
    </>
  );
}
```

- [ ] **Step 6: Typecheck and full test suite**

Run: `pnpm typecheck && pnpm test`
Expected: typecheck clean; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/components/RatingPromptHost.tsx \
        apps/mobile/src/components/__tests__/RatingPromptHost.test.tsx \
        "apps/mobile/app/(parent)/_layout.tsx"
git commit -m "Mount RatingPromptHost in parent layout"
```

---

### Task 6: Push handling for live completion

On a foreground `booking_completed` push, invalidate the pending-rating query so the sheet appears live. On a `booking_completed` tap, route to the rating prompt (invalidate the query) instead of `/(parent)/bookings`. The push `data` payload carries `{ type: 'BOOKING_COMPLETED', bookingId, title }` from the backend, but the client-facing string type is `booking_completed` (mapped in `notification.service.ts`); handle both spellings defensively.

**Files:**
- Modify: `apps/mobile/src/hooks/usePushNotifications.ts`
- Test: `apps/mobile/src/hooks/__tests__/usePushNotifications.routing.test.ts`

**Interfaces:**
- Consumes: `PENDING_RATING_KEY` from `@mobile/hooks/usePendingRating` (Task 3).
- Produces:
  ```ts
  // Extracted, testable helper (pure — no router/hooks):
  export function isBookingCompletedPush(data?: Record<string, string>): boolean;
  ```

- [ ] **Step 1: Write the failing test for the helper**

Create `apps/mobile/src/hooks/__tests__/usePushNotifications.routing.test.ts`:

```ts
import { isBookingCompletedPush } from '@mobile/hooks/usePushNotifications';

describe('isBookingCompletedPush', () => {
  it('matches the backend push type string', () => {
    expect(isBookingCompletedPush({ type: 'booking_completed' })).toBe(true);
  });

  it('matches the enum-cased type defensively', () => {
    expect(isBookingCompletedPush({ type: 'BOOKING_COMPLETED' })).toBe(true);
  });

  it('is false for other types', () => {
    expect(isBookingCompletedPush({ type: 'nanny_checkin' })).toBe(false);
  });

  it('is false for missing data', () => {
    expect(isBookingCompletedPush(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test usePushNotifications.routing`
Expected: FAIL — `isBookingCompletedPush` is not exported.

- [ ] **Step 3: Add the helper and wire it in**

In `apps/mobile/src/hooks/usePushNotifications.ts`:

Add the import near the other `@mobile` imports:
```ts
import { PENDING_RATING_KEY } from '@mobile/hooks/usePendingRating';
```

Add the exported helper above `navigateFromNotification`:
```ts
export function isBookingCompletedPush(data?: Record<string, string>): boolean {
  const type = data?.['type']?.toLowerCase();
  return type === 'booking_completed';
}
```

Modify `navigateFromNotification` so a completion tap opens the rating prompt. It needs the query client — change its signature and the two call sites. Replace the function with:
```ts
function navigateFromNotification(
  router: ReturnType<typeof useRouter>,
  queryClient: ReturnType<typeof useQueryClient>,
  data?: Record<string, string>,
) {
  const conversationId = data?.['conversationId'];
  if (conversationId) {
    router.push({
      pathname: '/(parent)/chat/messaging',
      params: { conversationId },
    });
    return;
  }

  // A completed-booking tap should drive the mandatory rating prompt, not the
  // booking detail. Invalidating lets usePendingRating re-detect and open the sheet.
  if (isBookingCompletedPush(data)) {
    void queryClient.invalidateQueries({ queryKey: PENDING_RATING_KEY });
    router.push('/(parent)/home' as never);
    return;
  }

  const bookingId = data?.['bookingId'];
  if (bookingId) {
    navigateToBookingDetail(router, bookingId, {
      focusCareLog: shouldFocusCareLogFromPushData(data),
    });
    return;
  }

  const notificationType = data?.['type'];
  if (notificationType === 'nanny_checkin') {
    router.push('/(parent)/bookings' as never);
  }
}
```

Note: the `booking_completed` branch must come **before** the `bookingId` branch, because the completion push carries a `bookingId` and would otherwise route to booking-detail.

Update the three call sites inside `usePushNotifications` to pass `queryClient`:
- In `onNotificationOpenedApp`: `navigateFromNotification(router, queryClient, message.data);`
- In `getInitialNotification().then`: `navigateFromNotification(router, queryClient, message.data);`
- In the `addNotificationResponseReceivedListener` callback: `navigateFromNotification(router, queryClient, data);`

Add foreground-receive handling in the existing `messaging.onMessage` handler. After the messaging/notifications invalidation block, before the closing `});`, add:
```ts
        if (isBookingCompletedPush(message.data)) {
          queryClient.invalidateQueries({ queryKey: PENDING_RATING_KEY });
        }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test usePushNotifications.routing`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck and full suite**

Run: `pnpm typecheck && pnpm test`
Expected: typecheck clean; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/hooks/usePushNotifications.ts \
        apps/mobile/src/hooks/__tests__/usePushNotifications.routing.test.ts
git commit -m "Route booking_completed push to mandatory rating prompt"
```

---

### Task 7: Manual verification & lint

Confirm the flow end-to-end and clean up.

- [ ] **Step 1: Lint the changed files**

Run: `pnpm lint`
Expected: no new errors in the created/modified files. Fix any that appear.

- [ ] **Step 2: Full typecheck + test suite one final time**

Run: `pnpm typecheck && pnpm test`
Expected: clean; all tests pass; coverage threshold (80%) still met.

- [ ] **Step 3: Manual smoke test (document results in the PR)**

With a MOTHER account against the dev backend, verify:
1. A booking in COMPLETED with no review → opening the app shows the rating sheet.
2. The sheet cannot be dismissed: no close button; Android hardware back does nothing; tapping outside does nothing.
3. Submitting a rating closes the sheet; reopening the app does not show it again (booking now has `myReview`).
4. The nanny profile's rating/reviewCount reflects the new review.
5. A NANNY account never sees the sheet.

- [ ] **Step 4: Final commit if any lint fixes were made**

```bash
git add -A
git commit -m "Lint fixes for mandatory rating feature"
```

---

## Self-Review Notes

- **Spec coverage:** Hard-block (Task 4 non-dismissible Modal) ✓; most-recent-only (Task 3 `pickPendingRating` reads `bookings[0]`, `limit=1`) ✓; triggers app-open + foreground (Task 3 query + AppState) + live push receive + push tap (Task 6) ✓; MOTHER-only gate (Task 3 `enabled`) ✓; shared star input (Task 1) ✓; 409-as-success (Task 4) ✓; no backend changes ✓; testing (each task) ✓.
- **Type consistency:** `pickPendingRating`, `PENDING_RATING_KEY`, `useRatingPromptStore`, `markRatingResolved`, `isRatingResolved`, `showRatingPrompt`/`clearRatingPrompt`, `StarRatingInput`/`RATING_LABELS`, `isBookingCompletedPush` are defined once and referenced consistently across tasks.
- **Token caveat:** Task 4 flags verifying each theme token resolves, with the closest-token fallback rule — no invented values.
