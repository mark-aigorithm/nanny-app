# Epic 4: Live Care Monitoring & Care Log

## Context

NannyMom provides real-time care visibility to mothers during active bookings. Nannies log care activities (meals, naps, diapers, play) which stream to the parent's activity feed via WebSocket. Mothers can also watch a live video feed of the care session using WebRTC, with two-way audio, photo capture, and clip recording. A daily update summary can be pushed to the mother at the nanny's discretion.

All care log data is immutable after the booking ends. During an active booking, only the assigned nanny may create or edit entries. The parent sees entries in real time and can filter, annotate, and mark them as read.

**PRD references:** Section 6.4 (FR-04-*), Section 6.5 (FR-06-*), Section 6.6 (FR-05-*), Table 18 (NFRs), Table 21 (Notifications)
**Architecture references:** WebRTC signaling via WebSocket, Firestore for live location (repurposed for care events), S3 for photo/clip storage

---

## Prerequisites (Prisma Models)

### CARE-01: Prisma schema — CareLogEntry model
**As a** developer
**I want** the Prisma schema to define the `CareLogEntry` model
**So that** nannies can persist care activity records linked to bookings and children.

**Acceptance criteria:**
- `CareLogEntry` model with fields: `id` (UUID), `bookingId` (FK to Booking), `nannyId` (FK to User), `childId` (FK to Child), `type` (enum: MEAL, NAP, DIAPER, ACTIVITY), `timestamp` (DateTime, defaults to now), `notes` (String, nullable, max 500 chars), `mealOunces` (Float, nullable — populated when type = MEAL), `diaperWet` (Boolean, nullable — populated when type = DIAPER), `diaperDirty` (Boolean, nullable — populated when type = DIAPER), `isEditable` (Boolean, default true), `createdAt`, `updatedAt`
- Enum `CareLogType { MEAL NAP DIAPER ACTIVITY }`
- Index on `(bookingId, timestamp)` for chronological queries
- Index on `(bookingId, type)` for filtered queries
- Relation: `CareLogEntry` belongs to `Booking`, `User` (nanny), and `Child`
- Migration generated and applied: `pnpm db:migrate:dev`
- Prisma client generated: `pnpm db:generate`

**Unit tests:**
- Verify migration applies cleanly on a fresh database
- Verify enum values match expected set

### CARE-02: Prisma schema — CarePhoto model
**As a** developer
**I want** the Prisma schema to define the `CarePhoto` model
**So that** photos taken during care (from log entries or video feed captures) are stored and linked.

**Acceptance criteria:**
- `CarePhoto` model with fields: `id` (UUID), `careLogEntryId` (FK to CareLogEntry, nullable — null for video feed captures), `bookingId` (FK to Booking), `uploadedById` (FK to User), `s3Key` (String), `url` (String — CloudFront URL), `capturedAt` (DateTime), `source` (enum: LOG_ATTACHMENT, VIDEO_CAPTURE), `createdAt`
- Enum `PhotoSource { LOG_ATTACHMENT VIDEO_CAPTURE }`
- Relation: `CarePhoto` optionally belongs to `CareLogEntry`, always belongs to `Booking`
- S3 key format: `care-photos/{bookingId}/{uuid}.{ext}`
- Migration generated and applied

**Unit tests:**
- Verify nullable `careLogEntryId` allows video capture photos without a log entry
- Verify cascade delete: deleting a `CareLogEntry` deletes associated `CarePhoto` records

### CARE-03: Prisma schema — VideoSession model
**As a** developer
**I want** the Prisma schema to define the `VideoSession` model
**So that** live video monitoring sessions are tracked for auditing and billing.

**Acceptance criteria:**
- `VideoSession` model with fields: `id` (UUID), `bookingId` (FK to Booking), `motherId` (FK to User), `nannyId` (FK to User), `startedAt` (DateTime), `endedAt` (DateTime, nullable), `durationSeconds` (Int, nullable — computed on end), `hasAudio` (Boolean, default false), `clipS3Keys` (String[] — array of S3 keys for recorded clips), `createdAt`
- Relation: `VideoSession` belongs to `Booking`, `User` (mother), `User` (nanny)
- Index on `(bookingId, startedAt)` for session history queries
- Only one active session (where `endedAt IS NULL`) per booking at a time (enforced at service layer)
- Migration generated and applied

**Unit tests:**
- Verify model creation with all fields
- Verify `clipS3Keys` stores an array of strings

### CARE-04: Shared Zod schemas for care monitoring
**As a** developer
**I want** Zod schemas for care log entries, photos, and video sessions in `packages/shared`
**So that** both backend validation and mobile type safety use a single source of truth.

**Acceptance criteria:**
- `packages/shared/src/care-log.ts` exports:
  - `CareLogTypeEnum` (z.enum: `meal`, `nap`, `diaper`, `activity`)
  - `CreateCareLogEntrySchema` — `{ bookingId, childId, type, timestamp?, notes?, mealOunces?, diaperWet?, diaperDirty? }` with conditional validation (mealOunces required when type = meal, diaperWet/diaperDirty required when type = diaper)
  - `UpdateCareLogEntrySchema` — partial of create (only notes and type-specific fields editable)
  - `CareLogEntryResponseSchema`, `CareLogFilterSchema` (type filter, date range)
- `packages/shared/src/video-session.ts` exports:
  - `StartVideoSessionSchema` — `{ bookingId }`
  - `VideoSessionResponseSchema`
- All types inferred with `z.infer<>` and re-exported from `packages/shared/src/index.ts`
- `pnpm build --filter=@nanny-app/shared` succeeds

**Unit tests:**
- Conditional validation: `mealOunces` required when type is `meal`, rejected when type is `nap`
- `diaperWet` and `diaperDirty` required when type is `diaper`
- `notes` max length 500 enforced

---

## Live Video Monitoring Stories

### CARE-05: WebRTC signaling server (WebSocket)
**As a** backend service
**I want** a WebSocket signaling server for WebRTC session negotiation
**So that** mothers and nannies can establish peer-to-peer video connections.

**Acceptance criteria:**
- `src/services/video.service.ts` manages signaling logic
- WebSocket server (`ws` library) attached to the Express HTTP server at path `/ws/video`
- Authentication: first message must be a valid Firebase JWT; unauthenticated connections are closed after 5 seconds
- Signaling messages: `offer`, `answer`, `ice-candidate`, `session-start`, `session-end`, `audio-toggle`
- Messages are relayed only between the mother and nanny of the same active booking (validated via bookingId lookup)
- Connection state tracked in Redis with TTL (key: `video:session:{bookingId}`, value: participant UIDs)
- On `session-start`: creates a `VideoSession` record in PostgreSQL
- On `session-end`: updates `endedAt` and computes `durationSeconds`
- Nanny receives an in-app push notification (FCM) when the mother starts a session (FR-04-07)
- Graceful cleanup on unexpected disconnect (Redis key expiry + VideoSession record updated)

**Unit tests:**
- Unauthenticated connection rejected after 5s
- Signaling messages relayed only to correct booking participant
- Session start creates DB record
- Session end updates DB record with duration
- Disconnect triggers cleanup

### CARE-06: Two-way audio toggle
**As a** mother
**I want** to toggle two-way audio during a live video session
**So that** I can speak to my child or the nanny.

**Acceptance criteria:**
- `audio-toggle` WebSocket message: `{ type: "audio-toggle", bookingId, enabled: boolean }`
- Backend relays the toggle to the nanny's client so the nanny's device unmutes/mutes the microphone
- `VideoSession.hasAudio` updated to `true` if audio is enabled at any point during the session
- Audio toggle is only available during an active video session; returns error otherwise
- Rate limited: max 10 toggles per minute per session (prevent spam)

**Unit tests:**
- Toggle relayed to nanny
- `hasAudio` set to true after first enable
- Toggle rejected when no active session
- Rate limit enforced

### CARE-07: Photo capture from video feed
**As a** mother
**I want** to take a still photo from the live video feed
**So that** I can save memorable moments from the care session.

**Acceptance criteria:**
- `POST /care/video-sessions/:sessionId/capture` (requires auth, role: MOTHER)
- Returns a presigned S3 upload URL for the client to PUT the captured frame
- S3 key format: `care-photos/{bookingId}/{uuid}.jpg`
- After client confirms upload, creates a `CarePhoto` record with `source: VIDEO_CAPTURE`
- `POST /care/video-sessions/:sessionId/capture/confirm` — `{ s3Key }` — creates the CarePhoto record
- Only the mother of the active booking can capture photos
- Returns `200 { data: { uploadUrl, s3Key } }` and `201 { data: { photo } }` for confirm
- Max 50 captures per session

**Unit tests:**
- Presigned URL generated with correct key format
- CarePhoto record created on confirm
- Unauthorized user rejected (403)
- Capture limit enforced (429 after 50)

### CARE-08: Clip recording from video feed
**As a** mother
**I want** to record short clips from the live video feed
**So that** I can save important moments for later review.

**Acceptance criteria:**
- `POST /care/video-sessions/:sessionId/clip/start` (requires auth, role: MOTHER) — returns `{ clipId, s3Key }`
- `POST /care/video-sessions/:sessionId/clip/stop` — `{ clipId }` — finalizes the clip
- Clip S3 key format: `care-clips/{bookingId}/{uuid}.webm`
- On stop: appends the S3 key to `VideoSession.clipS3Keys` array
- Clips retained for 7 days (S3 lifecycle rule — documented, not enforced by backend)
- Max clip duration: 5 minutes (enforced client-side; backend records duration)
- Only the mother of the active booking can record clips
- Returns `200 { data: { clipId, uploadUrl } }` and `200 { data: { clip } }` for stop

**Unit tests:**
- Clip start returns presigned URL and clipId
- Clip stop appends S3 key to VideoSession
- Unauthorized user rejected
- Only one clip recording at a time per session

### CARE-09: Video session timer and history
**As a** mother
**I want** to see the session duration and access past session history
**So that** I can track how long I've been monitoring and review past sessions.

**Acceptance criteria:**
- `GET /care/video-sessions?bookingId={id}` (requires auth, role: MOTHER) — returns all sessions for a booking, sorted by `startedAt` descending
- Each session includes: `id`, `startedAt`, `endedAt`, `durationSeconds`, `hasAudio`, `clipCount`
- Pagination: cursor-based, 20 per page
- Session duration is computed server-side on `session-end`; for active sessions, the client computes elapsed time from `startedAt`
- Only the mother or nanny of the booking can view sessions
- Returns `200 { data: [sessions], meta: { cursor, hasMore } }`

**Unit tests:**
- Returns sessions for correct booking only
- Pagination works correctly
- Unauthorized user rejected (not a participant of the booking)

---

## Nanny Care Log Entry Stories

### CARE-10: Create care log entry
**As a** nanny
**I want** to log a care activity (meal, nap, diaper, play) during an active booking
**So that** the parent can see what their child has been doing.

**Acceptance criteria:**
- `POST /care/log` (requires auth, role: NANNY)
- Request body validated with `CreateCareLogEntrySchema`
- Booking must be in ACTIVE status (nanny has checked in, not yet checked out) — returns `403` otherwise (FR-06-05)
- Nanny must be the assigned nanny for the booking — returns `403` otherwise
- Creates `CareLogEntry` record with `isEditable: true`
- Pushes real-time update to the mother via WebSocket event `care-log:new` (FR-06-03)
- Updates child status indicator: stores latest activity type in Redis key `child:status:{childId}` with booking TTL (FR-06-06)
- Returns `201 { data: { entry } }`
- Rate limited: max 60 entries per hour per nanny (prevent spam)

**Unit tests:**
- Happy path: each of the 4 activity types created successfully
- Conditional fields validated (mealOunces for MEAL, diaperWet/diaperDirty for DIAPER)
- Inactive booking rejected (403)
- Wrong nanny rejected (403)
- WebSocket event emitted
- Redis child status updated
- Rate limit enforced

### CARE-11: Update care log entry
**As a** nanny
**I want** to edit a care log entry I previously created
**So that** I can correct mistakes or add details.

**Acceptance criteria:**
- `PATCH /care/log/:entryId` (requires auth, role: NANNY)
- Request body validated with `UpdateCareLogEntrySchema` (notes and type-specific fields only)
- Entry must have `isEditable: true` — returns `403 { error: "Entry is locked" }` otherwise (FR-06-07)
- Only the nanny who created the entry can edit it
- Pushes real-time update to the mother via WebSocket event `care-log:updated`
- Returns `200 { data: { entry } }`

**Unit tests:**
- Happy path: notes updated successfully
- Locked entry rejected (403)
- Wrong nanny rejected (403)
- WebSocket event emitted on update

### CARE-12: Lock care log entries on booking end
**As a** system
**I want** all care log entries to become immutable when a booking ends
**So that** the historical record cannot be tampered with after the fact.

**Acceptance criteria:**
- When a booking transitions to COMPLETED or CANCELLED status, a service function `lockCareLogEntries(bookingId)` runs
- Sets `isEditable = false` on all `CareLogEntry` records for that booking in a single batch update
- This function is called from the booking completion service (cross-service call)
- Idempotent: calling it multiple times has no adverse effect
- Returns the count of entries locked

**Unit tests:**
- All entries for a booking set to `isEditable: false`
- Already-locked entries remain unchanged (idempotent)
- Entries for other bookings are unaffected

### CARE-13: Attach photo to care log entry
**As a** nanny
**I want** to attach a photo to a care log entry
**So that** the parent can see visual evidence of the activity.

**Acceptance criteria:**
- `POST /care/log/:entryId/photos` (requires auth, role: NANNY)
- Returns a presigned S3 upload URL
- S3 key format: `care-photos/{bookingId}/{entryId}/{uuid}.{ext}`
- Accepted types: `image/jpeg`, `image/png`, `image/webp` (max 5MB)
- `POST /care/log/:entryId/photos/confirm` — `{ s3Key }` — creates `CarePhoto` record with `source: LOG_ATTACHMENT`
- Max 4 photos per entry
- Entry must be editable (active booking)
- Pushes WebSocket event `care-log:photo-added` to the mother
- Returns `200 { data: { uploadUrl, s3Key } }` and `201 { data: { photo } }`

**Unit tests:**
- Presigned URL generated correctly
- CarePhoto record created on confirm
- Max 4 photos enforced (429 on 5th)
- Locked entry rejected (403)
- WebSocket event emitted

---

## Parent Care Activity Feed Stories

### CARE-14: Get care activity feed
**As a** mother
**I want** to view all care log entries for my child's current and recent bookings
**So that** I can stay informed about my child's care.

**Acceptance criteria:**
- `GET /care/feed?bookingId={id}` (requires auth, role: MOTHER)
- Returns `CareLogEntry` records with associated `CarePhoto` records, sorted by `timestamp` descending
- Grouped by date (today, yesterday, earlier) — grouping computed server-side
- Includes child status indicator (latest activity type from Redis)
- Pagination: cursor-based, 20 entries per page
- Only the mother linked to the booking can access the feed
- Returns `200 { data: { groups: [{ date, entries }], childStatus }, meta: { cursor, hasMore } }`

**Unit tests:**
- Entries returned in reverse chronological order
- Date grouping correct (today/yesterday/earlier)
- Photos included with entries
- Unauthorized mother rejected (403)
- Pagination works correctly

### CARE-15: Filter care activity feed by type
**As a** mother
**I want** to filter the care activity feed by activity type
**So that** I can quickly find specific types of entries (e.g., only meals).

**Acceptance criteria:**
- `GET /care/feed?bookingId={id}&type=MEAL` (query param, validated with `CareLogFilterSchema`)
- Supports multiple types: `?type=MEAL&type=NAP`
- Mapped filter labels: All, Health (DIAPER), Play (ACTIVITY), Meals (MEAL), Sleep (NAP) — mapping is client-side, backend accepts raw enum values
- Empty result returns `200 { data: { groups: [], childStatus } }`

**Unit tests:**
- Single type filter returns correct entries
- Multiple type filter returns union of matching entries
- Invalid type returns 400

### CARE-16: Real-time care log push via WebSocket
**As a** mother
**I want** to receive new care log entries in real time without refreshing
**So that** I see updates as soon as the nanny logs them.

**Acceptance criteria:**
- WebSocket server at `/ws/care` (separate from video signaling)
- Authentication: first message must be a valid Firebase JWT
- Mother subscribes to a booking channel: `{ type: "subscribe", bookingId }`
- Server validates mother is a participant of the booking
- Events pushed to the mother: `care-log:new`, `care-log:updated`, `care-log:photo-added`
- Each event payload includes the full serialized `CareLogEntry` (with photos if applicable)
- Connection state tracked in Redis: `care:ws:{userId}` with TTL
- Graceful reconnect: on reconnect, client sends last known entry timestamp; server pushes any entries created after that timestamp

**Unit tests:**
- Subscription validated against booking participants
- Events pushed only to subscribed mother
- Reconnect delivers missed entries
- Unauthenticated connection rejected

### CARE-17: Unread badge and mark as read
**As a** mother
**I want** to see which care log entries are new since I last opened the feed
**So that** I don't miss any updates.

**Acceptance criteria:**
- Redis key `care:unread:{userId}:{bookingId}` stores a count of unread entries
- Incremented when `care-log:new` event is pushed and mother is not actively connected to the WebSocket
- `GET /care/feed/unread?bookingId={id}` (requires auth, role: MOTHER) — returns `{ unreadCount }`
- `POST /care/feed/mark-read` — `{ bookingId }` — resets the unread counter to 0
- Unread count included in the care feed response as `meta.unreadCount`

**Unit tests:**
- Unread count incremented on new entry when mother is offline
- Unread count not incremented when mother is connected
- Mark as read resets counter to 0
- Unread count returned in feed response

---

## Daily Update Summary

### CARE-18: Send daily update
**As a** nanny
**I want** to send a compiled daily update to the mother
**So that** the mother gets a convenient summary of the day's care activities.

**Acceptance criteria:**
- `POST /care/daily-update` (requires auth, role: NANNY) — `{ bookingId }`
- Compiles all `CareLogEntry` records for the current booking day into a summary
- Summary includes: count per activity type, notable notes, photo count
- Sends a formatted push notification (FCM) to the mother with the summary text (FR-06-04)
- Also creates an in-app notification record for persistence
- Rate limited: 1 daily update per booking per day
- Booking must be active
- Returns `200 { data: { message: "Daily update sent", summary } }`

**Unit tests:**
- Summary correctly aggregates entries by type
- FCM push notification sent with correct payload
- In-app notification record created
- Duplicate send on same day rejected (429)
- Inactive booking rejected (403)

---

## Child Status Indicator

### CARE-19: Child status indicator
**As a** mother
**I want** to see a real-time status indicator showing my child's most recent activity
**So that** I have an at-a-glance view of what my child is doing.

**Acceptance criteria:**
- Redis key `child:status:{childId}` stores: `{ type, timestamp, nannyName }` with TTL equal to booking duration + 1 hour
- Updated on every new care log entry (CARE-10)
- `GET /care/child-status/:childId` (requires auth, role: MOTHER) — returns current status from Redis, falls back to latest `CareLogEntry` from PostgreSQL if Redis key expired
- Status maps to a display label and color on the client (e.g., NAP = "Sleeping", purple)
- Only the mother linked to the child can access the status
- Returns `200 { data: { childId, type, timestamp, nannyName } }` or `200 { data: null }` if no active booking

**Unit tests:**
- Status returned from Redis when available
- Fallback to PostgreSQL when Redis key missing
- Unauthorized mother rejected (403)
- Null returned when no active booking

---

## API Route Summary

| Method | Path | Auth | Role | Story |
|--------|------|------|------|-------|
| `POST` | `/care/log` | Yes | NANNY | CARE-10 |
| `PATCH` | `/care/log/:entryId` | Yes | NANNY | CARE-11 |
| `POST` | `/care/log/:entryId/photos` | Yes | NANNY | CARE-13 |
| `POST` | `/care/log/:entryId/photos/confirm` | Yes | NANNY | CARE-13 |
| `GET` | `/care/feed` | Yes | MOTHER | CARE-14, CARE-15 |
| `GET` | `/care/feed/unread` | Yes | MOTHER | CARE-17 |
| `POST` | `/care/feed/mark-read` | Yes | MOTHER | CARE-17 |
| `POST` | `/care/daily-update` | Yes | NANNY | CARE-18 |
| `GET` | `/care/child-status/:childId` | Yes | MOTHER | CARE-19 |
| `POST` | `/care/video-sessions/:sessionId/capture` | Yes | MOTHER | CARE-07 |
| `POST` | `/care/video-sessions/:sessionId/capture/confirm` | Yes | MOTHER | CARE-07 |
| `POST` | `/care/video-sessions/:sessionId/clip/start` | Yes | MOTHER | CARE-08 |
| `POST` | `/care/video-sessions/:sessionId/clip/stop` | Yes | MOTHER | CARE-08 |
| `GET` | `/care/video-sessions` | Yes | MOTHER, NANNY | CARE-09 |
| `WS` | `/ws/video` | Yes (first msg) | MOTHER, NANNY | CARE-05, CARE-06 |
| `WS` | `/ws/care` | Yes (first msg) | MOTHER | CARE-16 |

---

## Implementation Order

```
CARE-01  Prisma: CareLogEntry
    |
CARE-02  Prisma: CarePhoto
    |
CARE-03  Prisma: VideoSession
    |
CARE-04  Shared Zod schemas
    |
    ├──────────────────────────────────────┐
    |                                      |
CARE-05  WebRTC signaling (WebSocket)   CARE-10  Create care log entry
    |                                      |
CARE-06  Two-way audio toggle           CARE-11  Update care log entry
    |                                      |
CARE-07  Photo capture from feed        CARE-12  Lock entries on booking end
    |                                      |
CARE-08  Clip recording                 CARE-13  Attach photo to entry
    |                                      |
CARE-09  Session timer & history        CARE-16  Real-time care log push (WS)
                                           |
                                        CARE-14  Care activity feed
                                           |
                                        CARE-15  Filter feed by type
                                           |
                                        CARE-17  Unread badge & mark read
                                           |
                                        CARE-18  Send daily update
                                           |
                                        CARE-19  Child status indicator
```

---

## Non-Functional Requirements (from PRD Table 18)

| Requirement | Target |
|---|---|
| Live video feed latency | < 2 seconds camera-to-viewer under standard network conditions |
| Video stream encryption | End-to-end encrypted; stream URLs are single-session tokens that expire on disconnect |
| Video feed access control | Gated to the mother of the active booking only; sharing/exporting prohibited |
| Auto-reconnect on stream drop | 3 retry attempts with visual status indicator; error displayed after 3 failures |
| Care log offline support (nanny) | Queue entries locally and sync when connectivity restored |
| Care log real-time delivery | Entries appear in mother's feed without manual refresh (WebSocket push) |
| Feed initial render | < 1.5 seconds; pagination loads < 1 second |
| Video clip retention | 7 days (S3 lifecycle rule, configurable via Table 19) |
| Care log data retention | 2 years |
| Booking record retention | 7 years |
| General API rate limit | 100 req / 15 min per user |
| Care log entry rate limit | 60 entries / hour per nanny |
| Daily update rate limit | 1 per booking per day |
| Nanny notification on feed activation | In-app notification when mother starts live feed (FR-04-07) |
