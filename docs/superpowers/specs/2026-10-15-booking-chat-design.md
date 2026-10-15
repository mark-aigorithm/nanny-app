# Booking chat — design

**Date:** 2026-10-15 · **Status:** approved in chat, awaiting spec review

## Goal

While a booking is running, the mother and the assigned nanny can message each other from the
booking detail screen in the app. Admins can read any booking's conversation from the booking
detail page in the console.

### Decisions (from the user)

| Question | Answer |
|---|---|
| When can they send? | **Only while the booking is `IN_PROGRESS`.** Read-only in every other status. |
| What can the admin do? | **Read-only.** Admins cannot post; participants are not told an admin viewed it. |
| Notifications? | **Push + in-app notification** to the other participant; tapping opens the chat. |

### Assumptions (stated, not contested)

- Booking chats are reached from the booking detail and from the notification only. They are
  **not** listed in the parent's Messages tab, and do not count toward that tab's unread badge,
  which stay marketplace-only.
- Text only — no images, attachments, edits, deletes, reactions or typing indicators.
- No realtime channel: polling while the chat is open, as marketplace chat does today.

## Approach

Booking-owned messages in their own tables, under `/bookings/:id/messages`, rather than a
`BOOKING` type on the existing `Conversation` model.

`Conversation.communityPostId` is non-null and the marketplace service assumes a post throughout;
admins can also reassign a booking's nanny (`PATCH /admin/bookings/:id/nanny`), so a stored
participant list would go stale. Authorising against the booking itself — its mother and its
*current* nanny — is the same rule the care log uses and keeps marketplace code untouched.

## Data model (Prisma)

```prisma
model BookingMessage {
  id        Int       @id @default(autoincrement())
  bookingId Int       @map("booking_id")
  booking   Booking   @relation(fields: [bookingId], references: [id])
  senderId  Int       @map("sender_id")
  sender    User      @relation("BookingMessageSender", fields: [senderId], references: [id])
  content   String    @db.Text
  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")
  deletedAt DateTime? @map("deleted_at")

  @@index([bookingId, createdAt])
  @@index([senderId])
  @@map("booking_messages")
}

/// When each participant last read a booking's chat — drives unread counts.
model BookingChatRead {
  id         Int       @id @default(autoincrement())
  bookingId  Int       @map("booking_id")
  booking    Booking   @relation(fields: [bookingId], references: [id])
  userId     Int       @map("user_id")
  user       User      @relation(fields: [userId], references: [id])
  lastReadAt DateTime  @map("last_read_at")
  createdAt  DateTime  @default(now()) @map("created_at")
  updatedAt  DateTime  @updatedAt @map("updated_at")
  deletedAt  DateTime? @map("deleted_at")

  @@unique([bookingId, userId])
  @@index([userId])
  @@map("booking_chat_reads")
}
```

- `NotificationType` gains `BOOKING_MESSAGE`; notifications use the existing
  `NotificationReferenceType.BOOKING` with `referenceId = bookingId`.
- One migration: `add_booking_chat`.

## Shared schemas (`packages/shared/src/booking-chat.ts`)

- `BookingMessageSchema` — `{ id, bookingId, content, createdAt, sender: { id, firstName, lastName, avatarUrl, role: 'MOTHER' | 'NANNY' } }`
- `BookingMessageListResponseSchema` — `{ messages, hasMore }` (oldest → newest within the page)
- `BookingMessageHistoryQuerySchema` — `{ cursor?: ISO datetime, limit ≤ 100, default 50 }`
- `SendBookingMessageSchema` — `{ content: trimmed, 1–2000 chars }`
- `BookingChatSummarySchema` — `{ canSend, messageCount, unreadCount }`, added as `chat` to the
  mobile booking detail response and as `chatMessageCount` to `AdminBookingDetail`.

## Backend

New `services/booking-chat.service.ts` and `routes/booking-chat.routes.ts` (mounted on the
bookings router). Routes stay thin per the backend guide.

| Endpoint | Who | Behaviour |
|---|---|---|
| `GET /bookings/:id/messages` | mother / current nanny | Cursor-paged history, any status |
| `POST /bookings/:id/messages` | mother / current nanny | `IN_PROGRESS` only, else **409** "Messages can only be sent while the booking is in progress." Marks the sender read. |
| `POST /bookings/:id/messages/read` | mother / current nanny | Upserts `BookingChatRead.lastReadAt = now` |
| `GET /admin/bookings/:id/messages` | console, `bookings: VIEW` | Full history, read-only; new row in `ADMIN_ROUTE_PERMISSIONS` |

- **Access:** a user who is neither `booking.motherId` nor `booking.nannyProfile.userId` gets
  **404** (don't reveal the booking exists). A nanny reassigned off the booking loses access
  immediately, history included.
- **Summary:** `canSend = status === IN_PROGRESS`; `unreadCount` = messages from the other
  participant after the caller's `lastReadAt`.
- **Notify on send:** `createInAppNotification` + `dispatchPush` to the other participant —
  title "New message", body "`<First name>`: `<first 100 chars>`", data
  `{ type: 'BOOKING_MESSAGE', bookingId }`. Notification failures are logged, never fail the send.
- Messages are never hard-deleted; all reads filter `deletedAt: null`.

## Mobile

### Shared chat pieces

Extract from `ChatThreadScreen` into `components/chat/`: `MessageBubble`, `DateDivider`,
`groupMessagesByDay`, and `ChatComposer` (input + send, `KeyboardAvoidingView`, drops
`useBottomBarPadding` while `useKeyboardVisible()`). `ChatThreadScreen` is refactored to use them
with no visible change.

### Hooks (`hooks/useBookingChat.ts`)

`useBookingMessages(bookingId)` (polls every 5 s while focused), `useSendBookingMessage`,
`useMarkBookingChatRead`. Sending, reading and an incoming push invalidate the booking detail
query so the entry card's badge stays right.

### Entry card — `components/booking/BookingChatCard.tsx`

Styled like the existing "Something wrong? / Contact support" row (icon circle, title, subtitle,
chevron, `PressableScale`), with a corner `Badge` for unread.

| State | Shown | Copy |
|---|---|---|
| `canSend` | yes | "Message Sara" · "Ask or share an update during the shift" |
| not live, `messageCount > 0` | yes | "View messages" · "N messages · read-only" |
| not live, no messages | hidden | — |

Placed directly under the `LiveShiftCard` on the mother's `BookingDetailScreen`, and under the
status badge on `NannyBookingDetailScreen`.

### Chat screen — `screens/shared/BookingChatScreen.tsx`

One screen for both roles: `ScreenContainer` + `StackHeader` (title: the other person's full name;
subtitle: the booking day), message list with date dividers, `ChatComposer` when `canSend`.
When not, the composer is replaced by a muted note: before the start "You can message once the
shift starts"; after "This booking has ended — messages are read-only". Marks read on open and
on new messages while open; sets the active booking chat in `messagingStore` so the foreground
push for that chat refreshes the thread instead of notifying.

Routes: `app/(parent)/book/booking-chat.tsx` and `app/(nanny)/booking-chat.tsx` (hidden
`Tabs.Screen`, like `booking-detail`), both taking `bookingId`. Notification taps
(`navigateFromNotification`) with `type: 'BOOKING_MESSAGE'` open the chat for the signed-in role.

All UI follows `apps/mobile/CLAUDE.md` theme and UI-sweep rules: theme tokens only, names wrap
rather than truncate, 44 dp targets, labelled send button.

## Admin console

- **Header action** on `booking-detail-page.tsx`: "View chat (N)" button, disabled with title
  "No messages" when `chatMessageCount` is 0.
- **`features/bookings/booking-chat-modal.tsx`:** the existing `Modal`, read-only transcript
  fetched from `GET /admin/bookings/:id/messages`. Mother's messages left, nanny's right; each with
  name, a role badge (Mommy / Nanny — the console's existing labels) and full timestamp
  (`formatDateTime`); day dividers; loading / error / empty states from the UI kit. Footer note:
  "Read-only — admins can't post in booking chats." Styling per the `nanny-app-admin-design` skill.

## Testing

- **Backend unit:** send gate for every status; 404 for an outsider and for a reassigned nanny;
  summary counts; notification goes to the other participant only and a push failure doesn't fail
  the send.
- **Backend integration** (real DB): mother↔nanny round trip, pagination cursor, read marking,
  admin endpoint and its permission row (`admin-permissions.test.ts` stays green).
- **Shared:** schema tests for content limits.
- **Admin Vitest + MSW:** button count/disabled, modal renders sides, roles and empty/error states.
- **Mobile RNTL:** entry card's three states, chat screen composer vs. read-only note,
  `ChatThreadScreen` still renders after the extraction.
- **UI sweep:** a sweep flow for the chat screen (live + read-only, keyboard open) at least on
  `small-1.3-3btn`.

## Out of scope

Realtime transport, attachments, admin posting, message moderation/reporting, chat in the
Messages tab, chats before the shift starts.
