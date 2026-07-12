# Remove the Messages Tab from the Nanny Mobile View

**Date:** 2026-07-12
**Status:** Approved

## Problem

Nannies currently have a "Messages" tab in their mobile bottom navigation
(Dashboard · Requests · Messages · Profile). Nannies do not need to chat with
anyone, so the messaging surface should be removed from the nanny experience.

## Goal

Remove the Messages tab and all nanny-facing chat surfaces. The nanny bottom nav
becomes **Dashboard · Requests · Profile** (3 tabs, evenly spaced via the
existing `flex: 1` styling).

## Scope

### Edits (2 files)

1. `apps/mobile/src/components/NannyBottomNav.tsx`
   - Remove `'messages'` from the `NannyBottomNavTab` type union.
   - Remove `'/(nanny)/messages'` from the `href` union type.
   - Remove the `messages` entry from the `TABS` array.

2. `apps/mobile/app/(nanny)/_layout.tsx`
   - Remove the `<Tabs.Screen name="messages" />` registration.
   - Remove the `<Tabs.Screen name="chat" />` registration.

### Deletes (4 files)

3. `apps/mobile/app/(nanny)/messages.tsx` — route file.
4. `apps/mobile/app/(nanny)/chat.tsx` — route file (only reachable from the
   nanny messages screen, which is also being removed).
5. `apps/mobile/src/screens/nanny/NannyMessagesScreen.tsx`
6. `apps/mobile/src/screens/nanny/styles/nanny-messages-screen.styles.ts`

## Explicitly Out of Scope (left untouched)

- **Parent messaging** — `MessagesScreen`, `ChatThreadScreen`, and the
  `(parent)/chat/*` routes remain; the parent side still uses them.
- **Shared `messages` mocks/types** and the `useMessaging` hook — still consumed
  by the parent side.
- **`marketplace_message` deep-link** in `NannyNotificationsScreen`, which opens
  `/(parent)/chat/messaging`. Left in place for now (per decision during
  brainstorming).

## Verification

- The only references to `/(nanny)/messages` and `/(nanny)/chat` live inside the
  files being removed — confirmed by search, so deletion leaves no dangling
  navigation.
- Typecheck passes with no unresolved imports.
- The nanny bottom nav renders 3 evenly spaced tabs.
