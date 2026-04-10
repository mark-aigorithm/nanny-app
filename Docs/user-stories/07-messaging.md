# Epic 7: In-App Messaging

## Context

NannyMom provides real-time in-app messaging for three contexts: booking-related communication between mothers and nannies, marketplace buyer-seller negotiation, and general profile-initiated conversations. Messages are persisted in PostgreSQL and delivered in real time via WebSocket (Socket.io). The system supports text messages, image messages (uploaded to S3), system-generated messages (e.g., "Booking confirmed"), read receipts, typing indicators, and unread counts.

**PRD references:** Section 6.9 (Integrated Community Hub), FR-11-05 (marketplace messaging), Table 21 (Notification triggers — new marketplace message), Section 10.4 (proposed group messaging)
**Architecture references:** PostgreSQL (message persistence), Redis (online status, typing indicators, pub/sub for Socket.io), S3 + CloudFront (image messages), Firebase Cloud Messaging (push notifications for offline users)

---

## Prerequisites (Prisma Models)

### MSG-01: Prisma schema — Conversation model
**As a** developer
**I want** the Prisma schema to define the `Conversation` model
**So that** messaging services can group messages into contextual threads.

**Acceptance criteria:**
- Enum `ConversationType { BOOKING MARKETPLACE GENERAL }`
- `Conversation` model with fields: `id` (UUID), `type` (ConversationType), `bookingId` (FK to Booking, nullable — set when type is BOOKING), `listingId` (FK to Listing, nullable — set when type is MARKETPLACE), `createdAt`, `updatedAt`
- `ConversationParticipant` join model with fields: `id` (UUID), `conversationId` (FK to Conversation, onDelete CASCADE), `userId` (FK to User), `joinedAt`, `lastReadAt` (DateTime, nullable — tracks read receipts)
- Unique constraint on `(conversationId, userId)` to prevent duplicate participants
- Index on `userId` in `ConversationParticipant` for listing a user's conversations
- Index on `(bookingId)` for looking up the conversation for a booking
- Index on `(listingId)` for looking up marketplace conversations
- Migration generated and applied: `pnpm db:migrate:dev`
- Prisma client generated: `pnpm db:generate`

**Unit tests:**
- Conversation creation with participants
- Unique constraint prevents duplicate participant entries
- Cascade delete removes participants when conversation is deleted

### MSG-02: Prisma schema — Message model
**As a** developer
**I want** the Prisma schema to define the `Message` model
**So that** individual messages can be persisted and queried.

**Acceptance criteria:**
- Enum `MessageType { TEXT IMAGE SYSTEM }`
- `Message` model with fields: `id` (UUID), `conversationId` (FK to Conversation, onDelete CASCADE), `senderId` (FK to User, nullable — null for SYSTEM messages), `type` (MessageType, default TEXT), `content` (text — message body for TEXT, S3 URL for IMAGE, system message text for SYSTEM), `createdAt`
- Index on `(conversationId, createdAt)` for paginated chat history queries
- Index on `senderId` for querying messages by user
- Migration generated and applied

**Unit tests:**
- Message creation with valid conversation FK
- Cascade delete removes messages when conversation is deleted
- System messages allow null senderId

### MSG-03: Prisma schema — MessageReadReceipt model
**As a** developer
**I want** the Prisma schema to define the `MessageReadReceipt` model
**So that** the system can track which messages each user has read.

**Acceptance criteria:**
- `MessageReadReceipt` model with fields: `id` (UUID), `messageId` (FK to Message, onDelete CASCADE), `userId` (FK to User), `readAt` (DateTime)
- Unique constraint on `(messageId, userId)` to prevent duplicate receipts
- Index on `(userId, messageId)` for efficient read status lookups
- Migration generated and applied

**Unit tests:**
- Receipt creation with valid message and user FKs
- Unique constraint prevents duplicate read receipts

---

## Shared Zod Schemas

### MSG-04: Messaging Zod schemas in @nanny-app/shared
**As a** developer
**I want** Zod schemas for all messaging request/response types defined in `packages/shared`
**So that** backend validation and mobile typing share a single source of truth.

**Acceptance criteria:**
- `packages/shared/src/messaging.ts` exports:
  - `ConversationTypeEnum` — Zod enum matching Prisma `ConversationType`
  - `MessageTypeEnum` — Zod enum matching Prisma `MessageType`
  - `CreateConversationSchema` — `{ type, participantIds: string[], bookingId?, listingId? }`
  - `SendMessageSchema` — `{ content, type?: "TEXT" | "IMAGE" }`
  - `MessageResponseSchema` — full message with sender summary
  - `ConversationResponseSchema` — conversation with participants, last message, unread count
  - `ConversationListQuerySchema` — `{ cursor?, limit? }`
  - `MessageHistoryQuerySchema` — `{ cursor?, limit? }` (cursor is `createdAt` of oldest loaded message)
  - `MarkReadSchema` — `{ messageIds: string[] }`
- All types inferred with `z.infer<>` and re-exported
- Barrel export updated in `packages/shared/src/index.ts`
- `pnpm build --filter=@nanny-app/shared` succeeds

**Unit tests:**
- Valid and invalid payloads for each schema
- `CreateConversationSchema` requires at least 2 participant IDs
- `SendMessageSchema` content rejects empty strings, enforces max 5000 chars
- `MessageHistoryQuerySchema` limit defaults to 50, max 100

---

## Feature Stories

### MSG-05: Create conversation
**As a** mother or nanny
**I want** to start a conversation with another user
**So that** we can communicate in-app.

**Acceptance criteria:**
- `POST /conversations` (requires auth)
- Request body validated with `CreateConversationSchema`: `{ type, participantIds, bookingId?, listingId? }`
- The authenticated user is automatically added as a participant (no need to include self in `participantIds`)
- `BOOKING` type requires a valid `bookingId` where the authenticated user is a party; returns `400` otherwise
- `MARKETPLACE` type requires a valid `listingId` with status ACTIVE; returns `400` otherwise
- `GENERAL` type requires no linked entity
- If a conversation already exists between the same participants for the same booking/listing, returns the existing conversation (idempotent)
- Creates `Conversation` and `ConversationParticipant` records
- Returns `201 { data: { conversation } }` with participant details

**Unit tests:**
- Happy path: BOOKING conversation created with valid booking
- Happy path: MARKETPLACE conversation created with valid listing
- Happy path: GENERAL conversation created between two users
- Idempotent: existing conversation returned
- Rejected: BOOKING type with invalid bookingId
- Rejected: user not a party to the booking

### MSG-06: Auto-create conversation on booking confirmation
**As the** system
**I want** a conversation to be automatically created when a booking is confirmed
**So that** the mother and nanny can communicate about the booking immediately.

**Acceptance criteria:**
- When a booking transitions to `CONFIRMED` status, a service function creates a `Conversation` of type `BOOKING` linked to the booking
- Participants: the mother and the assigned nanny
- A system message is auto-generated: "Booking confirmed for {date} at {time}. You can use this chat to coordinate."
- If the conversation already exists (e.g., re-confirmation), no duplicate is created
- This is a service-layer function called from the booking service, not a standalone endpoint

**Unit tests:**
- Conversation created on booking confirmation with correct participants
- System message generated with booking details
- No duplicate conversation on re-confirmation

### MSG-07: Send text message
**As a** conversation participant
**I want** to send a text message in a conversation
**So that** I can communicate with the other party.

**Acceptance criteria:**
- `POST /conversations/:id/messages` (requires auth)
- Request body validated with `SendMessageSchema`: `{ content, type: "TEXT" }`
- Only conversation participants can send messages; non-participant returns `403`
- Creates `Message` record with `type: TEXT`, `senderId` = authenticated user
- Emits `message:received` WebSocket event to all other participants in the conversation (see MSG-12)
- If recipient is offline, sends a push notification via FCM: "{senderName}: {content preview (first 100 chars)}"
- Returns `201 { data: { message } }` with full message details

**Unit tests:**
- Happy path: message created and returned
- Non-participant returns 403
- Push notification sent when recipient is offline
- Content trimmed and validated (non-empty, max 5000 chars)

### MSG-08: Send image message
**As a** conversation participant
**I want** to send an image in a conversation
**So that** I can share photos with the other party.

**Acceptance criteria:**
- `POST /conversations/:id/messages/upload-url` (requires auth)
  - Returns a presigned S3 PUT URL for image upload
  - S3 key format: `messages/{conversationId}/{uuid}.{ext}`
  - Accepted types: `image/jpeg`, `image/png` (max 5MB)
  - Returns `200 { data: { uploadUrl, s3Key } }`
- `POST /conversations/:id/messages` with `{ content: "<s3Key>", type: "IMAGE" }`
  - Creates `Message` record with `type: IMAGE`, `content` = CloudFront URL derived from s3Key
  - Same participant check and notification behavior as MSG-07
  - Returns `201 { data: { message } }`

**Unit tests:**
- Presigned URL generated with correct key format and conditions
- Image message created with CloudFront URL
- Non-participant returns 403 for both upload URL and send

### MSG-09: Get conversation list
**As an** authenticated user
**I want** to see all my conversations with last message preview and unread count
**So that** I can navigate to the right chat.

**Acceptance criteria:**
- `GET /conversations` (requires auth)
- Returns all conversations where the user is a participant, sorted by last message `createdAt DESC`
- Each conversation includes: participants (name, avatar, online status), last message (preview: first 100 chars, sender name, timestamp, type), unread count (messages created after `lastReadAt`), conversation type, linked entity summary (booking date/nanny name for BOOKING, listing title/photo for MARKETPLACE)
- Cursor-based pagination, default limit 20
- Returns `200 { data: { conversations }, meta: { nextCursor, hasMore } }`

**Unit tests:**
- Returns only conversations the user participates in
- Sorted by most recent message
- Unread count computed correctly
- Includes linked booking/listing summary
- Pagination works correctly

### MSG-10: Get chat history (paginated messages)
**As a** conversation participant
**I want** to load message history for a conversation with pagination
**So that** I can scroll back through older messages.

**Acceptance criteria:**
- `GET /conversations/:id/messages` (requires auth)
- Query params validated with `MessageHistoryQuerySchema`: `{ cursor?, limit? }`
- Only conversation participants can access; non-participant returns `403`
- Returns messages in reverse chronological order (newest first, client reverses for display)
- Cursor-based pagination using `createdAt` + `id` composite cursor
- Default limit: 50, max: 100
- Each message includes: sender summary (name, avatar), type, content, createdAt, read receipts (list of user IDs who have read)
- Returns `200 { data: { messages }, meta: { nextCursor, hasMore } }`

**Unit tests:**
- Returns messages for the conversation in correct order
- Non-participant returns 403
- Cursor pagination returns correct older messages
- Default and max limit enforced

### MSG-11: Mark messages as read (read receipts)
**As a** conversation participant
**I want** messages to be marked as read when I open the conversation
**So that** the other party knows I've seen their messages.

**Acceptance criteria:**
- `POST /conversations/:id/read` (requires auth)
- Updates `lastReadAt` on the `ConversationParticipant` record to current timestamp
- Creates `MessageReadReceipt` records for all unread messages in the conversation (messages after previous `lastReadAt`)
- Emits `message:read` WebSocket event to other participants with `{ conversationId, userId, readAt }`
- Returns `200 { data: { readAt } }`
- Idempotent: calling again updates `lastReadAt` but does not create duplicate receipts

**Unit tests:**
- Happy path: lastReadAt updated, receipts created for unread messages
- WebSocket event emitted to other participants
- Idempotent: no duplicate receipts on repeat call
- Non-participant returns 403

### MSG-12: WebSocket connection and real-time events
**As a** connected user
**I want** to receive messages, read receipts, and typing indicators in real time
**So that** the chat experience feels instant.

**Acceptance criteria:**
- Socket.io server initialized alongside Express in `src/server.ts`
- Authentication: client sends Firebase JWT on connection; server verifies with Firebase Admin SDK; disconnects on invalid token
- On connect: user is added to a Socket.io room for each conversation they participate in; online status stored in Redis with TTL (e.g., `user:{userId}:online = true`, TTL 5 minutes, refreshed on heartbeat)
- WebSocket events:
  - `message:send` — client emits to send a message (alternative to HTTP POST; server persists and broadcasts)
  - `message:received` — server emits to conversation room when a new message is persisted
  - `message:read` — server emits when a participant marks messages as read
  - `typing:start` — client emits; server broadcasts to conversation room (not persisted)
  - `typing:stop` — client emits; server broadcasts to conversation room (not persisted)
- Redis pub/sub adapter for Socket.io to support horizontal scaling across multiple ECS tasks
- On disconnect: online status removed from Redis after TTL expires

**Unit tests:**
- Authentication: valid JWT connects, invalid JWT rejects
- User joins correct conversation rooms on connect
- `message:received` emitted to room on new message
- `typing:start` and `typing:stop` broadcast to other participants only (not back to sender)
- Redis pub/sub adapter configured for multi-instance support

### MSG-13: Typing indicators
**As a** conversation participant
**I want** to see when the other person is typing
**So that** I know a reply is coming.

**Acceptance criteria:**
- Client emits `typing:start` with `{ conversationId }` when user begins typing
- Client emits `typing:stop` with `{ conversationId }` when user stops typing (debounced, e.g., 3 seconds of inactivity)
- Server broadcasts `typing:start` and `typing:stop` to all other participants in the conversation room
- Typing events are ephemeral — not persisted in the database
- Server-side safety: auto-emits `typing:stop` if no `typing:start` refresh received within 5 seconds (prevents stuck indicators)
- Only conversation participants can emit typing events; others are silently ignored

**Unit tests:**
- typing:start broadcast to other participants, not sender
- typing:stop broadcast to other participants
- Auto-stop after 5-second timeout
- Non-participant typing events ignored

### MSG-14: Unread message count (badge)
**As a** user viewing the bottom navigation bar
**I want** to see a badge with my total unread message count
**So that** I know when I have new messages.

**Acceptance criteria:**
- `GET /conversations/unread-count` (requires auth)
- Returns the total number of unread messages across all conversations for the authenticated user
- Computed as: sum of messages in each conversation where `message.createdAt > conversationParticipant.lastReadAt`
- Returns `200 { data: { unreadCount } }`
- Result is cached in Redis with a short TTL (30 seconds) and invalidated when a new message is received or messages are marked as read
- WebSocket also emits `unread:update` with `{ unreadCount }` to the user's personal room whenever count changes

**Unit tests:**
- Correct count across multiple conversations
- Count updates after marking messages as read
- Cache invalidation on new message
- Returns 0 when all messages are read

### MSG-15: System messages (auto-generated)
**As the** system
**I want** to automatically generate contextual messages in conversations
**So that** users are informed of important events within the chat.

**Acceptance criteria:**
- System messages are created by a service function (not an endpoint) and inserted as `Message` with `type: SYSTEM` and `senderId: null`
- Triggers and content:
  - Booking confirmed: "Booking confirmed for {date} at {time}."
  - Booking cancelled: "Booking cancelled by {party}."
  - Booking completed: "Booking completed. Don't forget to leave a review!"
  - Listing marked as sold (marketplace conversation): "This item has been marked as sold."
- System messages are broadcast via WebSocket `message:received` like regular messages
- System messages are visually distinguishable in the response (type: SYSTEM, no sender)
- System messages count toward unread count

**Unit tests:**
- Each trigger generates the correct system message text
- System message has null senderId and type SYSTEM
- WebSocket event emitted for system messages
- System messages included in chat history

### MSG-16: Online status
**As a** user viewing the conversation list
**I want** to see which participants are currently online
**So that** I know if they are likely to respond quickly.

**Acceptance criteria:**
- Online status tracked in Redis: `user:{userId}:online` with 5-minute TTL, refreshed by WebSocket heartbeat (every 60 seconds)
- `GET /conversations` (MSG-09) includes `isOnline` for each participant based on Redis lookup
- On WebSocket connect: status set to online in Redis
- On WebSocket disconnect: status expires after TTL (not immediately removed, to handle brief disconnects)
- No dedicated endpoint for online status — it is included in conversation list responses and WebSocket presence events

**Unit tests:**
- Online status set in Redis on connect
- Status expires after TTL
- Conversation list includes correct online status for participants
- Heartbeat refreshes TTL

### MSG-17: Conversation linked to booking context
**As a** mother or nanny viewing a booking conversation
**I want** to see booking details in the chat header
**So that** I have context about the care session while messaging.

**Acceptance criteria:**
- `GET /conversations/:id` (requires auth)
- If conversation type is `BOOKING`, response includes a `bookingContext` object: `{ bookingId, date, startTime, endTime, status, childName, nannyName }`
- If conversation type is `MARKETPLACE`, response includes a `listingContext` object: `{ listingId, title, price, firstPhotoUrl, status }`
- If conversation type is `GENERAL`, no linked context
- Only conversation participants can access; non-participant returns `403`
- Returns `200 { data: { conversation } }` with full details including context

**Unit tests:**
- BOOKING conversation includes bookingContext with correct fields
- MARKETPLACE conversation includes listingContext with correct fields
- GENERAL conversation has no linked context
- Non-participant returns 403

---

## API Route Summary

| Method | Path | Auth | Role | Story |
|--------|------|------|------|-------|
| `POST` | `/conversations` | Yes | any | MSG-05 |
| `GET` | `/conversations` | Yes | any | MSG-09 |
| `GET` | `/conversations/unread-count` | Yes | any | MSG-14 |
| `GET` | `/conversations/:id` | Yes | any | MSG-17 |
| `POST` | `/conversations/:id/messages` | Yes | any | MSG-07, MSG-08 |
| `POST` | `/conversations/:id/messages/upload-url` | Yes | any | MSG-08 |
| `GET` | `/conversations/:id/messages` | Yes | any | MSG-10 |
| `POST` | `/conversations/:id/read` | Yes | any | MSG-11 |

**WebSocket Events (Socket.io):**

| Event | Direction | Persisted | Story |
|-------|-----------|-----------|-------|
| `message:send` | Client -> Server | Yes | MSG-12 |
| `message:received` | Server -> Client | N/A (broadcast) | MSG-12 |
| `message:read` | Server -> Client | N/A (broadcast) | MSG-11, MSG-12 |
| `typing:start` | Bidirectional | No | MSG-13 |
| `typing:stop` | Bidirectional | No | MSG-13 |
| `unread:update` | Server -> Client | No | MSG-14 |

---

## Implementation Order

```
MSG-01  Prisma: Conversation + ConversationParticipant
    |
MSG-02  Prisma: Message model
    |
MSG-03  Prisma: MessageReadReceipt model
    |
MSG-04  Shared Zod schemas
    |
MSG-05  Create conversation ──── MSG-06  Auto-create on booking confirm
    |                                |
MSG-07  Send text message           |
    |                                |
MSG-08  Send image message           |
    |________________________________|
    |
MSG-12  WebSocket connection + real-time events
    |
MSG-09  Get conversation list ──── MSG-10  Get chat history
    |                                  |
MSG-11  Mark messages as read     MSG-13  Typing indicators
    |                                  |
MSG-14  Unread count badge        MSG-16  Online status
    |
MSG-15  System messages
    |
MSG-17  Conversation linked to booking/listing context
```

---

## Non-Functional Requirements (from PRD Table 18)

| Requirement | Target |
|---|---|
| Message delivery latency (WebSocket) | < 500ms for connected clients |
| Chat history pagination load | < 1 second |
| Conversation list initial render | < 1.5 seconds |
| WebSocket authentication | Firebase JWT verified on connection |
| WebSocket horizontal scaling | Redis pub/sub adapter for multi-instance Socket.io |
| Online status TTL | 5 minutes (refreshed by 60-second heartbeat) |
| Typing indicator timeout | Auto-stop after 5 seconds of no refresh |
| Message content max length | 5000 characters |
| Image message max size | 5 MB (image/jpeg, image/png) |
| Unread count cache TTL | 30 seconds in Redis |
| General API rate limit | 100 req / 15 min per user |
| Message persistence | PostgreSQL (all messages persisted; typing indicators excluded) |
| Push notifications (offline) | FCM push for messages when recipient is not connected via WebSocket |
| Data retention | Messages retained until conversation is deleted by both parties or moderated |
