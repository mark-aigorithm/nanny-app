# Uber-Inspired Parent Navigation & Account Redesign

**Date:** 2026-07-22
**Scope:** Mobile app (Expo), parent side only
**Status:** Approved

## Goal

Restructure the parent app's primary navigation and key tab screens to follow Uber's
IA and layout patterns — floating pill tab bar, Services hub, Activity list, and an
Uber-style Account screen — while keeping NannyNow's visual identity (sage/cream/taupe
palette, Manrope type, soft rounded surfaces).

**Guiding rule:** Uber structure, NannyNow skin. No new color tokens; every value comes
from `@mobile/theme`.

## Approach

Rebuild in place (chosen over a parallel shell or a native expo-router `tabBar`
refactor): rework the existing `BottomNav` component, add one new `services` route,
restyle the existing `bookings` screen into Activity, and rebuild `mother-profile` as
the Account tab. Community/Messages keep their routes but become inner screens.

## 1. Bottom tab bar — floating pill

Replaces the current edge-to-edge taupe `BottomNav`.

- **Tabs:** Home · Services · Activity · Account (labels exactly these).
- **Container:** floating capsule detached from screen edges — `colors.surface`,
  `borderRadius.full`, `...shadows.md`, absolute-positioned above the home-indicator
  safe area, horizontal margin ~`spacing['2xl']`.
- **Items:** icon (20–22px Ionicons) above an 11px label.
  - Home: `home` / `home-outline`
  - Services: `grid` / `grid-outline` (Uber's dot-grid feel)
  - Activity: `receipt` / `receipt-outline`
  - Account: `person` / `person-outline`
- **Active state:** active item's icon sits inside a filled circle of
  `colors.primaryMuted` (sage tint); icon + label `colors.textPrimary`, label
  semibold. Inactive: `colors.textMuted`, outline icon, no circle.
- **Badge:** unread-messages dot moves to the Account item (`colors.error` dot).
- **Guest gating:** unchanged behavior — Activity gated ("Create your free account to
  book and manage care."); Account gated for guests where messages/booking data is
  involved (reuse existing `useGuestGate` wiring).
- **Scroll behavior:** tab screens scroll under the floating bar; each tab screen adds
  bottom content inset (bar height + margin) so no content is trapped behind it.

## 2. Services tab (new)

New route `app/(parent)/services.tsx` → new `ServicesHubScreen`.

- Big bold `Services` title (`typeScale.headingLg`), no boxed header.
- Tile grid on warm surfaces (`colors.surfaceMuted` / `colors.taupeLight`,
  `borderRadius.xl`):
  - **Book a Nanny** — hero tile, 2 columns wide, sage accent → booking flow.
  - **Community** → `community`
  - **Marketplace** → `marketplace`
  - **Events & Meetups** → `events-meetups`
  - **Live Monitor** → `nanny/live-video-monitor`
  - **Care Points** → `rewards`
- Tiles: icon (via `IconCircle` or inline Ionicons) + label; pressed feedback;
  44pt+ targets.
- Guest gating on tiles that need an account (booking, live monitor), same messages
  as today.

## 3. Activity tab (restyled bookings)

`BookingHistoryScreen` keeps all data/logic; visual pass only:

- Bold `Activity` title header replacing the current boxed header.
- **Upcoming**: prominent cards — nanny avatar, date/time, status badge.
- **Past**: compact list rows, mirroring Uber's ride history.
- Route stays `app/(parent)/bookings.tsx`; only the tab label reads "Activity".

## 4. Account tab (rebuilt mother-profile)

`MotherProfileWalletScreen` rebuilt to the Uber Account layout; route stays
`app/(parent)/mother-profile.tsx` and becomes the Account tab target.

- **Header:** big bold name (`typeScale.headingLg`, left-aligned) + `Avatar` right;
  rating pill under the name (star icon + parent rating) on `colors.surfaceMuted`.
- **2×2 quick tiles** (`colors.surfaceMuted`, `borderRadius.xl`, icon + label):
  - **Help** → customer support
  - **Wallet** → payment methods
  - **Safety** → live video monitor
  - **Inbox** → messages (unread badge)
- **Promo cards** (full-width, title + subtitle + icon/illustration right):
  - **Care Points** — "Earn rewards on every booking" → rewards
  - **Refer a friend** — "You each get a discount" → refer-a-friend
- **List section:** Account details, Notifications, Sign out (destructive, visually
  separated).
- No back button (it's a tab); the `returnTo` param plumbing is removed.

## Former tabs → inner screens

- **Community**, **Marketplace**, **Events & Meetups**: reached from Services hub;
  swap embedded bottom nav for a standard back `Header`.
- **Messages**: reached from Account → Inbox; gets a back `Header`.
- Routes are unchanged; only their chrome changes.

## Out of scope

- Home screen content (gets the new floating bar + scroll inset only).
- Nanny side (keeps `NannyBottomNav`).
- Booking flow, chat thread, and all other inner screens.
- Any new theme tokens or palette changes.

## Testing

- Update existing component/screen tests touched by the changes (`BottomNav`,
  profile screen tests) and add tests for the new tab bar active/gating behavior and
  the Services hub navigation targets.
- Visual validation via the workflow in `apps/mobile/CLAUDE.md` (390×844) for: tab
  bar, Services, Activity, Account.

## Design constraints checklist

- Tokens only — no hardcoded hex/font/shadow values; closest existing token wins.
- Styles in `screens/parent/styles/*.styles.ts` / component style files.
- Reuse `@mobile/components/ui` (Button, Card, Chip, Avatar, Header, IconCircle,
  ScreenContainer, SectionHeader) before building bespoke views.
- Touch targets ≥44pt, pressed feedback on all tappables, safe-area compliant.
