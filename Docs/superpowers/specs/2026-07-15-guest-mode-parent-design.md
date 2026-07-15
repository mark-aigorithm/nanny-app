# Guest mode for parents ("Continue as guest") — design

Date: 2026-07-15
Status: Approved (assumptions delegated — see "Assumptions")

## Goal

Let a prospective mother explore NannyNow without an account — a read-only
teaser of the home screen, the nanny directory, and the community feed
(marketplace + events + Q&A) — so she can see the value of the app before
committing. Every interaction (booking, chat, RSVP, like, comment, posting,
contacting a seller) opens a "create your account" prompt instead of the
action.

## Assumptions (improvised per request)

- Guest mode targets the **parent/mother experience only**. There is no guest
  nanny experience (nannies must be vetted anyway).
- Guests may **see**: parent home (how-it-works), the nanny directory
  (`search`), nanny public profiles, and the community feed with post details
  (Q&A, marketplace listings, events) including comments — this is the
  strongest teaser content the app has.
- Guests may **not**: create a booking, pay, chat/message, like, RSVP,
  comment, contact a seller, create posts/listings/events, or open
  account-bound screens (bookings, messages, notifications, profile, rewards).
- Guest state is **in-memory only** (not persisted). After an app restart the
  user simply lands on the splash screen again and can tap "Continue as
  guest" once more — an extra registration nudge, by design.
- Community posts and nanny public profiles become readable by anonymous
  clients on the backend. Nanny profiles are already modelled as "public";
  community content (author first name + avatar) is deliberately exposed as
  the teaser. Comments stay read-only.
- No new backend data or schema — this is an access-level change plus a
  client-side gate.

## UX (mobile)

### Entry
- `SplashScreen` gains a text-variant button under "Get Started":
  **"Continue as guest"** → sets the guest flag and lands on
  `/(parent)/home`.

### Browsing as guest
- **Home**: the live-booking card is replaced by a **guest welcome card** —
  "You're browsing as a guest" + benefits line + "Create free account"
  button (→ role selection). Below it the existing "Book care" CTA and
  "How it works" section remain visible; a new **"Meet our nannies"** row
  links to the nanny directory (`/(parent)/search`) so a guest can see real
  profiles — the strongest conversion hook.
- **Nanny directory / nanny profile**: fully browsable. The "Book" CTA
  triggers the register prompt.
- **Community feed / post detail / marketplace item**: fully readable,
  including comments. Like, RSVP, comment composer, "Message seller", and
  the create-post FAB trigger the register prompt.
- **Bottom nav**: "Home" and "Community" navigate normally; "My bookings"
  and "Messages" trigger the register prompt instead of navigating.
- **Header**: the avatar button and the notification bell trigger the
  register prompt instead of navigating.

### Register prompt (conversion surface)
A modal modelled on `NannyShiftPromptModal` (global host + zustand store):
icon, title "Join NannyNow", a message tailored to the blocked action
(e.g. "Create your free account to book trusted, vetted nannies."), then:
- **Create free account** (primary) → `/(auth)/role-selection`
- **Sign in** (outline) → `/(auth)/sign-in`
- **Keep browsing** (text) → dismiss

Guest flag is cleared automatically the moment a Firebase user signs in
(auth listener in the root layout), so registration/sign-in from the prompt
exits guest mode with zero extra wiring. Backing out of the auth flow
returns to guest browsing.

## Mobile architecture

- `src/store/guestStore.ts` — `{ isGuest, enterGuestMode, exitGuestMode }`.
- `src/store/registerPromptStore.ts` — `{ prompt: { message } | null,
  showRegisterPrompt(message?), dismiss() }`.
- `src/components/RegisterPromptModal.tsx` — global modal, mounted once in
  `app/(parent)/_layout.tsx`.
- `src/hooks/useGuestGate.ts` — `{ isGuest, gate(action, message?) }`;
  `gate` returns a wrapped handler that shows the prompt for guests and runs
  the action otherwise. Screens keep their logic; only `onPress` handlers
  get wrapped.
- `app/index.tsx` — before the `!user → splash` redirect: if guest, redirect
  to `/(parent)/home`.
- `app/_layout.tsx` — `onAuthStateChanged`: a non-null user clears the guest
  flag.
- Query hygiene for anonymous sessions: `useUnreadNotificationCount`,
  `useUnreadMessageCount`, and the active-booking `useBookingList` usage gain
  `enabled: !!firebaseUser` so guests never fire account-bound requests.

## Backend

- New `optionalAuth` middleware (`auth.middleware.ts`): no `Authorization`
  header → continue anonymous (`req.firebaseUser` undefined); header present
  → verify exactly like `requireAuth` (invalid/expired still 401).
- Switch to `optionalAuth` (read-only, public-safe):
  - `GET /nanny/skills`, `GET /nanny/nannies`, `GET /nanny/nannies/:id`,
    `GET /nanny/nannies/:id/booked-slots` — none of these read
    `req.firebaseUser`; pure middleware swap.
  - `GET /community/posts`, `GET /community/posts/:id`,
    `GET /community/posts/:id/comments` — services accept
    `DecodedIdToken | null`; anonymous callers skip the user lookup and the
    mother-role check and get `likedByMe: false` / `rsvpdByMe: false`.
- Every mutation route keeps `requireAuth` unchanged.

## Testing

- Backend (Jest): `optionalAuth` unit tests (no header / valid / invalid);
  community service tests for anonymous `listPosts`, `getPost`,
  `listComments` (flags false, no user lookup, role check skipped only when
  anonymous).
- Mobile has no test harness — verified via `pnpm typecheck` + `pnpm lint`
  and manual flow review.

## Out of scope

- Persisting guest state across restarts.
- Guest access to booking price estimates, availability calendars inside the
  booking flow, deep-link hardening for account-bound screens.
- Any nanny-side guest experience.
