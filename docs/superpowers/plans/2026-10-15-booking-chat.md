# Booking Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mother and assigned nanny can message each other on a booking while it is `IN_PROGRESS`; admins can read any booking's chat from the console's booking detail page.

**Architecture:** Booking-owned tables (`booking_messages`, `booking_chat_reads`) served under `/bookings/:id/messages`, authorised against the booking's mother and *current* nanny exactly like the care log. Mobile gets one shared chat screen (both roles) built from components extracted out of the marketplace `ChatThreadScreen`, polled every 5 s. The console reads `GET /admin/bookings/:id/messages` into a read-only modal.

**Tech Stack:** Prisma 7 + Express + Zod (`@nanny-app/shared`), Jest (backend unit + integration), Expo Router + React Query + RNTL (mobile), React + Vite + Vitest + MSW (admin).

**Spec:** `docs/superpowers/specs/2026-10-15-booking-chat-design.md`

## Global Constraints

- Sending is allowed **only** when `booking.status === 'IN_PROGRESS'`; otherwise 409 `"Messages can only be sent while the booking is in progress."`
- Reading is allowed in every status, for the booking's mother and its *current* nanny only; anyone else gets **404** `"Booking not found."`.
- Admins are read-only. The admin route is declared in `ADMIN_ROUTE_PERMISSIONS` as `section('bookings', 'VIEW')`.
- Message content: trimmed, 1–2000 chars. Text only.
- Every Prisma read filters `deletedAt: null`; no hard deletes.
- Notification on send → the *other* participant only: in-app `BOOKING_MESSAGE` (`referenceType: BOOKING`, `referenceId: bookingId`) + push `{ type: 'BOOKING_MESSAGE', bookingId }`, title `"New message"`, body `"<sender first name>: <content, first 100 chars>"`. Fire-and-forget: a notification failure never fails the send.
- Booking chats are not listed in the parent Messages tab and do not touch `/conversations` or its unread badge.
- Mobile: theme tokens only (no hex, no font strings, no hand-written shadows), `Text`/`TextInput` from `@mobile/components/ui/text`, `KeyboardAvoidingView` from `@mobile/components/ui`, `useBottomBarPadding` for bottom-pinned UI, 44 dp tap targets, icon-only buttons labelled, names wrap rather than truncate.
- Admin: CSS tokens from `global.css` `:root` only; components from `@admin/components/ui`.
- Commit after every task, with the attribution trailer from the session.

**Deviation from spec (recorded here and in the spec in Task 10):** the chat summary is served by `GET /bookings/:id/messages/summary` rather than a `chat` field on `BookingResponse`, because `toBookingResponse` also builds every booking list and would add a count query per row. The admin button reads its count from the messages query instead of a new `AdminBookingDetail` field. The shared chat screen lives at `src/screens/BookingChatScreen.tsx` (beside `OfflineScreen`), since `screens/shared/` doesn't exist.

## Review Focus

1. **Nanny reassigned off a booking** → the old nanny must get 404 on read *and* send; the new nanny sees the full history. (Test: Task 3 unit, Task 4 integration.)
2. **Whitespace-only or 2001-char message** → 400 from validation, nothing stored, no notification. (Test: Task 1 schema, Task 4 integration.)
3. **Booking flips out of `IN_PROGRESS` while the chat is open** → the next send gets 409; the screen swaps the composer for the read-only note on the next summary refetch, and the error is shown, not swallowed. (Test: Task 6 RNTL.)
4. **Admin with no messages / backend error** → button disabled with "No messages"; modal shows ErrorState with retry rather than a blank box. (Test: Task 9.)
5. **Existing marketplace chat after the component extraction** → `ChatThreadScreen` still renders listing card, bubbles, and sends. (Test: Task 5.)

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/shared/src/booking-chat.ts` (new) | Zod schemas + types for booking chat |
| `packages/shared/src/notifications.ts` | add `'booking_message'` |
| `apps/backend/prisma/schema.prisma` + migration `20261015120000_add_booking_chat` | models + enum value |
| `apps/backend/src/services/booking-chat.service.ts` (new) | access, list, send, read, summary, admin list, notify |
| `apps/backend/src/services/notification.service.ts` | map `BOOKING_MESSAGE` → `booking_message` |
| `apps/backend/src/routes/booking.routes.ts` | 4 thin mobile routes |
| `apps/backend/src/routes/admin.routes.ts` + `lib/admin-permissions.ts` | admin route + permission row |
| `apps/mobile/src/components/chat/*` (new) | `MessageBubble`, `DateDivider`, `ChatComposer`, `groupMessagesByDay`, styles |
| `apps/mobile/src/hooks/useBookingChat.ts` (new) | React Query hooks |
| `apps/mobile/src/store/messagingStore.ts` | `activeBookingChatId` |
| `apps/mobile/src/screens/BookingChatScreen.tsx` + `screens/styles/booking-chat-screen.styles.ts` (new) | chat screen for both roles |
| `apps/mobile/app/(parent)/book/booking-chat.tsx`, `apps/mobile/app/(nanny)/booking-chat.tsx` (new) | routes |
| `apps/mobile/src/components/booking/BookingChatCard.tsx` (new) | entry card |
| `apps/mobile/src/lib/notificationNavigation.ts`, `hooks/usePushNotifications.ts`, both `*NotificationsScreen.tsx` | open chat from notifications |
| `apps/admin/src/lib/api.ts`, `features/bookings/booking-chat-modal.tsx` (new), `pages/booking-detail-page.tsx`, `styles/global.css`, `test/handlers.ts` | console |

---

### Task 1: Shared schemas

**Files:**
- Create: `packages/shared/src/booking-chat.ts`
- Modify: `packages/shared/src/index.ts` (add export), `packages/shared/src/notifications.ts` (add enum value)
- Test: `packages/shared/src/__tests__/booking-chat.test.ts`

**Interfaces:**
- Produces: `BookingMessageResponseSchema`, `BookingMessageResponse`, `BookingMessageListResponseSchema`, `BookingMessageListResponse`, `BookingMessageHistoryQuerySchema`, `BookingMessageHistoryQuery`, `SendBookingMessageSchema`, `SendBookingMessageRequest`, `BookingChatSummarySchema`, `BookingChatSummary`, `BOOKING_MESSAGE_MAX_LENGTH = 2000`; `NotificationType` gains `'booking_message'`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/__tests__/booking-chat.test.ts
import { describe, expect, it } from 'vitest';

import {
  BOOKING_MESSAGE_MAX_LENGTH,
  BookingMessageHistoryQuerySchema,
  NotificationTypeSchema,
  SendBookingMessageSchema,
} from '../index';

describe('SendBookingMessageSchema', () => {
  it('trims the message', () => {
    expect(SendBookingMessageSchema.parse({ content: '  On our way  ' })).toEqual({
      content: 'On our way',
    });
  });

  it('refuses an empty or whitespace-only message', () => {
    expect(SendBookingMessageSchema.safeParse({ content: '' }).success).toBe(false);
    expect(SendBookingMessageSchema.safeParse({ content: '   \n ' }).success).toBe(false);
  });

  it('caps the length', () => {
    const max = 'a'.repeat(BOOKING_MESSAGE_MAX_LENGTH);
    expect(SendBookingMessageSchema.safeParse({ content: max }).success).toBe(true);
    expect(SendBookingMessageSchema.safeParse({ content: `${max}a` }).success).toBe(false);
  });
});

describe('BookingMessageHistoryQuerySchema', () => {
  it('defaults the page size and coerces it from the query string', () => {
    expect(BookingMessageHistoryQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(BookingMessageHistoryQuerySchema.parse({ limit: '100' })).toEqual({ limit: 100 });
    expect(BookingMessageHistoryQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
  });
});

it('knows the booking_message notification type', () => {
  expect(NotificationTypeSchema.parse('booking_message')).toBe('booking_message');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @nanny-app/shared test -- booking-chat`
Expected: FAIL. The imports are undefined, or a type error on `BOOKING_MESSAGE_MAX_LENGTH`.

- [ ] **Step 3: Implement**

```ts
// packages/shared/src/booking-chat.ts
import { z } from 'zod';

/** Longest booking chat message, in characters. */
export const BOOKING_MESSAGE_MAX_LENGTH = 2000;

export const BookingMessageSenderSchema = z.object({
  id: z.number().int(),
  firstName: z.string(),
  lastName: z.string(),
  avatarUrl: z.string().nullable(),
  /** Which side of the booking sent it — the console colours by this. */
  role: z.enum(['MOTHER', 'NANNY']),
});
export type BookingMessageSender = z.infer<typeof BookingMessageSenderSchema>;

export const BookingMessageResponseSchema = z.object({
  id: z.number().int(),
  bookingId: z.number().int(),
  content: z.string(),
  sender: BookingMessageSenderSchema,
  createdAt: z.string(),
});
export type BookingMessageResponse = z.infer<typeof BookingMessageResponseSchema>;

/** One page of a booking's chat, oldest first within the page. */
export const BookingMessageListResponseSchema = z.object({
  messages: z.array(BookingMessageResponseSchema),
  hasMore: z.boolean(),
});
export type BookingMessageListResponse = z.infer<typeof BookingMessageListResponseSchema>;

export const BookingMessageHistoryQuerySchema = z.object({
  /** Return messages created before this instant (the oldest one already shown). */
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
});
export type BookingMessageHistoryQuery = z.infer<typeof BookingMessageHistoryQuerySchema>;

export const SendBookingMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Message cannot be empty')
    .max(BOOKING_MESSAGE_MAX_LENGTH, `Keep it under ${BOOKING_MESSAGE_MAX_LENGTH} characters`),
});
export type SendBookingMessageRequest = z.infer<typeof SendBookingMessageSchema>;

/** What a booking detail screen needs to show the chat entry. */
export const BookingChatSummarySchema = z.object({
  /** True only while the booking is IN_PROGRESS. */
  canSend: z.boolean(),
  messageCount: z.number().int(),
  /** Messages from the other participant since the caller last read the chat. */
  unreadCount: z.number().int(),
});
export type BookingChatSummary = z.infer<typeof BookingChatSummarySchema>;
```

Add to `packages/shared/src/index.ts` after the last export line:

```ts
export * from './booking-chat';
```

In `packages/shared/src/notifications.ts`, add `'booking_message',` after `'marketplace_listing_rejected',` in `NotificationTypeSchema`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @nanny-app/shared test -- booking-chat && pnpm --filter @nanny-app/shared typecheck`
Expected: PASS. If the shared package has no `typecheck` script, run `pnpm typecheck` from the root.

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add booking chat schemas"
```

---

### Task 2: Prisma models and migration

**Files:**
- Modify: `apps/backend/prisma/schema.prisma`
- Create: `apps/backend/prisma/migrations/20261015120000_add_booking_chat/migration.sql` (generated)
- Modify: `apps/backend/src/services/notification.service.ts` (`toApiNotificationType`)

**Interfaces:**
- Produces: Prisma `bookingMessage`, `bookingChatRead` delegates; `NotificationType.BOOKING_MESSAGE`.

- [ ] **Step 1: Add the models**

Add this to `schema.prisma` directly after the `Message` model, in the Messaging section:

```prisma
/// A message between a booking's mother and its nanny. Sent only while the
/// booking is IN_PROGRESS; readable by both (and the console) afterwards.
/// Access follows the booking's current nanny, so none is stored here.
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
  user       User      @relation("BookingChatReader", fields: [userId], references: [id])
  lastReadAt DateTime  @map("last_read_at")
  createdAt  DateTime  @default(now()) @map("created_at")
  updatedAt  DateTime  @updatedAt @map("updated_at")
  deletedAt  DateTime? @map("deleted_at")

  @@unique([bookingId, userId])
  @@index([userId])
  @@map("booking_chat_reads")
}
```

Add the back-relations:
- In `model Booking`'s relation list: `chatMessages BookingMessage[]` and `chatReads BookingChatRead[]`.
- In `model User`: `bookingMessages BookingMessage[] @relation("BookingMessageSender")` and `bookingChatReads BookingChatRead[] @relation("BookingChatReader")`.

In `enum NotificationType`, after `MARKETPLACE_LISTING_REJECTED`:

```prisma
  /// The other side of a running booking sent a chat message.
  BOOKING_MESSAGE
```

- [ ] **Step 2: Generate the migration against the dev DB**

Run (dev Postgres must be up via `docker compose up -d`):
`cd apps/backend && pnpm db:migrate:dev --name add_booking_chat`
Then rename the generated folder to `20261015120000_add_booking_chat`, so it sorts after `20261013140000_care_log_children`. Prisma prefixes the real timestamp; any timestamp later than the last migration is fine, so keep Prisma's own if it's already later.
Expected: the SQL contains `ALTER TYPE "notification_type" ADD VALUE 'BOOKING_MESSAGE'`, `CREATE TABLE "booking_messages"`, `CREATE TABLE "booking_chat_reads"`, the two indexes, the unique index and the four FKs. There must be no `DROP`. Read the SQL before continuing.

- [ ] **Step 3: Map the notification type**

In `apps/backend/src/services/notification.service.ts` `toApiNotificationType`, add before `default:`:

```ts
    case 'BOOKING_MESSAGE':
      return 'booking_message';
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter @nanny-app/backend db:generate && pnpm --filter @nanny-app/backend typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/prisma apps/backend/src/services/notification.service.ts
git commit -m "feat(backend): add booking chat tables"
```

---

### Task 3: Booking chat service

**Files:**
- Create: `apps/backend/src/services/booking-chat.service.ts`
- Test: `apps/backend/src/__tests__/booking-chat.service.test.ts`

**Interfaces:**
- Consumes: Task 1 types; Task 2 Prisma delegates.
- Produces:
  - `listBookingMessages(decoded: DecodedIdToken, bookingId: number, query: BookingMessageHistoryQuery): Promise<BookingMessageListResponse>`
  - `sendBookingMessage(decoded: DecodedIdToken, bookingId: number, body: SendBookingMessageRequest): Promise<BookingMessageResponse>`
  - `markBookingChatRead(decoded: DecodedIdToken, bookingId: number): Promise<{ read: true }>`
  - `getBookingChatSummary(decoded: DecodedIdToken, bookingId: number): Promise<BookingChatSummary>`
  - `listAdminBookingMessages(bookingId: number): Promise<BookingMessageListResponse>`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/backend/src/__tests__/booking-chat.service.test.ts
import { BookingStatus } from '@prisma/client';

import { AppError } from '@backend/lib/errors';

jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    booking: { findUnique: jest.fn() },
    bookingMessage: { findMany: jest.fn(), create: jest.fn(), count: jest.fn() },
    bookingChatRead: { findUnique: jest.fn(), upsert: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('@backend/services/notification.service', () => ({
  createInAppNotification: jest.fn().mockResolvedValue({}),
  dispatchPush: jest.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@backend/db/prisma';
import {
  getBookingChatSummary,
  listAdminBookingMessages,
  listBookingMessages,
  markBookingChatRead,
  sendBookingMessage,
} from '@backend/services/booking-chat.service';
import { createInAppNotification, dispatchPush } from '@backend/services/notification.service';

const db = prisma as unknown as {
  user: { findUnique: jest.Mock };
  booking: { findUnique: jest.Mock };
  bookingMessage: { findMany: jest.Mock; create: jest.Mock; count: jest.Mock };
  bookingChatRead: { findUnique: jest.Mock; upsert: jest.Mock };
  $transaction: jest.Mock;
};
const mockNotify = createInAppNotification as jest.Mock;
const mockPush = dispatchPush as jest.Mock;

const mother = { id: 1, firebaseUid: 'uid-mother', firstName: 'Mona', lastName: 'Adel', avatarUrl: null, deletedAt: null };
const nanny = { id: 2, firebaseUid: 'uid-nanny', firstName: 'Sara', lastName: 'Nabil', avatarUrl: null, deletedAt: null };
const outsider = { id: 3, firebaseUid: 'uid-out', firstName: 'X', lastName: 'Y', avatarUrl: null, deletedAt: null };
const USERS: Record<string, typeof mother> = {
  'uid-mother': mother,
  'uid-nanny': nanny,
  'uid-out': outsider,
};

function booking(status: BookingStatus, nannyUserId: number | null = nanny.id) {
  return {
    id: 7,
    status,
    motherId: mother.id,
    deletedAt: null,
    nannyProfile: nannyUserId ? { userId: nannyUserId } : null,
  };
}

const as = (uid: string) => ({ uid }) as never;

beforeEach(() => {
  jest.clearAllMocks();
  db.user.findUnique.mockImplementation(({ where }: { where: { firebaseUid: string } }) =>
    Promise.resolve(USERS[where.firebaseUid] ?? null),
  );
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
});

describe('access', () => {
  it('hides the booking from someone who is not on it', async () => {
    db.booking.findUnique.mockResolvedValue(booking(BookingStatus.IN_PROGRESS));
    await expect(listBookingMessages(as('uid-out'), 7, { limit: 50 })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('hides it from a nanny who was reassigned off it', async () => {
    db.booking.findUnique.mockResolvedValue(booking(BookingStatus.IN_PROGRESS, 99));
    await expect(
      sendBookingMessage(as('uid-nanny'), 7, { content: 'hi' }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(db.bookingMessage.create).not.toHaveBeenCalled();
  });

  it('404s a booking that does not exist', async () => {
    db.booking.findUnique.mockResolvedValue(null);
    await expect(getBookingChatSummary(as('uid-mother'), 7)).rejects.toBeInstanceOf(AppError);
  });
});

describe('sendBookingMessage', () => {
  const created = {
    id: 50,
    bookingId: 7,
    senderId: mother.id,
    content: 'Nap at 1pm please',
    createdAt: new Date('2026-10-15T10:00:00Z'),
    sender: mother,
  };

  it.each([
    BookingStatus.PENDING,
    BookingStatus.APPROVED,
    BookingStatus.PENDING_CONFIRMATION,
    BookingStatus.CONFIRMED,
    BookingStatus.COMPLETED,
    BookingStatus.CANCELLED,
    BookingStatus.REFUNDED,
  ])('refuses to send while %s', async (status) => {
    db.booking.findUnique.mockResolvedValue(booking(status));
    await expect(
      sendBookingMessage(as('uid-mother'), 7, { content: 'hi' }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'Messages can only be sent while the booking is in progress.',
    });
    expect(db.bookingMessage.create).not.toHaveBeenCalled();
  });

  it('stores the message, marks the sender read, and tells only the other side', async () => {
    db.booking.findUnique.mockResolvedValue(booking(BookingStatus.IN_PROGRESS));
    db.bookingMessage.create.mockResolvedValue(created);

    const res = await sendBookingMessage(as('uid-mother'), 7, { content: 'Nap at 1pm please' });

    expect(res).toEqual({
      id: 50,
      bookingId: 7,
      content: 'Nap at 1pm please',
      sender: { id: 1, firstName: 'Mona', lastName: 'Adel', avatarUrl: null, role: 'MOTHER' },
      createdAt: '2026-10-15T10:00:00.000Z',
    });
    expect(db.bookingChatRead.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { bookingId_userId: { bookingId: 7, userId: 1 } } }),
    );
    await new Promise((r) => setImmediate(r));
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: nanny.id,
        type: 'BOOKING_MESSAGE',
        title: 'New message',
        body: 'Mona: Nap at 1pm please',
        referenceId: 7,
        referenceType: 'BOOKING',
      }),
    );
    expect(mockPush).toHaveBeenCalledWith(nanny.id, {
      title: 'New message',
      body: 'Mona: Nap at 1pm please',
      data: { type: 'BOOKING_MESSAGE', bookingId: '7' },
    });
  });

  it('labels a nanny-sent message as NANNY and notifies the mother', async () => {
    db.booking.findUnique.mockResolvedValue(booking(BookingStatus.IN_PROGRESS));
    db.bookingMessage.create.mockResolvedValue({ ...created, senderId: nanny.id, sender: nanny });

    const res = await sendBookingMessage(as('uid-nanny'), 7, { content: 'Done' });

    expect(res.sender.role).toBe('NANNY');
    await new Promise((r) => setImmediate(r));
    expect(mockPush).toHaveBeenCalledWith(mother.id, expect.anything());
  });

  it('cuts a long message to 100 characters in the notification', async () => {
    const long = 'x'.repeat(150);
    db.booking.findUnique.mockResolvedValue(booking(BookingStatus.IN_PROGRESS));
    db.bookingMessage.create.mockResolvedValue({ ...created, content: long });

    await sendBookingMessage(as('uid-mother'), 7, { content: long });
    await new Promise((r) => setImmediate(r));

    expect(mockNotify.mock.calls[0][0].body).toBe(`Mona: ${'x'.repeat(99)}…`);
  });

  it('still returns the message when the notification fails', async () => {
    db.booking.findUnique.mockResolvedValue(booking(BookingStatus.IN_PROGRESS));
    db.bookingMessage.create.mockResolvedValue(created);
    mockNotify.mockRejectedValueOnce(new Error('fcm down'));

    await expect(
      sendBookingMessage(as('uid-mother'), 7, { content: 'Nap at 1pm please' }),
    ).resolves.toMatchObject({ id: 50 });
  });
});

describe('listBookingMessages', () => {
  it('returns a page oldest-first and says whether there is more', async () => {
    db.booking.findUnique.mockResolvedValue(booking(BookingStatus.COMPLETED));
    const row = (id: number, minute: number) => ({
      id,
      bookingId: 7,
      senderId: nanny.id,
      content: `m${id}`,
      createdAt: new Date(`2026-10-15T10:${String(minute).padStart(2, '0')}:00Z`),
      sender: nanny,
    });
    // Newest first from the DB, limit + 1 rows.
    db.bookingMessage.findMany.mockResolvedValue([row(3, 3), row(2, 2), row(1, 1)]);

    const res = await listBookingMessages(as('uid-mother'), 7, { limit: 2 });

    expect(res.hasMore).toBe(true);
    expect(res.messages.map((m) => m.id)).toEqual([2, 3]);
    expect(db.bookingMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { bookingId: 7, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 3,
      }),
    );
  });

  it('pages back from a cursor', async () => {
    db.booking.findUnique.mockResolvedValue(booking(BookingStatus.IN_PROGRESS));
    db.bookingMessage.findMany.mockResolvedValue([]);
    const cursor = '2026-10-15T10:02:00.000Z';

    await listBookingMessages(as('uid-mother'), 7, { limit: 50, cursor });

    expect(db.bookingMessage.findMany.mock.calls[0][0].where).toEqual({
      bookingId: 7,
      deletedAt: null,
      createdAt: { lt: new Date(cursor) },
    });
  });
});

describe('getBookingChatSummary', () => {
  it('counts what the other side sent since she last read', async () => {
    const lastReadAt = new Date('2026-10-15T10:00:00Z');
    db.booking.findUnique.mockResolvedValue(booking(BookingStatus.IN_PROGRESS));
    db.bookingChatRead.findUnique.mockResolvedValue({ lastReadAt });
    db.bookingMessage.count.mockResolvedValueOnce(5).mockResolvedValueOnce(2);

    const res = await getBookingChatSummary(as('uid-mother'), 7);

    expect(res).toEqual({ canSend: true, messageCount: 5, unreadCount: 2 });
    expect(db.bookingMessage.count.mock.calls[1][0].where).toEqual({
      bookingId: 7,
      deletedAt: null,
      senderId: { not: mother.id },
      createdAt: { gt: lastReadAt },
    });
  });

  it('cannot send once the booking is over, and counts everything unread if never opened', async () => {
    db.booking.findUnique.mockResolvedValue(booking(BookingStatus.COMPLETED));
    db.bookingChatRead.findUnique.mockResolvedValue(null);
    db.bookingMessage.count.mockResolvedValueOnce(3).mockResolvedValueOnce(3);

    const res = await getBookingChatSummary(as('uid-nanny'), 7);

    expect(res).toEqual({ canSend: false, messageCount: 3, unreadCount: 3 });
    expect(db.bookingMessage.count.mock.calls[1][0].where).toEqual({
      bookingId: 7,
      deletedAt: null,
      senderId: { not: nanny.id },
    });
  });
});

describe('markBookingChatRead', () => {
  it('upserts the read marker for the caller', async () => {
    db.booking.findUnique.mockResolvedValue(booking(BookingStatus.COMPLETED));
    await expect(markBookingChatRead(as('uid-nanny'), 7)).resolves.toEqual({ read: true });
    expect(db.bookingChatRead.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { bookingId_userId: { bookingId: 7, userId: nanny.id } },
        create: expect.objectContaining({ bookingId: 7, userId: nanny.id }),
      }),
    );
  });
});

describe('listAdminBookingMessages', () => {
  it('returns the whole chat oldest first with sender roles', async () => {
    db.booking.findUnique.mockResolvedValue(booking(BookingStatus.COMPLETED));
    db.bookingMessage.findMany.mockResolvedValue([
      { id: 1, bookingId: 7, senderId: mother.id, content: 'a', createdAt: new Date('2026-10-15T10:00:00Z'), sender: mother },
      { id: 2, bookingId: 7, senderId: nanny.id, content: 'b', createdAt: new Date('2026-10-15T10:01:00Z'), sender: nanny },
    ]);

    const res = await listAdminBookingMessages(7);

    expect(res.hasMore).toBe(false);
    expect(res.messages.map((m) => m.sender.role)).toEqual(['MOTHER', 'NANNY']);
    expect(db.bookingMessage.findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: 'asc' });
  });

  it('404s an unknown booking', async () => {
    db.booking.findUnique.mockResolvedValue(null);
    await expect(listAdminBookingMessages(7)).rejects.toMatchObject({ statusCode: 404 });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @nanny-app/backend test:unit -- booking-chat.service`
Expected: FAIL with "Cannot find module '@backend/services/booking-chat.service'".

- [ ] **Step 3: Implement**

```ts
// apps/backend/src/services/booking-chat.service.ts
import {
  type BookingChatSummary,
  type BookingMessageHistoryQuery,
  type BookingMessageListResponse,
  type BookingMessageResponse,
  type SendBookingMessageRequest,
} from '@nanny-app/shared';
import {
  BookingStatus,
  NotificationReferenceType,
  NotificationType,
  type User,
} from '@prisma/client';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import type { DecodedIdToken } from '@backend/lib/firebase';
import { createInAppNotification, dispatchPush } from '@backend/services/notification.service';

const NOTIFICATION_PREVIEW_LENGTH = 100;

/** The most an admin transcript returns — far more than one shift produces. */
const ADMIN_TRANSCRIPT_LIMIT = 1000;

type ChatBooking = {
  id: number;
  status: BookingStatus;
  motherId: number;
  nannyProfile: { userId: number } | null;
};

type MessageRow = {
  id: number;
  bookingId: number;
  senderId: number;
  content: string;
  createdAt: Date;
  sender: Pick<User, 'id' | 'firstName' | 'lastName' | 'avatarUrl'>;
};

async function getUserByUid(uid: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { firebaseUid: uid } });
  if (!user || user.deletedAt) throw errors.unauthorized();
  return user;
}

async function findChatBooking(bookingId: number): Promise<ChatBooking> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId, deletedAt: null },
    select: { id: true, status: true, motherId: true, nannyProfile: { select: { userId: true } } },
  });
  if (!booking) throw errors.notFound('Booking not found.');
  return booking;
}

/**
 * The booking's mother or its *current* nanny. Anyone else — a nanny who was
 * reassigned off it included — gets the same 404 as a booking that doesn't
 * exist, so the chat can't be probed for.
 */
async function loadChatParticipant(decoded: DecodedIdToken, bookingId: number) {
  const user = await getUserByUid(decoded.uid);
  const booking = await findChatBooking(bookingId);
  const isMother = booking.motherId === user.id;
  const isNanny = booking.nannyProfile?.userId === user.id;
  if (!isMother && !isNanny) throw errors.notFound('Booking not found.');
  const otherUserId = isMother ? booking.nannyProfile?.userId ?? null : booking.motherId;
  return { user, booking, otherUserId };
}

function toMessageResponse(row: MessageRow, motherId: number): BookingMessageResponse {
  return {
    id: row.id,
    bookingId: row.bookingId,
    content: row.content,
    sender: {
      id: row.sender.id,
      firstName: row.sender.firstName,
      lastName: row.sender.lastName,
      avatarUrl: row.sender.avatarUrl,
      role: row.senderId === motherId ? 'MOTHER' : 'NANNY',
    },
    createdAt: row.createdAt.toISOString(),
  };
}

const messageInclude = {
  sender: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
} as const;

function previewOf(content: string): string {
  return content.length > NOTIFICATION_PREVIEW_LENGTH
    ? `${content.slice(0, NOTIFICATION_PREVIEW_LENGTH - 1)}…`
    : content;
}

async function notifyRecipient(
  bookingId: number,
  recipientId: number,
  senderFirstName: string,
  content: string,
): Promise<void> {
  const title = 'New message';
  const body = `${senderFirstName}: ${previewOf(content)}`;

  await createInAppNotification({
    userId: recipientId,
    type: NotificationType.BOOKING_MESSAGE,
    title,
    body,
    referenceId: bookingId,
    referenceType: NotificationReferenceType.BOOKING,
  });

  await dispatchPush(recipientId, {
    title,
    body,
    data: { type: 'BOOKING_MESSAGE', bookingId: String(bookingId) },
  });
}

function markRead(bookingId: number, userId: number, at: Date) {
  return prisma.bookingChatRead.upsert({
    where: { bookingId_userId: { bookingId, userId } },
    create: { bookingId, userId, lastReadAt: at },
    update: { lastReadAt: at, deletedAt: null },
  });
}

export async function listBookingMessages(
  decoded: DecodedIdToken,
  bookingId: number,
  query: BookingMessageHistoryQuery,
): Promise<BookingMessageListResponse> {
  const { booking } = await loadChatParticipant(decoded, bookingId);

  const rows = await prisma.bookingMessage.findMany({
    where: {
      bookingId,
      deletedAt: null,
      ...(query.cursor ? { createdAt: { lt: new Date(query.cursor) } } : {}),
    },
    include: messageInclude,
    orderBy: { createdAt: 'desc' },
    take: query.limit + 1,
  });

  const hasMore = rows.length > query.limit;
  const messages = rows
    .slice(0, query.limit)
    .reverse()
    .map((row) => toMessageResponse(row, booking.motherId));
  return { messages, hasMore };
}

export async function sendBookingMessage(
  decoded: DecodedIdToken,
  bookingId: number,
  body: SendBookingMessageRequest,
): Promise<BookingMessageResponse> {
  const { user, booking, otherUserId } = await loadChatParticipant(decoded, bookingId);

  if (booking.status !== BookingStatus.IN_PROGRESS) {
    throw errors.conflict('Messages can only be sent while the booking is in progress.');
  }

  const created = await prisma.bookingMessage.create({
    data: { bookingId, senderId: user.id, content: body.content },
    include: messageInclude,
  });
  await markRead(bookingId, user.id, created.createdAt);

  if (otherUserId !== null) {
    void notifyRecipient(bookingId, otherUserId, user.firstName, created.content).catch(
      () => undefined,
    );
  }

  return toMessageResponse(created, booking.motherId);
}

export async function markBookingChatRead(
  decoded: DecodedIdToken,
  bookingId: number,
): Promise<{ read: true }> {
  const { user } = await loadChatParticipant(decoded, bookingId);
  await markRead(bookingId, user.id, new Date());
  return { read: true };
}

export async function getBookingChatSummary(
  decoded: DecodedIdToken,
  bookingId: number,
): Promise<BookingChatSummary> {
  const { user, booking } = await loadChatParticipant(decoded, bookingId);

  const read = await prisma.bookingChatRead.findUnique({
    where: { bookingId_userId: { bookingId, userId: user.id } },
  });
  const lastReadAt = read && !read.deletedAt ? read.lastReadAt : null;

  const messageCount = await prisma.bookingMessage.count({
    where: { bookingId, deletedAt: null },
  });
  const unreadCount = await prisma.bookingMessage.count({
    where: {
      bookingId,
      deletedAt: null,
      senderId: { not: user.id },
      ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
    },
  });

  return { canSend: booking.status === BookingStatus.IN_PROGRESS, messageCount, unreadCount };
}

/** The console's read-only transcript. Section access is enforced by the admin router. */
export async function listAdminBookingMessages(
  bookingId: number,
): Promise<BookingMessageListResponse> {
  const booking = await findChatBooking(bookingId);

  const rows = await prisma.bookingMessage.findMany({
    where: { bookingId, deletedAt: null },
    include: messageInclude,
    orderBy: { createdAt: 'asc' },
    take: ADMIN_TRANSCRIPT_LIMIT,
  });

  return {
    messages: rows.map((row) => toMessageResponse(row, booking.motherId)),
    hasMore: rows.length === ADMIN_TRANSCRIPT_LIMIT,
  };
}
```

Note: `bookingChatRead.findUnique` returns a row that has `deletedAt`. The unit-test mock `{ lastReadAt }` has `deletedAt` undefined, which is falsy, so the test path holds.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @nanny-app/backend test:unit -- booking-chat.service && pnpm --filter @nanny-app/backend typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/booking-chat.service.ts apps/backend/src/__tests__/booking-chat.service.test.ts
git commit -m "feat(backend): booking chat service"
```

---

### Task 4: Routes, admin permission, integration journey

**Files:**
- Modify: `apps/backend/src/routes/booking.routes.ts` (after the care-log routes, ~line 535)
- Modify: `apps/backend/src/routes/admin.routes.ts` (after `adminRouter.get('/bookings/:id', …)`, ~line 238)
- Modify: `apps/backend/src/lib/admin-permissions.ts` (after the `'/bookings/:id/candidates'` row, line 71)
- Test: `apps/backend/src/__integration__/journeys/a33-booking-chat.test.ts`

**Interfaces:**
- Consumes: Task 3 service functions; Task 1 schemas.
- Produces the HTTP contract that Tasks 6 and 9 call:
  - `GET /bookings/:id/messages?limit&cursor` → `BookingMessageListResponse`
  - `POST /bookings/:id/messages` `{content}` → 201 `BookingMessageResponse`
  - `POST /bookings/:id/messages/read` → `{read:true}`
  - `GET /bookings/:id/messages/summary` → `BookingChatSummary`
  - `GET /admin/bookings/:id/messages` → `BookingMessageListResponse`

- [ ] **Step 1: Write the failing integration journey**

```ts
// apps/backend/src/__integration__/journeys/a33-booking-chat.test.ts
/**
 * A33 — mother and nanny chat on a running booking; the console reads it.
 *
 * Sending is open only while the booking is IN_PROGRESS. Reading follows the
 * booking's current nanny, so a nanny reassigned off it loses the chat, and an
 * outsider can't tell the booking exists.
 */
import request from 'supertest';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';

import { authHeader } from '../../../test/auth';
import { makeAdmin, makeBooking, makeMother, makeNanny } from '../../../test/factories';

async function setUp(status: 'IN_PROGRESS' | 'CONFIRMED' | 'COMPLETED' = 'IN_PROGRESS') {
  const mother = await makeMother();
  const nanny = await makeNanny();
  const booking = await makeBooking({
    motherId: mother.id,
    nannyProfileId: nanny.nannyProfileId,
    status,
  });
  return { mother, nanny, booking };
}

async function waitForNotification(userId: number) {
  for (let i = 0; i < 20; i++) {
    const note = await prisma.notification.findFirst({ where: { userId, type: 'BOOKING_MESSAGE' } });
    if (note) return note;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

describe('A33 — booking chat', () => {
  it('lets them talk during the shift, with unread counts and a notification', async () => {
    const { mother, nanny, booking } = await setUp();

    const sent = await request(app)
      .post(`/bookings/${booking.id}/messages`)
      .set(...authHeader(mother.token))
      .send({ content: '  Nap at 1pm please  ' });
    expect(sent.status).toBe(201);
    expect(sent.body.data.content).toBe('Nap at 1pm please');
    expect(sent.body.data.sender.role).toBe('MOTHER');

    const note = await waitForNotification(nanny.id);
    expect(note?.referenceId).toBe(booking.id);
    expect(note?.body).toMatch(/: Nap at 1pm please$/);

    const before = await request(app)
      .get(`/bookings/${booking.id}/messages/summary`)
      .set(...authHeader(nanny.token));
    expect(before.body.data).toEqual({ canSend: true, messageCount: 1, unreadCount: 1 });

    const reply = await request(app)
      .post(`/bookings/${booking.id}/messages`)
      .set(...authHeader(nanny.token))
      .send({ content: 'Will do' });
    expect(reply.body.data.sender.role).toBe('NANNY');

    // Replying marks her own side read.
    const after = await request(app)
      .get(`/bookings/${booking.id}/messages/summary`)
      .set(...authHeader(nanny.token));
    expect(after.body.data.unreadCount).toBe(0);

    const motherSummary = await request(app)
      .get(`/bookings/${booking.id}/messages/summary`)
      .set(...authHeader(mother.token));
    expect(motherSummary.body.data.unreadCount).toBe(1);

    await request(app)
      .post(`/bookings/${booking.id}/messages/read`)
      .set(...authHeader(mother.token))
      .expect(200);
    const read = await request(app)
      .get(`/bookings/${booking.id}/messages/summary`)
      .set(...authHeader(mother.token));
    expect(read.body.data.unreadCount).toBe(0);

    const thread = await request(app)
      .get(`/bookings/${booking.id}/messages`)
      .set(...authHeader(mother.token));
    expect(thread.body.data.messages.map((m: { content: string }) => m.content)).toEqual([
      'Nap at 1pm please',
      'Will do',
    ]);
    expect(thread.body.data.hasMore).toBe(false);
  });

  it('pages back through older messages', async () => {
    const { mother, booking } = await setUp();
    for (const content of ['one', 'two', 'three']) {
      await request(app)
        .post(`/bookings/${booking.id}/messages`)
        .set(...authHeader(mother.token))
        .send({ content });
    }

    const latest = await request(app)
      .get(`/bookings/${booking.id}/messages?limit=2`)
      .set(...authHeader(mother.token));
    expect(latest.body.data.messages.map((m: { content: string }) => m.content)).toEqual(['two', 'three']);
    expect(latest.body.data.hasMore).toBe(true);

    const cursor = latest.body.data.messages[0].createdAt;
    const older = await request(app)
      .get(`/bookings/${booking.id}/messages?limit=2&cursor=${encodeURIComponent(cursor)}`)
      .set(...authHeader(mother.token));
    expect(older.body.data.messages.map((m: { content: string }) => m.content)).toEqual(['one']);
    expect(older.body.data.hasMore).toBe(false);
  });

  it('refuses to send outside the shift but still shows the history', async () => {
    const { mother, booking } = await setUp('IN_PROGRESS');
    await request(app)
      .post(`/bookings/${booking.id}/messages`)
      .set(...authHeader(mother.token))
      .send({ content: 'before it ended' });
    await prisma.booking.update({ where: { id: booking.id }, data: { status: 'COMPLETED' } });

    const res = await request(app)
      .post(`/bookings/${booking.id}/messages`)
      .set(...authHeader(mother.token))
      .send({ content: 'too late' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Messages can only be sent while the booking is in progress.');

    const summary = await request(app)
      .get(`/bookings/${booking.id}/messages/summary`)
      .set(...authHeader(mother.token));
    expect(summary.body.data).toMatchObject({ canSend: false, messageCount: 1 });
  });

  it('refuses before the shift starts', async () => {
    const { nanny, booking } = await setUp('CONFIRMED');
    const res = await request(app)
      .post(`/bookings/${booking.id}/messages`)
      .set(...authHeader(nanny.token))
      .send({ content: 'On my way' });
    expect(res.status).toBe(409);
  });

  it('rejects an empty or oversize message without storing it', async () => {
    const { mother, booking } = await setUp();
    for (const content of ['   ', 'a'.repeat(2001)]) {
      const res = await request(app)
        .post(`/bookings/${booking.id}/messages`)
        .set(...authHeader(mother.token))
        .send({ content });
      expect(res.status).toBe(400);
    }
    expect(await prisma.bookingMessage.count({ where: { bookingId: booking.id } })).toBe(0);
  });

  it('hides the chat from an outsider and from a nanny reassigned off the booking', async () => {
    const { mother, nanny, booking } = await setUp();
    await request(app)
      .post(`/bookings/${booking.id}/messages`)
      .set(...authHeader(mother.token))
      .send({ content: 'hello' });

    const outsider = await makeMother();
    const peek = await request(app)
      .get(`/bookings/${booking.id}/messages`)
      .set(...authHeader(outsider.token));
    expect(peek.status).toBe(404);

    const replacement = await makeNanny();
    await prisma.booking.update({
      where: { id: booking.id },
      data: { nannyProfileId: replacement.nannyProfileId },
    });

    const old = await request(app)
      .get(`/bookings/${booking.id}/messages`)
      .set(...authHeader(nanny.token));
    expect(old.status).toBe(404);

    const current = await request(app)
      .get(`/bookings/${booking.id}/messages`)
      .set(...authHeader(replacement.token));
    expect(current.body.data.messages).toHaveLength(1);
  });

  it('lets the console read the transcript', async () => {
    const { mother, nanny, booking } = await setUp();
    await request(app).post(`/bookings/${booking.id}/messages`).set(...authHeader(mother.token)).send({ content: 'hi' });
    await request(app).post(`/bookings/${booking.id}/messages`).set(...authHeader(nanny.token)).send({ content: 'hello' });

    const admin = await makeAdmin();
    const res = await request(app)
      .get(`/admin/bookings/${booking.id}/messages`)
      .set(...authHeader(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.data.messages.map((m: { sender: { role: string } }) => m.sender.role)).toEqual([
      'MOTHER',
      'NANNY',
    ]);

    // The console has no way to post.
    const post = await request(app)
      .post(`/admin/bookings/${booking.id}/messages`)
      .set(...authHeader(admin.token))
      .send({ content: 'x' });
    expect(post.status).not.toBe(201);
  });
});
```

- [ ] **Step 2: Start the test stack and verify the journey fails**

Run from the repo root, in tmux per the user's rule:
`mkdir -p ~/logs && tmux kill-session -t nanny-app-test-env 2>/dev/null; tmux new -d -s nanny-app-test-env "pnpm test:env 2>&1 | tee ~/logs/nanny-app-test-env.log"`
Wait for readiness (`tail ~/logs/nanny-app-test-env.log`), then:
`pnpm --filter @nanny-app/backend test:integration -- a33-booking-chat`
Expected: FAIL with 404s, because the routes don't exist yet.

- [ ] **Step 3: Add the mobile routes**

In `booking.routes.ts`, extend the `@nanny-app/shared` import with `BookingMessageHistoryQuerySchema, SendBookingMessageSchema`, and add:

```ts
import {
  getBookingChatSummary,
  listBookingMessages,
  markBookingChatRead,
  sendBookingMessage,
} from '@backend/services/booking-chat.service';
```

Make sure `validateQuery` is imported from `@backend/middleware/validate.middleware` alongside `validateBody`. Then add these after the `'/:id/care-logs'` POST route:

```ts
bookingRouter.get(
  '/:id/messages',
  requireAuth,
  validateQuery(BookingMessageHistoryQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const query = res.locals['validatedQuery'] as ReturnType<
        typeof BookingMessageHistoryQuerySchema.parse
      >;
      res.json(ok(await listBookingMessages(req.firebaseUser, routeIdParam(req.params['id']), query)));
    } catch (err) { next(err); }
  },
);

bookingRouter.get(
  '/:id/messages/summary',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      res.json(ok(await getBookingChatSummary(req.firebaseUser, routeIdParam(req.params['id']))));
    } catch (err) { next(err); }
  },
);

bookingRouter.post(
  '/:id/messages',
  requireAuth,
  validateBody(SendBookingMessageSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const message = await sendBookingMessage(req.firebaseUser, routeIdParam(req.params['id']), req.body);
      res.status(201).json(ok(message));
    } catch (err) { next(err); }
  },
);

bookingRouter.post(
  '/:id/messages/read',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      res.json(ok(await markBookingChatRead(req.firebaseUser, routeIdParam(req.params['id']))));
    } catch (err) { next(err); }
  },
);
```

- [ ] **Step 4: Add the admin route and its permission row**

In `admin.routes.ts`, import `listAdminBookingMessages` from `@backend/services/booking-chat.service`, then add after the `'/bookings/:id'` GET:

```ts
adminRouter.get('/bookings/:id/messages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(ok(await listAdminBookingMessages(routeIdParam(req.params.id))));
  } catch (err) {
    next(err);
  }
});
```

In `admin-permissions.ts`, after the `'/bookings/:id/candidates'` row:

```ts
  { method: 'GET', pattern: '/bookings/:id/messages', requires: section('bookings', 'VIEW') },
```

- [ ] **Step 5: Verify**

Run: `pnpm --filter @nanny-app/backend test:integration -- a33-booking-chat`, then `pnpm --filter @nanny-app/backend test:unit -- admin-permissions`, then `pnpm --filter @nanny-app/backend test:integration -- a12-operator-access-matrix`.
Expected: all PASS. The permissions test walks the router, so it proves the new row exists. If the journey's `makeAdmin` signature differs (check `test/factories/user.ts`), adjust the call; don't hand-build the user.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/routes apps/backend/src/lib/admin-permissions.ts apps/backend/src/__integration__/journeys/a33-booking-chat.test.ts
git commit -m "feat(backend): booking chat routes and console transcript"
```

---

### Task 5: Extract shared chat components (no visible change)

**Files:**
- Create: `apps/mobile/src/components/chat/MessageBubble.tsx`, `DateDivider.tsx`, `ChatComposer.tsx`, `groupMessagesByDay.ts`, `chat.styles.ts`, `index.ts`
- Modify: `apps/mobile/src/screens/parent/ChatThreadScreen.tsx`, `apps/mobile/src/screens/parent/styles/chat-thread-screen.styles.ts` (delete the moved keys)
- Test: `apps/mobile/src/components/chat/__tests__/chat.test.tsx`

**Interfaces:**
- Produces:
  - `groupMessagesByDay<T extends { createdAt: string }>(messages: T[]): { date: string; items: T[] }[]`
  - `formatMessageTime(iso: string): string`
  - `formatDateDivider(iso: string, now?: Date): string`
  - `<DateDivider date={iso} />`
  - `<MessageBubble content sent time testID? />`
  - `<ChatComposer value onChangeText onSend sending placeholder? />`. It owns the keyboard-aware bottom padding and the `chatThread.message` / `chatThread.send` testIDs, which existing Maestro flows use.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/components/chat/__tests__/chat.test.tsx
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import {
  ChatComposer,
  MessageBubble,
  formatDateDivider,
  groupMessagesByDay,
} from '@mobile/components/chat';

describe('groupMessagesByDay', () => {
  it('starts a new group on each calendar day, keeping order', () => {
    const groups = groupMessagesByDay([
      { id: 1, createdAt: '2026-10-14T09:00:00' },
      { id: 2, createdAt: '2026-10-14T18:00:00' },
      { id: 3, createdAt: '2026-10-15T08:00:00' },
    ]);
    expect(groups.map((g) => g.items.map((m) => m.id))).toEqual([[1, 2], [3]]);
  });
});

describe('formatDateDivider', () => {
  const now = new Date('2026-10-15T12:00:00');
  it('says Today and Yesterday', () => {
    expect(formatDateDivider('2026-10-15T08:00:00', now)).toBe('Today');
    expect(formatDateDivider('2026-10-14T08:00:00', now)).toBe('Yesterday');
  });
});

describe('ChatComposer', () => {
  it('sends only when there is text, and labels the send button', () => {
    const onSend = jest.fn();
    const screen = render(
      <ChatComposer value="" onChangeText={jest.fn()} onSend={onSend} sending={false} />,
    );
    fireEvent.press(screen.getByLabelText('Send message'));
    expect(onSend).not.toHaveBeenCalled();

    screen.rerender(
      <ChatComposer value="hi" onChangeText={jest.fn()} onSend={onSend} sending={false} />,
    );
    fireEvent.press(screen.getByLabelText('Send message'));
    expect(onSend).toHaveBeenCalledTimes(1);
  });
});

it('renders a bubble with its time', () => {
  const screen = render(<MessageBubble content="On our way" sent time="10:05 AM" />);
  expect(screen.getByText('On our way')).toBeTruthy();
  expect(screen.getByText('10:05 AM')).toBeTruthy();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @nanny-app/mobile test -- components/chat`
Expected: FAIL with "Cannot find module '@mobile/components/chat'".

- [ ] **Step 3: Implement the components**

Move these keys verbatim from `chat-thread-screen.styles.ts` into `components/chat/chat.styles.ts`: `dateDividerWrap`, `dateDivider`, `dateDividerText`, `messageBubbleWrap`, `messageReceived`, `messageSent`, `messageBubble`, `bubbleReceived`, `bubbleSent`, `messageText`, `messageTextReceived`, `messageTextSent`, `timeRow`, `timeRowReceived`, `timeRowSent`, `timeText`, `footer`, `input`, `sendBtn`, `sendBtnDisabled`. Keep the same imports from `@mobile/theme`, and delete them from the screen's style file. Then add one key that's needed for 44 dp targets and font scaling:

```ts
  // In chat.styles.ts — replace input's fixed `height` with minHeight so 1.3× text isn't clipped.
  input: {
    flex: 1,
    minHeight: spacing['4xl'],
    maxHeight: spacing['4xl'] * 3,
    backgroundColor: colors.taupe,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.textDark,
  },
```

```ts
// apps/mobile/src/components/chat/groupMessagesByDay.ts
export function groupMessagesByDay<T extends { createdAt: string }>(
  messages: readonly T[],
): { date: string; items: T[] }[] {
  const groups: { date: string; items: T[] }[] = [];
  for (const message of messages) {
    const dayKey = new Date(message.createdAt).toDateString();
    const last = groups[groups.length - 1];
    if (last && new Date(last.date).toDateString() === dayKey) {
      last.items.push(message);
    } else {
      groups.push({ date: message.createdAt, items: [message] });
    }
  }
  return groups;
}

export function formatMessageTime(isoDate: string): string {
  return new Date(isoDate).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatDateDivider(isoDate: string, now: Date = new Date()): string {
  const date = new Date(isoDate);
  if (date.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
```

```tsx
// apps/mobile/src/components/chat/DateDivider.tsx
import React from 'react';
import { View } from 'react-native';

import { Text } from '@mobile/components/ui/text';
import { formatDateDivider } from './groupMessagesByDay';
import { styles } from './chat.styles';

export function DateDivider({ date }: { date: string }) {
  return (
    <View style={styles.dateDividerWrap}>
      <View style={styles.dateDivider}>
        <Text style={styles.dateDividerText}>{formatDateDivider(date)}</Text>
      </View>
    </View>
  );
}
```

```tsx
// apps/mobile/src/components/chat/MessageBubble.tsx
import React from 'react';
import { View } from 'react-native';

import { Text } from '@mobile/components/ui/text';
import { styles } from './chat.styles';

interface MessageBubbleProps {
  content: string;
  /** True for the signed-in user's own messages (right, filled). */
  sent: boolean;
  time: string;
}

export function MessageBubble({ content, sent, time }: MessageBubbleProps) {
  return (
    <View style={[styles.messageBubbleWrap, sent ? styles.messageSent : styles.messageReceived]}>
      <View style={[styles.messageBubble, sent ? styles.bubbleSent : styles.bubbleReceived]}>
        <Text style={[styles.messageText, sent ? styles.messageTextSent : styles.messageTextReceived]}>
          {content}
        </Text>
      </View>
      <View style={[styles.timeRow, sent ? styles.timeRowSent : styles.timeRowReceived]}>
        <Text style={styles.timeText}>{time}</Text>
      </View>
    </View>
  );
}
```

```tsx
// apps/mobile/src/components/chat/ChatComposer.tsx
import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { TextInput } from '@mobile/components/ui/text';
import { useBottomBarPadding } from '@mobile/hooks/useBottomInset';
import { useKeyboardVisible } from '@mobile/hooks/useKeyboardVisible';
import { colors, spacing } from '@mobile/theme';
import { styles } from './chat.styles';

interface ChatComposerProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  sending: boolean;
  placeholder?: string;
  maxLength?: number;
}

/**
 * The message box pinned under a chat. The keyboard covers the system bar, so
 * it clears that bar only while the keyboard is down.
 */
export function ChatComposer({
  value,
  onChangeText,
  onSend,
  sending,
  placeholder = 'Write a message...',
  maxLength,
}: ChatComposerProps) {
  const keyboardVisible = useKeyboardVisible();
  const restingPadding = useBottomBarPadding(spacing.md);
  const canSend = value.trim().length > 0 && !sending;

  return (
    <View style={[styles.footer, { paddingBottom: keyboardVisible ? spacing.sm : restingPadding }]}>
      <TextInput
        testID="chatThread.message"
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={colors.textPlaceholder}
        value={value}
        onChangeText={onChangeText}
        multiline
        maxLength={maxLength}
        editable={!sending}
        accessibilityLabel="Message"
      />
      <Pressable
        testID="chatThread.send"
        style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
        onPress={() => {
          if (canSend) onSend();
        }}
        disabled={!canSend}
        accessibilityRole="button"
        accessibilityLabel="Send message"
        accessibilityState={{ disabled: !canSend }}
      >
        <Ionicons name="send" size={20} color={colors.white} />
      </Pressable>
    </View>
  );
}
```

Note: the test presses a disabled `Pressable`; RNTL doesn't fire `onPress` on a disabled one, and the `canSend` guard backs that up.

```ts
// apps/mobile/src/components/chat/index.ts
export { ChatComposer } from './ChatComposer';
export { DateDivider } from './DateDivider';
export { MessageBubble } from './MessageBubble';
export { formatDateDivider, formatMessageTime, groupMessagesByDay } from './groupMessagesByDay';
```

- [ ] **Step 4: Refactor `ChatThreadScreen` onto them**

In `ChatThreadScreen.tsx`:
- Delete the local `formatMessageTime`, `formatDateDivider` and `groupedMessages` `useMemo` body, the bubble JSX, and the footer JSX, along with the now-unused `useBottomBarPadding` / `useKeyboardVisible` / `bottomPadding` / `TextInput` imports.
- Import from `@mobile/components/chat`.
- Replace the date group map with:

```tsx
        {groupMessagesByDay(messages).map((group) => (
          <View key={group.date}>
            <DateDivider date={group.date} />
            {group.items.map((msg) => (
              <MessageBubble
                key={msg.id}
                content={msg.content}
                sent={msg.sender.id === currentUserId}
                time={formatMessageTime(msg.createdAt)}
              />
            ))}
          </View>
        ))}
```

Replace the footer `View` with:

```tsx
      <ChatComposer
        value={messageText}
        onChangeText={setMessageText}
        onSend={() => void handleSend()}
        sending={sendMessage.isPending}
      />
```

Remove the `useMemo` import if nothing else uses it.

- [ ] **Step 5: Verify**

Run: `pnpm --filter @nanny-app/mobile test -- components/chat ChatThread && pnpm --filter @nanny-app/mobile typecheck && pnpm --filter @nanny-app/mobile test -- layout-guards`
Expected: PASS. Also run `pnpm --filter @nanny-app/mobile lint` to catch unused imports.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/chat apps/mobile/src/screens/parent/ChatThreadScreen.tsx apps/mobile/src/screens/parent/styles/chat-thread-screen.styles.ts
git commit -m "refactor(mobile): extract chat bubbles, divider and composer"
```

---

### Task 6: Booking chat hooks and screen, both roles

**Files:**
- Create: `apps/mobile/src/hooks/useBookingChat.ts`
- Modify: `apps/mobile/src/store/messagingStore.ts`
- Create: `apps/mobile/src/screens/BookingChatScreen.tsx`, `apps/mobile/src/screens/styles/booking-chat-screen.styles.ts`
- Create: `apps/mobile/app/(parent)/book/booking-chat.tsx`, `apps/mobile/app/(nanny)/booking-chat.tsx`
- Modify: `apps/mobile/app/(nanny)/_layout.tsx`
- Test: `apps/mobile/src/screens/__tests__/BookingChatScreen.test.tsx`

**Interfaces:**
- Consumes: Task 4 HTTP contract; Task 5 components; `useBooking(id)` from `@mobile/hooks/useBookings`, which returns `BookingResponse` with `nanny`, `motherFirstName`, `motherLastName` and `date`; `useUserProfileStore` (`profile.id`, `profile.role`); `bookingDayLabel(date)` from `@mobile/lib/bookingDetail`.
- Produces:
  - `BOOKING_CHAT_KEY = 'booking-chat'`
  - `useBookingChatSummary(bookingId?: number)`
  - `useBookingMessages(bookingId?: number)`
  - `useSendBookingMessage(bookingId: number)`
  - `useMarkBookingChatRead(bookingId: number)`
  - `useMessagingStore` gains `activeBookingChatId: string | null` and `setActiveBookingChatId(id: string | null)`.
  - Routes `/(parent)/book/booking-chat?bookingId=` and `/(nanny)/booking-chat?bookingId=`.

- [ ] **Step 1: Write the failing screen test**

```tsx
// apps/mobile/src/screens/__tests__/BookingChatScreen.test.tsx
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { BookingChatSummary, BookingMessageResponse } from '@nanny-app/shared';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), canGoBack: () => true, replace: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: '7' }),
}));
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useIsFocused: () => true,
}));

import { api } from '@mobile/lib/api';
import BookingChatScreen from '@mobile/screens/BookingChatScreen';
import { useMessagingStore } from '@mobile/store/messagingStore';
import { useUserProfileStore } from '@mobile/store/userProfileStore';

const BOOKING = {
  id: 7,
  status: 'IN_PROGRESS',
  date: '2026-10-15',
  motherFirstName: 'Mona',
  motherLastName: 'Adel',
  nanny: { firstName: 'Sara', lastName: 'Nabil' },
};

function msg(id: number, senderId: number, content: string): BookingMessageResponse {
  return {
    id,
    bookingId: 7,
    content,
    sender: { id: senderId, firstName: senderId === 1 ? 'Mona' : 'Sara', lastName: '', avatarUrl: null, role: senderId === 1 ? 'MOTHER' : 'NANNY' },
    createdAt: '2026-10-15T10:00:00.000Z',
  };
}

function renderScreen(summary: BookingChatSummary, messages: BookingMessageResponse[] = []) {
  (api.get as jest.Mock).mockImplementation((url: string) => {
    const routes: Record<string, unknown> = {
      '/bookings/7': BOOKING,
      '/bookings/7/messages': { messages, hasMore: false },
      '/bookings/7/messages/summary': summary,
    };
    return Promise.resolve({ data: { data: routes[url] ?? null, error: null } });
  });
  (api.post as jest.Mock).mockResolvedValue({ data: { data: { read: true }, error: null } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <BookingChatScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useUserProfileStore.setState({ profile: { id: 1, role: 'MOTHER' } as never });
});

it('titles the chat with the other person and shows the thread', async () => {
  const screen = renderScreen(
    { canSend: true, messageCount: 2, unreadCount: 1 },
    [msg(1, 1, 'Nap at 1pm please'), msg(2, 2, 'Will do')],
  );
  expect(await screen.findByText('Sara Nabil')).toBeTruthy();
  expect(screen.getByText('Nap at 1pm please')).toBeTruthy();
  expect(screen.getByText('Will do')).toBeTruthy();
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/bookings/7/messages/read'));
  expect(useMessagingStore.getState().activeBookingChatId).toBe('7');
});

it('sends a message while the shift runs', async () => {
  const screen = renderScreen({ canSend: true, messageCount: 0, unreadCount: 0 });
  fireEvent.changeText(await screen.findByLabelText('Message'), 'On our way back');
  (api.post as jest.Mock).mockResolvedValueOnce({ data: { data: msg(3, 1, 'On our way back'), error: null } });
  fireEvent.press(screen.getByLabelText('Send message'));
  await waitFor(() =>
    expect(api.post).toHaveBeenCalledWith('/bookings/7/messages', { content: 'On our way back' }),
  );
});

it('shows the read-only note instead of the composer after the booking', async () => {
  const screen = renderScreen({ canSend: false, messageCount: 1, unreadCount: 0 }, [msg(1, 2, 'Bye')]);
  expect(await screen.findByText('This booking has ended — messages are read-only.')).toBeTruthy();
  expect(screen.queryByLabelText('Send message')).toBeNull();
});

it('keeps the text and says why when a send is refused', async () => {
  const screen = renderScreen({ canSend: true, messageCount: 0, unreadCount: 0 });
  fireEvent.changeText(await screen.findByLabelText('Message'), 'Still there?');
  (api.post as jest.Mock).mockResolvedValueOnce({
    data: { data: null, error: 'Messages can only be sent while the booking is in progress.' },
  });
  fireEvent.press(screen.getByLabelText('Send message'));
  expect(
    await screen.findByText('Messages can only be sent while the booking is in progress.'),
  ).toBeTruthy();
  expect(screen.getByDisplayValue('Still there?')).toBeTruthy();
});
```

Check `jest.setup.js` for how `@mobile/lib/api` is mocked; `BookingDetailScreen.test.tsx` relies on `api.get` already being a `jest.fn`. If `api.post` isn't mocked globally, add `jest.mock('@mobile/lib/api', …)` in this file, mirroring the global shape.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @nanny-app/mobile test -- BookingChatScreen`
Expected: FAIL with "Cannot find module '@mobile/screens/BookingChatScreen'".

- [ ] **Step 3: Implement the store, hooks and screen**

```ts
// apps/mobile/src/store/messagingStore.ts
import { create } from 'zustand';

interface MessagingState {
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
  /** The booking whose chat is on screen, so its pushes refresh rather than notify. */
  activeBookingChatId: string | null;
  setActiveBookingChatId: (id: string | null) => void;
}

export const useMessagingStore = create<MessagingState>((set) => ({
  activeConversationId: null,
  setActiveConversationId: (id) => set({ activeConversationId: id }),
  activeBookingChatId: null,
  setActiveBookingChatId: (id) => set({ activeBookingChatId: id }),
}));
```

```ts
// apps/mobile/src/hooks/useBookingChat.ts
import { useIsFocused } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BookingChatSummary,
  BookingMessageListResponse,
  BookingMessageResponse,
  SendBookingMessageRequest,
} from '@nanny-app/shared';

import { api, unwrap } from '@mobile/lib/api';

export const BOOKING_CHAT_KEY = 'booking-chat';

/** Can she send, how many messages, how many unread — for the entry card. */
export function useBookingChatSummary(bookingId: number | undefined) {
  const isFocused = useIsFocused();
  return useQuery({
    queryKey: [BOOKING_CHAT_KEY, 'summary', bookingId],
    queryFn: () => unwrap<BookingChatSummary>(api.get(`/bookings/${bookingId}/messages/summary`)),
    enabled: !!bookingId,
    refetchInterval: isFocused ? 10_000 : false,
    refetchIntervalInBackground: false,
  });
}

export function useBookingMessages(bookingId: number | undefined) {
  const isFocused = useIsFocused();
  return useQuery({
    queryKey: [BOOKING_CHAT_KEY, 'messages', bookingId],
    queryFn: () =>
      unwrap<BookingMessageListResponse>(
        api.get(`/bookings/${bookingId}/messages`, { params: { limit: 100 } }),
      ),
    enabled: !!bookingId,
    refetchInterval: isFocused ? 5_000 : false,
    refetchIntervalInBackground: false,
  });
}

export function useSendBookingMessage(bookingId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SendBookingMessageRequest) =>
      unwrap<BookingMessageResponse>(api.post(`/bookings/${bookingId}/messages`, body)),
    onSettled: () => {
      // A refusal (the shift just ended) should also flip the screen to read-only.
      void queryClient.invalidateQueries({ queryKey: [BOOKING_CHAT_KEY] });
    },
  });
}

export function useMarkBookingChatRead(bookingId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap<{ read: true }>(api.post(`/bookings/${bookingId}/messages/read`)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BOOKING_CHAT_KEY, 'summary', bookingId] });
    },
  });
}
```

Note: the test asserts `api.get` was called with exactly `'/bookings/7/messages'` as its first argument. The routes map keys on `url` only, so the `params` second argument is fine.

```ts
// apps/mobile/src/screens/styles/booking-chat-screen.styles.ts
import { StyleSheet } from 'react-native';

import { borderRadius, colors, screenPadding, spacing, typeScale } from '@mobile/theme';

export const styles = StyleSheet.create({
  body: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing['3xl'],
    paddingHorizontal: spacing.lg,
  },
  emptyText: {
    ...typeScale.bodySm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  sendError: {
    ...typeScale.bodySm,
    color: colors.error,
    paddingHorizontal: screenPadding,
    paddingTop: spacing.xs,
  },
  closedNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: screenPadding,
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.xl,
  },
  closedNoteText: {
    ...typeScale.bodySm,
    color: colors.textSecondary,
    flexShrink: 1,
  },
});
```

Before using them, check that `spacing['3xl']`, `colors.surfaceMuted`, `colors.textSecondary` and `colors.error` exist in `src/theme`. If one doesn't, use the nearest existing token; never add one.

```tsx
// apps/mobile/src/screens/BookingChatScreen.tsx
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BOOKING_MESSAGE_MAX_LENGTH } from '@nanny-app/shared';

import { ChatComposer, DateDivider, MessageBubble, formatMessageTime, groupMessagesByDay } from '@mobile/components/chat';
import { KeyboardAvoidingView, ScreenContainer, StackHeader } from '@mobile/components/ui';
import { Text } from '@mobile/components/ui/text';
import { useBooking } from '@mobile/hooks/useBookings';
import {
  useBookingChatSummary,
  useBookingMessages,
  useMarkBookingChatRead,
  useSendBookingMessage,
} from '@mobile/hooks/useBookingChat';
import { useBottomBarPadding } from '@mobile/hooks/useBottomInset';
import { bookingDayLabel } from '@mobile/lib/bookingDetail';
import { useMessagingStore } from '@mobile/store/messagingStore';
import { useUserProfileStore } from '@mobile/store/userProfileStore';
import { colors, spacing } from '@mobile/theme';
import { styles } from './styles/booking-chat-screen.styles';

/**
 * The chat between a booking's mother and its nanny — one screen for both.
 * Open for sending only while the shift runs; before and after, the thread
 * stays readable and the composer gives way to a note saying why.
 */
export default function BookingChatScreen() {
  const router = useRouter();
  const { bookingId: bookingIdParam } = useLocalSearchParams<{ bookingId?: string }>();
  const bookingId = Number(bookingIdParam);
  const currentUserId = useUserProfileStore((s) => s.profile?.id);
  const role = useUserProfileStore((s) => s.profile?.role);
  const setActiveBookingChatId = useMessagingStore((s) => s.setActiveBookingChatId);
  const closedPadding = useBottomBarPadding(spacing.md);

  const { data: booking } = useBooking(bookingId || undefined);
  const { data: summary } = useBookingChatSummary(bookingId || undefined);
  const { data: messagesData, isLoading } = useBookingMessages(bookingId || undefined);
  const send = useSendBookingMessage(bookingId);
  const markRead = useMarkBookingChatRead(bookingId);

  const [text, setText] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const messages = messagesData?.messages ?? [];
  const lastMessageId = messages[messages.length - 1]?.id;

  useEffect(() => {
    if (!bookingIdParam) return;
    setActiveBookingChatId(bookingIdParam);
    return () => setActiveBookingChatId(null);
  }, [bookingIdParam, setActiveBookingChatId]);

  // Opening the chat, and every new message while it is open, counts as read.
  useEffect(() => {
    if (bookingId) markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, lastMessageId]);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
  };

  const handleSend = () => {
    const content = text.trim();
    if (!content || send.isPending) return;
    send.mutate({ content }, { onSuccess: () => setText('') });
  };

  const isMother = role === 'MOTHER';
  const otherName = booking
    ? isMother
      ? `${booking.nanny?.firstName ?? ''} ${booking.nanny?.lastName ?? ''}`.trim() || 'Your nanny'
      : `${booking.motherFirstName} ${booking.motherLastName}`.trim()
    : 'Messages';

  const closedNote =
    booking && ['PENDING', 'APPROVED', 'PENDING_CONFIRMATION', 'CONFIRMED'].includes(booking.status)
      ? 'You can message once the shift starts.'
      : 'This booking has ended — messages are read-only.';

  return (
    <ScreenContainer useSafeArea={false}>
      <StackHeader
        title={otherName}
        subtitle={booking ? bookingDayLabel(booking.date) : undefined}
        onBack={handleBack}
      />
      <KeyboardAvoidingView style={styles.body} keyboardVerticalOffset={0}>
        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
          >
            {messages.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="chatbubbles-outline" size={28} color={colors.textMuted} />
                <Text style={styles.emptyText}>
                  {summary?.canSend
                    ? 'No messages yet. Say hello, or share an update about the day.'
                    : 'No messages on this booking.'}
                </Text>
              </View>
            ) : (
              groupMessagesByDay(messages).map((group) => (
                <View key={group.date}>
                  <DateDivider date={group.date} />
                  {group.items.map((m) => (
                    <MessageBubble
                      key={m.id}
                      content={m.content}
                      sent={m.sender.id === currentUserId}
                      time={formatMessageTime(m.createdAt)}
                    />
                  ))}
                </View>
              ))
            )}
          </ScrollView>
        )}

        {send.error ? <Text style={styles.sendError}>{send.error.message}</Text> : null}

        {summary?.canSend ? (
          <ChatComposer
            value={text}
            onChangeText={setText}
            onSend={handleSend}
            sending={send.isPending}
            maxLength={BOOKING_MESSAGE_MAX_LENGTH}
          />
        ) : summary ? (
          <View style={[styles.closedNote, { marginBottom: closedPadding }]}>
            <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
            <Text style={styles.closedNoteText}>{closedNote}</Text>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
```

Routes:

```tsx
// apps/mobile/app/(parent)/book/booking-chat.tsx
import BookingChatScreen from '@mobile/screens/BookingChatScreen';
export default BookingChatScreen;
```

```tsx
// apps/mobile/app/(nanny)/booking-chat.tsx
import BookingChatScreen from '@mobile/screens/BookingChatScreen';
export default BookingChatScreen;
```

In `app/(nanny)/_layout.tsx`, add after the `booking-detail` screen:

```tsx
        <Tabs.Screen name="booking-chat" options={{ href: null }} />
```

Check `app/(parent)/book/_layout.tsx`. If it lists screens explicitly, add `booking-chat` there with the same options as `booking-detail`.

- [ ] **Step 4: Verify**

Run: `pnpm --filter @nanny-app/mobile test -- BookingChatScreen && pnpm --filter @nanny-app/mobile typecheck && pnpm --filter @nanny-app/mobile lint`
Expected: PASS. If `tsc` rejects the new typed routes, run `npx expo start` once in `apps/mobile` (in tmux: `tmux new -d -s nanny-app-expo-types "cd apps/mobile && npx expo start 2>&1 | tee ~/logs/nanny-app-expo-types.log"`), wait until `.expo/types` is regenerated, kill the session, and re-run `tsc`.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/hooks/useBookingChat.ts apps/mobile/src/store/messagingStore.ts apps/mobile/src/screens/BookingChatScreen.tsx apps/mobile/src/screens/styles/booking-chat-screen.styles.ts apps/mobile/src/screens/__tests__/BookingChatScreen.test.tsx "apps/mobile/app/(parent)/book/booking-chat.tsx" "apps/mobile/app/(nanny)/booking-chat.tsx" "apps/mobile/app/(nanny)/_layout.tsx"
git commit -m "feat(mobile): booking chat screen for mother and nanny"
```

---

### Task 7: Entry card on both booking detail screens

**Files:**
- Create: `apps/mobile/src/components/booking/BookingChatCard.tsx`
- Modify: `apps/mobile/src/screens/parent/BookingDetailScreen.tsx`, `apps/mobile/src/screens/nanny/NannyBookingDetailScreen.tsx`
- Test: `apps/mobile/src/components/booking/__tests__/BookingChatCard.test.tsx`, and extend `apps/mobile/src/screens/parent/__tests__/BookingDetailScreen.test.tsx`

**Interfaces:**
- Consumes: `useBookingChatSummary` (Task 6); `Badge` (default export from `@mobile/components/ui`; check the barrel's export name); `PressableScale`.
- Produces: `<BookingChatCard bookingId: number; otherFirstName: string | null; onOpen: () => void />`. It renders `null` when the chat is closed and empty.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/components/booking/__tests__/BookingChatCard.test.tsx
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { BookingChatSummary } from '@nanny-app/shared';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useIsFocused: () => true,
}));

import { BookingChatCard } from '@mobile/components/booking/BookingChatCard';
import { api } from '@mobile/lib/api';

function renderCard(summary: BookingChatSummary, onOpen = jest.fn()) {
  (api.get as jest.Mock).mockResolvedValue({ data: { data: summary, error: null } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const screen = render(
    <QueryClientProvider client={client}>
      <BookingChatCard bookingId={7} otherFirstName="Sara" onOpen={onOpen} />
    </QueryClientProvider>,
  );
  return { screen, onOpen };
}

it('invites her to message during the shift and shows unread', async () => {
  const { screen, onOpen } = renderCard({ canSend: true, messageCount: 3, unreadCount: 2 });
  fireEvent.press(await screen.findByText('Message Sara'));
  expect(onOpen).toHaveBeenCalled();
  expect(screen.getByText('2')).toBeTruthy();
  expect(screen.getByLabelText('Message Sara, 2 unread')).toBeTruthy();
});

it('offers the history read-only after the booking', async () => {
  const { screen } = renderCard({ canSend: false, messageCount: 1, unreadCount: 0 });
  expect(await screen.findByText('View messages')).toBeTruthy();
  expect(screen.getByText('1 message · read-only')).toBeTruthy();
});

it('shows nothing when the chat is closed and empty', async () => {
  const { screen } = renderCard({ canSend: false, messageCount: 0, unreadCount: 0 });
  await new Promise((r) => setTimeout(r, 0));
  expect(screen.queryByText('View messages')).toBeNull();
  expect(screen.queryByText(/Message/)).toBeNull();
});
```

Add to `BookingDetailScreen.test.tsx`: put `'/bookings/1/messages/summary': { canSend: true, messageCount: 0, unreadCount: 0 },` in the `routes` map in `renderScreen`, then add a test:

```tsx
describe('BookingDetailScreen — chat', () => {
  it('opens the booking chat from the live booking', async () => {
    const screen = renderScreen(booking());
    fireEvent.press(await screen.findByText('Message Elena'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(parent)/book/booking-chat',
      params: { bookingId: '1' },
    });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @nanny-app/mobile test -- BookingChatCard BookingDetailScreen`
Expected: FAIL with the module missing / "Message Elena" not found.

- [ ] **Step 3: Implement the card**

```tsx
// apps/mobile/src/components/booking/BookingChatCard.tsx
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Badge, PressableScale } from '@mobile/components/ui';
import { Text } from '@mobile/components/ui/text';
import { useBookingChatSummary } from '@mobile/hooks/useBookingChat';
import { borderRadius, colors, shadows, spacing, typeScale } from '@mobile/theme';

interface BookingChatCardProps {
  bookingId: number;
  /** The other side's first name, for "Message Sara". */
  otherFirstName: string | null;
  onOpen: () => void;
}

/**
 * The way into a booking's chat. Live: "Message <name>" with an unread badge.
 * Over, with history: "View messages". Otherwise nothing — before the shift
 * there is nothing to open.
 */
export function BookingChatCard({ bookingId, otherFirstName, onOpen }: BookingChatCardProps) {
  const { data: summary } = useBookingChatSummary(bookingId);
  if (!summary) return null;
  if (!summary.canSend && summary.messageCount === 0) return null;

  const title = summary.canSend ? `Message ${otherFirstName ?? 'them'}` : 'View messages';
  const subtitle = summary.canSend
    ? 'Ask or share an update during the shift'
    : `${summary.messageCount} ${summary.messageCount === 1 ? 'message' : 'messages'} · read-only`;
  const unread = summary.unreadCount;

  return (
    <PressableScale
      style={styles.card}
      onPress={onOpen}
      haptic
      accessibilityRole="button"
      accessibilityLabel={unread > 0 ? `${title}, ${unread} unread` : title}
    >
      <View style={styles.iconWrap}>
        <View style={styles.icon}>
          <Ionicons name="chatbubbles-outline" size={18} color={colors.primaryDark} />
        </View>
        {unread > 0 ? <Badge count={unread} size="sm" style={styles.badge} /> : null}
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.primaryDark} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  // Mirrors the booking detail's "Contact support" row so the two read as one family.
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 44,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.warmSubtle,
    ...shadows.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // On the icon's corner, outside its shape.
  badge: {
    position: 'absolute',
    top: -spacing.xxs,
    right: -spacing.xs,
  },
  text: {
    flex: 1,
    flexShrink: 1,
    gap: spacing.xxs,
  },
  title: {
    ...typeScale.labelLg,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typeScale.bodySm,
    color: colors.textMuted,
  },
});
```

Confirm the `Badge` and `PressableScale` export names in `src/components/ui/index.ts`, and that `PressableScale` accepts `haptic` and `accessibilityLabel`. Adjust the import if `Badge` is exported under another name.

- [ ] **Step 4: Wire it into both detail screens**

Mother, `BookingDetailScreen.tsx`: import `BookingChatCard`, and inside `<View style={styles.top}>` add it directly after the `LiveShiftCard` / `BookingStatusCard` ternary:

```tsx
          {/* Talk to the nanny while she's here; the history stays after. */}
          <BookingChatCard
            bookingId={booking.id}
            otherFirstName={nannyFirstName}
            onOpen={() =>
              router.push({
                pathname: '/(parent)/book/booking-chat',
                params: { bookingId: String(booking.id) },
              } as never)
            }
          />
```

`nannyFirstName` is defined after the loading guard. Move the `const nannyFirstName = …` line up if needed so it's in scope; it already sits before the return.

Nanny, `NannyBookingDetailScreen.tsx`: import it and add directly after the status badge `View`:

```tsx
        <BookingChatCard
          bookingId={booking.id}
          otherFirstName={booking.motherFirstName}
          onOpen={() =>
            router.push({
              pathname: '/(nanny)/booking-chat',
              params: { bookingId: String(booking.id) },
            } as never)
          }
        />
```

- [ ] **Step 5: Verify**

Run: `pnpm --filter @nanny-app/mobile test -- BookingChatCard BookingDetailScreen && pnpm --filter @nanny-app/mobile typecheck`
Expected: PASS. The existing BookingDetailScreen tests still pass with the extra route.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/booking apps/mobile/src/screens/parent/BookingDetailScreen.tsx apps/mobile/src/screens/nanny/NannyBookingDetailScreen.tsx apps/mobile/src/screens/parent/__tests__/BookingDetailScreen.test.tsx
git commit -m "feat(mobile): open the booking chat from booking details"
```

---

### Task 8: Open the chat from notifications

**Files:**
- Modify: `apps/mobile/src/lib/notificationNavigation.ts`
- Modify: `apps/mobile/src/hooks/usePushNotifications.ts` (`onMessage` handler ~line 259, `navigateFromNotification` ~line 140)
- Modify: `apps/mobile/src/screens/parent/NotificationsScreen.tsx` (~line 99), `apps/mobile/src/screens/nanny/NannyNotificationsScreen.tsx` (`handleNotificationPress`)
- Test: `apps/mobile/src/lib/__tests__/notificationNavigation.test.ts` (create, or extend if it exists)

**Interfaces:**
- Produces:
  - `isBookingMessagePush(data?: Record<string, string>): boolean`
  - `navigateToBookingChat(router: Router, bookingId: number, role: 'parent' | 'nanny'): void`

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/src/lib/__tests__/notificationNavigation.test.ts
import { isBookingMessagePush, navigateToBookingChat } from '@mobile/lib/notificationNavigation';

it('recognises a booking chat push', () => {
  expect(isBookingMessagePush({ type: 'BOOKING_MESSAGE', bookingId: '7' })).toBe(true);
  expect(isBookingMessagePush({ type: 'CARE_LOG_ENTRY', bookingId: '7' })).toBe(false);
  expect(isBookingMessagePush(undefined)).toBe(false);
});

it('opens the chat route for each role', () => {
  const router = { push: jest.fn() };
  navigateToBookingChat(router as never, 7, 'parent');
  navigateToBookingChat(router as never, 7, 'nanny');
  expect(router.push).toHaveBeenNthCalledWith(1, {
    pathname: '/(parent)/book/booking-chat',
    params: { bookingId: '7' },
  });
  expect(router.push).toHaveBeenNthCalledWith(2, {
    pathname: '/(nanny)/booking-chat',
    params: { bookingId: '7' },
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @nanny-app/mobile test -- notificationNavigation`
Expected: FAIL, because the exports don't exist.

- [ ] **Step 3: Implement**

Append to `notificationNavigation.ts`:

```ts
export function isBookingMessagePush(data?: Record<string, string>): boolean {
  return data?.['type'] === 'BOOKING_MESSAGE' && !!data['bookingId'];
}

export function navigateToBookingChat(
  router: Router,
  bookingId: number,
  role: 'parent' | 'nanny',
): void {
  router.push({
    pathname: role === 'nanny' ? '/(nanny)/booking-chat' : '/(parent)/book/booking-chat',
    params: { bookingId: String(bookingId) },
  } as never);
}
```

In `usePushNotifications.ts`:
- Import `isBookingMessagePush` and `navigateToBookingChat`, and `BOOKING_CHAT_KEY` from `@mobile/hooks/useBookingChat`.
- In `onMessage`, at the very top of the handler:

```ts
        if (isBookingMessagePush(message.data)) {
          const bookingId = message.data?.['bookingId'];
          void queryClient.invalidateQueries({ queryKey: [BOOKING_CHAT_KEY] });
          // Her chat with this booking is on screen: the refetch is enough.
          if (bookingId === useMessagingStore.getState().activeBookingChatId) return;
          void queryClient.invalidateQueries({ queryKey: ['notifications'] });
          return;
        }
```

- In `navigateFromNotification`, before the `conversationId` branch:

```ts
  if (isBookingMessagePush(data)) {
    navigateToBookingChat(
      router,
      Number(data!['bookingId']),
      segments[0] === '(nanny)' ? 'nanny' : 'parent',
    );
    return;
  }
```

`configureNotificationHandler` controls whether a foreground push shows a banner. Check whether it consults `activeConversationId`; if it does, apply the same check for `BOOKING_MESSAGE` against `activeBookingChatId`, so no banner shows while that chat is open.

In the parent `NotificationsScreen.tsx`, before the `booking_extension_declined` branch (~line 99):

```tsx
    if (notification.type === 'booking_message' && notification.referenceId) {
      navigateToBookingChat(router, notification.referenceId, 'parent');
      return;
    }
```

In `NannyNotificationsScreen.tsx` `handleNotificationPress`, after marking read:

```tsx
    if (notification.type === 'booking_message' && notification.referenceId) {
      navigateToBookingChat(router, notification.referenceId, 'nanny');
    }
```

Add `const router = useRouter();` and the imports if the nanny screen lacks them.

- [ ] **Step 4: Verify**

Run: `pnpm --filter @nanny-app/mobile test -- notificationNavigation usePushNotifications NotificationsScreen && pnpm --filter @nanny-app/mobile typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/lib apps/mobile/src/hooks/usePushNotifications.ts apps/mobile/src/screens/parent/NotificationsScreen.tsx apps/mobile/src/screens/nanny/NannyNotificationsScreen.tsx
git commit -m "feat(mobile): open booking chat from push and in-app notifications"
```

---

### Task 9: Admin read-only chat modal

**Files:**
- Modify: `apps/admin/src/lib/api.ts` (after `fetchBooking`, line 401)
- Create: `apps/admin/src/features/bookings/booking-chat-modal.tsx`
- Modify: `apps/admin/src/pages/booking-detail-page.tsx`, `apps/admin/src/styles/global.css`, `apps/admin/src/test/handlers.ts`
- Test: `apps/admin/src/features/bookings/__tests__/booking-chat-modal.test.tsx`

**Interfaces:**
- Consumes: `GET /admin/bookings/:id/messages` (Task 4); `BookingMessageListResponse` (Task 1).
- Produces: `fetchBookingMessages(id: string): Promise<BookingMessageListResponse>`; `<BookingChatModal bookingId: string; motherName: string; nannyName: string | null; onClose />`; `<BookingChatButton bookingId onOpen />`.

- [ ] **Step 1: Load the admin design skill**

Invoke the `nanny-app-admin-design` skill and follow its guidance for modal, empty, error and loading states. The CSS below uses only `:root` tokens.

- [ ] **Step 2: Write the failing test**

```tsx
// apps/admin/src/features/bookings/__tests__/booking-chat-modal.test.tsx
/**
 * The console reads a booking's chat and cannot post in it. Each message says
 * who sent it and when; the mother sits left, the nanny right.
 */
import type { BookingMessageResponse } from '@nanny-app/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { BookingChatButton, BookingChatModal } from '@admin/features/bookings/booking-chat-modal';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

function ok<T>(data: T) {
  return HttpResponse.json({ data, error: null });
}

const MESSAGES: BookingMessageResponse[] = [
  { id: 1, bookingId: 4, content: 'Nap at 1pm please', createdAt: '2026-10-15T10:00:00.000Z', sender: { id: 10, firstName: 'Jane', lastName: 'Mom', avatarUrl: null, role: 'MOTHER' } },
  { id: 2, bookingId: 4, content: 'Will do', createdAt: '2026-10-15T10:02:00.000Z', sender: { id: 23, firstName: 'Sara', lastName: 'Near', avatarUrl: null, role: 'NANNY' } },
];

describe('BookingChatModal', () => {
  it('shows each message with its sender, role and side, and no way to post', async () => {
    server.use(http.get('/api/admin/bookings/4/messages', () => ok({ messages: MESSAGES, hasMore: false })));
    renderWithProviders(
      <BookingChatModal bookingId="4" motherName="Jane Mom" nannyName="Sara Near" onClose={vi.fn()} />,
    );

    expect(await screen.findByText('Nap at 1pm please')).toBeTruthy();
    const mine = screen.getByText('Nap at 1pm please').closest('.chat-msg');
    const hers = screen.getByText('Will do').closest('.chat-msg');
    expect(mine?.className).toContain('chat-msg--mother');
    expect(hers?.className).toContain('chat-msg--nanny');
    expect(screen.getByText('Jane Mom')).toBeTruthy();
    expect(screen.getAllByText('Mommy').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Nanny').length).toBeGreaterThan(0);
    expect(screen.getByText("Read-only — admins can't post in booking chats.")).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('says so when there are no messages', async () => {
    server.use(http.get('/api/admin/bookings/4/messages', () => ok({ messages: [], hasMore: false })));
    renderWithProviders(
      <BookingChatModal bookingId="4" motherName="Jane Mom" nannyName={null} onClose={vi.fn()} />,
    );
    expect(await screen.findByText('No messages on this booking.')).toBeTruthy();
  });

  it('offers a retry when the transcript fails to load', async () => {
    server.use(
      http.get('/api/admin/bookings/4/messages', () =>
        HttpResponse.json({ data: null, error: 'Server exploded' }, { status: 500 }),
      ),
    );
    renderWithProviders(
      <BookingChatModal bookingId="4" motherName="Jane Mom" nannyName={null} onClose={vi.fn()} />,
    );
    expect(await screen.findByRole('button', { name: /retry/i })).toBeTruthy();
  });

  it('closes on the close button', async () => {
    server.use(http.get('/api/admin/bookings/4/messages', () => ok({ messages: [], hasMore: false })));
    const onClose = vi.fn();
    renderWithProviders(
      <BookingChatModal bookingId="4" motherName="Jane Mom" nannyName={null} onClose={onClose} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('BookingChatButton', () => {
  it('shows the count and opens', async () => {
    server.use(http.get('/api/admin/bookings/4/messages', () => ok({ messages: MESSAGES, hasMore: false })));
    const onOpen = vi.fn();
    renderWithProviders(<BookingChatButton bookingId="4" onOpen={onOpen} />);
    await userEvent.click(await screen.findByRole('button', { name: 'View chat (2)' }));
    expect(onOpen).toHaveBeenCalled();
  });

  it('is disabled with no messages', async () => {
    server.use(http.get('/api/admin/bookings/4/messages', () => ok({ messages: [], hasMore: false })));
    renderWithProviders(<BookingChatButton bookingId="4" onOpen={vi.fn()} />);
    const button = await screen.findByRole('button', { name: 'View chat (0)' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.getAttribute('title')).toBe('No messages');
  });
});
```

Check `ErrorState`'s retry button label in `components/ui/error-state.tsx` and adjust the `/retry/i` matcher to it.

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @nanny-app/admin test -- booking-chat-modal`
Expected: FAIL, because the module is missing.

- [ ] **Step 4: Implement**

Add to `api.ts`. Extend the `@nanny-app/shared` type import with `BookingMessageListResponse`:

```ts
export async function fetchBookingMessages(id: string): Promise<BookingMessageListResponse> {
  const res = await apiClient.get<ApiEnvelope<BookingMessageListResponse>>(
    `/admin/bookings/${id}/messages`,
  );
  return res.data.data;
}
```

```tsx
// apps/admin/src/features/bookings/booking-chat-modal.tsx
import type { BookingMessageResponse } from '@nanny-app/shared';
import { useQuery } from '@tanstack/react-query';

import { Badge, Button, ErrorState, LoadingState, Modal } from '@admin/components/ui';
import { apiErrorMessage } from '@admin/lib/api-error';
import { fetchBookingMessages } from '@admin/lib/api';
import { formatDateTime } from '@admin/lib/format';

const messagesKey = (bookingId: string) => ['booking', bookingId, 'messages'] as const;

function useBookingMessages(bookingId: string) {
  return useQuery({
    queryKey: messagesKey(bookingId),
    queryFn: () => fetchBookingMessages(bookingId),
    enabled: bookingId !== '',
  });
}

/** "View chat (N)" for the booking header; disabled when there is nothing to read. */
export function BookingChatButton({ bookingId, onOpen }: { bookingId: string; onOpen: () => void }) {
  const { data } = useBookingMessages(bookingId);
  if (!data) return null;
  const count = data.messages.length;
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onOpen}
      disabled={count === 0}
      title={count === 0 ? 'No messages' : undefined}
    >
      {`View chat (${count}${data.hasMore ? '+' : ''})`}
    </Button>
  );
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function Message({ message }: { message: BookingMessageResponse }) {
  const isMother = message.sender.role === 'MOTHER';
  const name = `${message.sender.firstName} ${message.sender.lastName}`.trim();
  return (
    <li className={`chat-msg ${isMother ? 'chat-msg--mother' : 'chat-msg--nanny'}`}>
      <div className="chat-msg-meta">
        <span className="chat-msg-name">{name}</span>
        <Badge tone={isMother ? 'neutral' : 'success'}>{isMother ? 'Mommy' : 'Nanny'}</Badge>
        <time dateTime={message.createdAt}>{formatDateTime(message.createdAt)}</time>
      </div>
      <p className="chat-msg-bubble">{message.content}</p>
    </li>
  );
}

type BookingChatModalProps = {
  bookingId: string;
  motherName: string;
  nannyName: string | null;
  onClose: () => void;
};

/** A booking's mother↔nanny chat, read-only for the console. */
export function BookingChatModal({ bookingId, motherName, nannyName, onClose }: BookingChatModalProps) {
  const { data, isLoading, error, refetch, isFetching } = useBookingMessages(bookingId);

  let previousDay = '';
  return (
    <Modal
      title={`Chat · ${motherName} & ${nannyName ?? 'nanny'}`}
      onClose={onClose}
      footer={<p className="chat-readonly-note">Read-only — admins can't post in booking chats.</p>}
    >
      {isLoading && <LoadingState label="Loading chat…" />}
      {error != null && !data && (
        <ErrorState message={apiErrorMessage(error)} onRetry={() => void refetch()} retrying={isFetching} />
      )}
      {data && data.messages.length === 0 && (
        <p className="empty-state">No messages on this booking.</p>
      )}
      {data && data.messages.length > 0 && (
        <ol className="chat-transcript" aria-label="Messages">
          {data.messages.map((message) => {
            const day = dayLabel(message.createdAt);
            const divider = day !== previousDay;
            previousDay = day;
            return (
              <li key={message.id} className="chat-day-group">
                {divider && <div className="chat-day">{day}</div>}
                <ol className="chat-day-list">
                  <Message message={message} />
                </ol>
              </li>
            );
          })}
        </ol>
      )}
      {data?.hasMore && (
        <p className="chat-readonly-note">Showing the first {data.messages.length} messages.</p>
      )}
    </Modal>
  );
}
```

Check that `Button` forwards `title` and `disabled` to the `<button>`. If its props type omits `title`, extend it with `ButtonHTMLAttributes` the way the component already does for `onClick`.

Append to `global.css`, next to the other modal rules after `.modal-body`:

```css
/* Booking chat transcript (read-only, console) */
.chat-transcript,
.chat-day-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.chat-transcript {
  max-height: min(60vh, 32rem);
  overflow-y: auto;
}

.chat-day {
  align-self: center;
  margin: 0.25rem auto;
  padding: 0.25rem 0.75rem;
  border-radius: var(--radius-full);
  background: var(--color-warm-subtle);
  color: var(--color-text-muted);
  font-size: 0.75rem;
  font-weight: 700;
  text-align: center;
  width: fit-content;
}

.chat-msg {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  max-width: 80%;
}

.chat-msg--mother {
  align-self: flex-start;
}

.chat-msg--nanny {
  align-self: flex-end;
  align-items: flex-end;
}

.chat-msg-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.chat-msg-name {
  font-weight: 700;
  color: var(--color-text-secondary);
}

.chat-msg-bubble {
  margin: 0;
  padding: 0.625rem 0.875rem;
  border-radius: var(--radius-lg);
  background: var(--color-surface-muted);
  color: var(--color-text-primary);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.5;
}

.chat-msg--nanny .chat-msg-bubble {
  background: var(--color-primary-muted);
}

.chat-readonly-note {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}
```

Wire up `booking-detail-page.tsx`:
- Import `BookingChatButton, BookingChatModal`.
- Add `const [chatOpen, setChatOpen] = useState(false);`.
- Wrap the header actions so the chat button sits before the edit control:

```tsx
  const editActions = canEdit ? (
    /* the existing editing ? Cancel : Edit booking ternary, unchanged */
  ) : undefined;

  const actions = (
    <>
      {booking && <BookingChatButton bookingId={id} onOpen={() => setChatOpen(true)} />}
      {editActions}
    </>
  );
```

That means renaming the existing `const actions = canEdit ? (…) : undefined;` to `editActions`. Then add next to the other modals:

```tsx
          {chatOpen && (
            <BookingChatModal
              bookingId={id}
              motherName={booking.mother.name}
              nannyName={booking.nanny?.name ?? null}
              onClose={() => setChatOpen(false)}
            />
          )}
```

Check the `AdminBookingDetail` field names for the mother's and nanny's display names (the `AdminBooking` fixture uses `mother.name` and `nanny.name`). Use whatever `AdminBookingDetail` exposes.

In `apps/admin/src/test/handlers.ts`, add a default handler so the existing booking-page tests don't trip `onUnhandledRequest: 'error'`:

```ts
  http.get('/api/admin/bookings/:id/messages', () => ok({ messages: [], hasMore: false })),
```

- [ ] **Step 5: Verify**

Run: `pnpm --filter @nanny-app/admin test -- booking-chat-modal booking-detail-page && pnpm --filter @nanny-app/admin typecheck && pnpm --filter @nanny-app/admin lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src
git commit -m "feat(admin): read a booking's chat from its detail page"
```

---

### Task 10: UI sweep, full verification, docs

**Files:**
- Create: a sweep flow for the chat screen, per the `ui-sweep` skill (`apps/mobile/e2e/…`)
- Modify: `docs/superpowers/specs/2026-10-15-booking-chat-design.md` (record the deviations listed at the top of this plan)

- [ ] **Step 1: Run the UI sweep for the new screens**

Invoke the `ui-sweep` skill and follow it to add a sweep flow covering three states:
1. The mother's booking detail with the "Message …" card (IN_PROGRESS).
2. The chat with messages and the keyboard open.
3. The chat read-only (COMPLETED).

Then run at least the worst cell, in tmux:
`tmux new -d -s nanny-app-ui-sweep "cd apps/mobile && node e2e/ui-sweep.mjs --paymob=fake --cells=small-1.3-3btn --flows=<new flow id> 2>&1 | tee ~/logs/nanny-app-ui-sweep.log"`
Look at every shot. Check that names wrap, the composer sits above the keyboard and the 3-button bar, the badge sits on the icon corner, and the read-only note clears the system bar. Fix and re-run until clean.

- [ ] **Step 2: Run the whole suite**

Run from the root: `pnpm lint && pnpm typecheck && pnpm test:unit`, then with the test stack up, `pnpm test:integration`.
Expected: all green. Paste the summary lines into the PR description.

- [ ] **Step 3: Update the spec with the deviations**

In the spec's Shared schemas / Backend / Mobile sections, replace:
- "added as `chat` to the mobile booking detail response and as `chatMessageCount` to `AdminBookingDetail`" with "served by `GET /bookings/:id/messages/summary`; the console counts from its transcript query".
- `screens/shared/BookingChatScreen.tsx` with `screens/BookingChatScreen.tsx`.
- `BookingMessageSchema` with `BookingMessageResponseSchema`.

- [ ] **Step 4: Tear down and commit**

Run `pnpm test:env:down` and `tmux kill-session -t nanny-app-test-env`.

```bash
git add docs apps/mobile/e2e
git commit -m "test(e2e): sweep the booking chat; record design deviations"
```

- [ ] **Step 5: Before shipping**

Nothing applies migrations on deploy (root CLAUDE.md → Deployment). The PR description must say that `pnpm db:migrate` has to run against the production `DATABASE_URL` before the backend deploy, and that the mobile change ships as a new binary (no OTA).
