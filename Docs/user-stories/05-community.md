# Epic 5: Community Feed & Events

## Context

NannyMom includes a local community layer where verified mothers can share posts, ask questions, list items for sale, announce events, and discover nearby meetups. The community feed is location-scoped (default 10-mile radius via PostGIS) and supports multiple post types. Events have RSVP management with capacity limits. Content moderation (keyword auto-flagging + user reports + admin review) ensures a safe environment.

Real-time presence ("X moms online nearby") is tracked via Redis + WebSocket. Push notifications keep users engaged with RSVP confirmations and event reminders. Past events are auto-archived 48 hours after their end time.

**PRD references:** Section 6.7 (FR-08-*), Section 6.8 (FR-09-*), Table 18 (NFRs), Table 19 (Config), Table 21 (Notifications)
**Architecture references:** PostGIS for radius queries, Redis for presence tracking, S3 for post images, FCM for push notifications, SQS + Lambda for async moderation jobs

---

## Prerequisites (Prisma Models)

### COMM-01: Prisma schema — Post model
**As a** developer
**I want** the Prisma schema to define the `Post` model
**So that** mothers can create community posts of various types.

**Acceptance criteria:**
- `Post` model with fields: `id` (UUID), `authorId` (FK to User), `type` (enum: DISCUSSION, MARKETPLACE, EVENT, QUESTION), `title` (String, nullable — required for MARKETPLACE and EVENT types), `body` (String, max 2000 chars), `imageUrls` (String[] — up to 4 images), `price` (Decimal, nullable — populated for MARKETPLACE type), `isUrgent` (Boolean, default false), `isFlagged` (Boolean, default false), `flagReason` (String, nullable), `isDeleted` (Boolean, default false — soft delete), `likeCount` (Int, default 0), `commentCount` (Int, default 0), `location` (Unsupported("geography(Point, 4326)") — PostGIS point), `createdAt`, `updatedAt`
- Enum `PostType { DISCUSSION MARKETPLACE EVENT QUESTION }`
- PostGIS spatial index on `location` for radius queries
- Index on `(type, createdAt)` for filtered feed queries
- Index on `(authorId, createdAt)` for "my posts" queries
- Relation: `Post` belongs to `User` (author)
- Migration generated and applied: `pnpm db:migrate:dev`
- Prisma client generated: `pnpm db:generate`

**Unit tests:**
- Verify migration applies cleanly on a fresh database
- Verify enum values match expected set
- Verify spatial index created

### COMM-02: Prisma schema — Comment model
**As a** developer
**I want** the Prisma schema to define the `Comment` model
**So that** mothers can comment on community posts.

**Acceptance criteria:**
- `Comment` model with fields: `id` (UUID), `postId` (FK to Post), `authorId` (FK to User), `parentCommentId` (FK to Comment, nullable — for threaded replies), `body` (String, max 1000 chars), `isFlagged` (Boolean, default false), `isDeleted` (Boolean, default false — soft delete), `createdAt`, `updatedAt`
- Relation: `Comment` belongs to `Post` and `User` (author); self-referential for threaded replies
- Index on `(postId, createdAt)` for chronological comment queries
- On comment create, `Post.commentCount` incremented (handled at service layer)
- Migration generated and applied

**Unit tests:**
- Verify threaded reply via `parentCommentId`
- Verify cascade: soft-deleting a post soft-deletes its comments (service layer)

### COMM-03: Prisma schema — PostReaction model
**As a** developer
**I want** the Prisma schema to define the `PostReaction` model
**So that** mothers can like/heart community posts.

**Acceptance criteria:**
- `PostReaction` model with fields: `id` (UUID), `postId` (FK to Post), `userId` (FK to User), `type` (enum: LIKE, HEART), `createdAt`
- Enum `ReactionType { LIKE HEART }`
- Unique constraint on `(postId, userId)` — one reaction per user per post
- On reaction create/delete, `Post.likeCount` incremented/decremented (service layer)
- Migration generated and applied

**Unit tests:**
- Verify unique constraint prevents duplicate reactions
- Verify enum values

### COMM-04: Prisma schema — Event model
**As a** developer
**I want** the Prisma schema to define the `Event` model
**So that** mothers can create and discover community events.

**Acceptance criteria:**
- `Event` model with fields: `id` (UUID), `organizerId` (FK to User), `postId` (FK to Post, nullable — events created from a post), `title` (String), `description` (String, max 2000 chars), `coverImageUrl` (String, nullable), `startTime` (DateTime), `endTime` (DateTime), `location` (Unsupported("geography(Point, 4326)") — PostGIS point), `venueName` (String), `venueAddress` (String), `ageRangeMin` (Int, nullable), `ageRangeMax` (Int, nullable), `privacy` (enum: PUBLIC, INVITE_ONLY), `maxAttendees` (Int, nullable), `currentAttendees` (Int, default 0), `isArchived` (Boolean, default false), `isFlagged` (Boolean, default false), `category` (String, nullable — e.g., "Playdate", "Educational", "Workshop"), `createdAt`, `updatedAt`
- Enum `EventPrivacy { PUBLIC INVITE_ONLY }`
- PostGIS spatial index on `location` for radius queries
- Index on `(startTime, isArchived)` for upcoming event queries
- Relation: `Event` belongs to `User` (organizer), optionally to `Post`
- Migration generated and applied

**Unit tests:**
- Verify model creation with all fields
- Verify spatial index created
- Verify privacy enum values

### COMM-05: Prisma schema — EventRSVP model
**As a** developer
**I want** the Prisma schema to define the `EventRSVP` model
**So that** RSVP attendance is tracked with capacity enforcement.

**Acceptance criteria:**
- `EventRSVP` model with fields: `id` (UUID), `eventId` (FK to Event), `userId` (FK to User), `status` (enum: CONFIRMED, CANCELLED), `createdAt`, `updatedAt`
- Enum `RSVPStatus { CONFIRMED CANCELLED }`
- Unique constraint on `(eventId, userId)` — one RSVP per user per event
- Relation: `EventRSVP` belongs to `Event` and `User`
- Migration generated and applied

**Unit tests:**
- Verify unique constraint prevents duplicate RSVPs
- Verify enum values

### COMM-06: Shared Zod schemas for community
**As a** developer
**I want** Zod schemas for posts, comments, reactions, events, and RSVPs in `packages/shared`
**So that** both backend validation and mobile type safety use a single source of truth.

**Acceptance criteria:**
- `packages/shared/src/community.ts` exports:
  - `PostTypeEnum` (z.enum: `discussion`, `marketplace`, `event`, `question`)
  - `CreatePostSchema` — `{ type, title?, body, imageUrls?, price?, isUrgent?, latitude, longitude }` with conditional validation (title required for marketplace/event, price required for marketplace)
  - `UpdatePostSchema` — partial of create (body, title, imageUrls, price, isUrgent)
  - `PostResponseSchema`, `PostFeedFilterSchema` (type, radius, cursor)
  - `CreateCommentSchema` — `{ postId, body, parentCommentId? }`
  - `ReactionTypeEnum`, `ToggleReactionSchema` — `{ postId, type }`
- `packages/shared/src/event.ts` exports:
  - `EventPrivacyEnum` (z.enum: `public`, `invite_only`)
  - `CreateEventSchema` — `{ title, description, coverImageUrl?, startTime, endTime, venueName, venueAddress, latitude, longitude, ageRangeMin?, ageRangeMax?, privacy, maxAttendees?, category? }` with validation (endTime > startTime, ageRangeMax >= ageRangeMin)
  - `UpdateEventSchema` — partial of create
  - `EventResponseSchema`, `EventFilterSchema` (category, ageRange, radius, cursor)
  - `RSVPSchema` — `{ eventId }`
- All types inferred with `z.infer<>` and re-exported from `packages/shared/src/index.ts`
- `pnpm build --filter=@nanny-app/shared` succeeds

**Unit tests:**
- Conditional validation: title required for marketplace/event post types
- Price required for marketplace type
- Event endTime must be after startTime
- ageRangeMax must be >= ageRangeMin when both provided
- Body max length enforced (2000 for posts, 1000 for comments)

---

## Community Post Stories

### COMM-07: Create community post
**As a** mother
**I want** to create a community post (discussion, marketplace, event, or question)
**So that** I can share with my local mom community.

**Acceptance criteria:**
- `POST /community/posts` (requires auth, role: MOTHER)
- Request body validated with `CreatePostSchema`
- `location` stored as PostGIS point from `latitude`/`longitude` in the request
- Image uploads: client uploads to S3 first (presigned URL via `POST /community/posts/upload`), then passes the S3 URLs in `imageUrls` (max 4)
- Auto-moderation: body and title scanned against a prohibited keywords list (stored in Redis, admin-configurable); if flagged, `isFlagged = true` and post enters admin review queue (FR-08-07)
- If post type is EVENT, an associated `Event` record is also created (via COMM-14)
- Returns `201 { data: { post } }`
- Rate limited: 10 posts per hour per user

**Unit tests:**
- Happy path: each of the 4 post types created successfully
- Conditional fields validated (title for marketplace/event, price for marketplace)
- Prohibited keyword triggers `isFlagged = true`
- Image URL count > 4 rejected (400)
- Rate limit enforced

### COMM-08: Get community feed
**As a** mother
**I want** to browse posts from nearby moms
**So that** I can stay connected with my local community.

**Acceptance criteria:**
- `GET /community/posts` (requires auth, role: MOTHER)
- Returns posts within the configured radius (default 10 miles) of the user's location
- Location filtering via PostGIS `ST_DWithin` raw query (per backend CLAUDE.md — raw SQL in service layer)
- Urgent posts (`isUrgent = true`) sorted above non-urgent posts (FR-08-06)
- Within each group (urgent/non-urgent), sorted by `createdAt` descending
- Excludes soft-deleted posts (`isDeleted = false`) and flagged posts pending review (`isFlagged = false` OR author is the requesting user)
- Each post includes: author (name, avatar), `likeCount`, `commentCount`, whether the current user has reacted
- Pagination: cursor-based, 20 per page
- Returns `200 { data: [posts], meta: { cursor, hasMore } }`

**Unit tests:**
- Only posts within radius returned (mock PostGIS query)
- Urgent posts appear first
- Soft-deleted posts excluded
- Flagged posts hidden from non-authors
- Current user's reaction status included
- Pagination works correctly

### COMM-09: Filter community feed by category
**As a** mother
**I want** to filter the community feed by post type
**So that** I can focus on specific content (e.g., only marketplace listings).

**Acceptance criteria:**
- `GET /community/posts?type=MARKETPLACE` (query param, validated with `PostFeedFilterSchema`)
- Supports single type filter; maps to the horizontal pill bar on the client (FR-08-04)
- Filter persists within the session (client-side concern)
- Custom radius override: `?radius=5` (in miles, max 25, min 1)
- Returns same response shape as COMM-08, filtered by type

**Unit tests:**
- Single type filter returns correct posts
- Custom radius applied to PostGIS query
- Invalid radius (0, 50) rejected (400)
- Invalid type rejected (400)

### COMM-10: Update own community post
**As a** mother
**I want** to edit a post I created
**So that** I can correct or update my content.

**Acceptance criteria:**
- `PATCH /community/posts/:postId` (requires auth, role: MOTHER)
- Request body validated with `UpdatePostSchema`
- Only the author can update their own post — returns `403` otherwise
- If body or title changes, re-run auto-moderation keyword scan
- If post was previously flagged and content changes, reset `isFlagged = false` (re-enters moderation)
- Returns `200 { data: { post } }`

**Unit tests:**
- Happy path: body updated
- Non-author rejected (403)
- Keyword scan re-runs on body change
- Flagged status reset on content change

### COMM-11: Delete own community post
**As a** mother
**I want** to delete a post I created
**So that** I can remove content I no longer want visible.

**Acceptance criteria:**
- `DELETE /community/posts/:postId` (requires auth, role: MOTHER)
- Soft delete: sets `isDeleted = true` (post remains in DB for moderation audit)
- Only the author can delete their own post — returns `403` otherwise
- Associated comments are also soft-deleted
- Returns `200 { data: { message: "Post deleted" } }`

**Unit tests:**
- Post `isDeleted` set to true
- Non-author rejected (403)
- Comments soft-deleted with the post

### COMM-12: Post reactions (like/heart)
**As a** mother
**I want** to react to community posts with a like or heart
**So that** I can engage with content I appreciate.

**Acceptance criteria:**
- `POST /community/posts/:postId/reactions` (requires auth, role: MOTHER)
- Request body validated with `ToggleReactionSchema`
- Toggle behavior: if reaction exists, remove it (decrement `likeCount`); if not, create it (increment `likeCount`)
- `Post.likeCount` updated atomically (Prisma transaction)
- Returns `200 { data: { reacted: boolean, likeCount: number } }`
- Soft-deleted posts cannot be reacted to — returns `404`

**Unit tests:**
- Reaction created, `likeCount` incremented
- Duplicate reaction removes it, `likeCount` decremented
- Soft-deleted post returns 404
- Atomic update: concurrent reactions maintain correct count

### COMM-13: Post comments and threads
**As a** mother
**I want** to comment on community posts and reply to other comments
**So that** I can participate in discussions.

**Acceptance criteria:**
- `POST /community/posts/:postId/comments` (requires auth, role: MOTHER)
- Request body validated with `CreateCommentSchema`
- `Post.commentCount` incremented atomically
- Threaded replies: if `parentCommentId` is provided, the comment is nested under the parent (one level deep only — no recursive nesting)
- Push notification (FCM) sent to the post author when a new comment is added (FR-08, Table 21)
- `GET /community/posts/:postId/comments` — returns comments sorted by `createdAt` ascending, with nested replies
- Pagination: cursor-based, 20 per page (top-level comments; replies loaded inline)
- Soft-deleted comments display as "[deleted]" but maintain thread structure
- Returns `201 { data: { comment } }` for create; `200 { data: [comments], meta }` for list

**Unit tests:**
- Comment created, `commentCount` incremented
- Threaded reply linked to parent
- Push notification sent to post author (not to self)
- Soft-deleted comment shows as "[deleted]"
- Pagination returns correct page

---

## Content Moderation Stories

### COMM-14: Auto-flag prohibited keywords
**As a** platform
**I want** posts and comments automatically scanned for prohibited content
**So that** harmful or inappropriate content is caught before it reaches the community.

**Acceptance criteria:**
- Prohibited keywords list stored in Redis set `moderation:keywords` (admin-manageable via `POST /admin/moderation/keywords`)
- On post create/update and comment create: scan `body` and `title` against the keyword list (case-insensitive, whole-word match)
- If match found: set `isFlagged = true`, store `flagReason` with matched keywords
- Flagged content is hidden from the public feed but visible to the author with a "pending review" banner
- Async: flag event pushed to SQS for admin review queue processing

**Unit tests:**
- Post with prohibited keyword flagged
- Case-insensitive matching works
- Partial word match does not flag (whole-word only)
- Comment flagging works independently of post flagging
- SQS message published on flag

### COMM-15: User report function
**As a** mother
**I want** to report a post or comment that violates community guidelines
**So that** moderators can review and take action.

**Acceptance criteria:**
- `POST /community/posts/:postId/report` (requires auth, role: MOTHER)
- `POST /community/comments/:commentId/report` (requires auth, role: MOTHER)
- Request body: `{ reason: string }` (max 500 chars)
- Creates a moderation report record (new model or stored in a `Report` table: `id`, `reporterId`, `targetType` (POST/COMMENT), `targetId`, `reason`, `status` (PENDING/REVIEWED/DISMISSED), `createdAt`)
- If a post/comment receives 3+ unique reports, auto-flag it (`isFlagged = true`)
- User cannot report the same content twice — returns `409`
- Returns `201 { data: { message: "Report submitted" } }`

**Unit tests:**
- Report created successfully
- Duplicate report rejected (409)
- 3 unique reports trigger auto-flag
- Report on own content allowed (edge case)

---

## Real-Time Presence

### COMM-16: Real-time "X moms online nearby" indicator
**As a** mother
**I want** to see how many moms are currently online nearby
**So that** I feel connected to an active community.

**Acceptance criteria:**
- Presence tracked via WebSocket connection at `/ws/community` or via heartbeat endpoint
- On connect: user's location + timestamp stored in Redis sorted set `presence:online` (score = timestamp, value = `{userId}:{lat}:{lng}`)
- Entries expire after 5 minutes of inactivity (no heartbeat)
- `GET /community/presence?latitude={lat}&longitude={lng}` (requires auth, role: MOTHER) — returns count of online users within 10-mile radius
- Count computed via Redis sorted set scan + Haversine distance filter (approximate; PostGIS not needed for presence)
- Updates every 5 minutes (FR-08-05) — client polls or receives via WebSocket
- Returns `200 { data: { onlineCount } }`

**Unit tests:**
- User added to presence set on connect
- Expired entries excluded from count
- Distance filter returns correct count
- Count updates on new connections/disconnections

---

## Community Event Stories

### COMM-17: Create community event
**As a** mother
**I want** to create a community event (playdate, workshop, etc.)
**So that** I can organize meetups with local moms.

**Acceptance criteria:**
- `POST /community/events` (requires auth, role: MOTHER)
- Request body validated with `CreateEventSchema`
- `location` stored as PostGIS point from `latitude`/`longitude`
- At least one age-range tag required (`ageRangeMin` or `ageRangeMax`) — FR-09-01
- Privacy modes: PUBLIC or INVITE_ONLY (FR-09-02)
- Safety review: events at private addresses (detected via geocoding heuristic or user-declared) are auto-flagged for admin approval (FR-09-04); events at known public venues pass automatically
- Optionally creates an associated `Post` record with type EVENT for feed visibility
- Returns `201 { data: { event } }`
- Rate limited: 5 events per day per user

**Unit tests:**
- Happy path: public event created
- Invite-only event created
- Missing age range rejected (400)
- Private address event auto-flagged
- Associated post created
- Rate limit enforced

### COMM-18: RSVP to event with capacity management
**As a** mother
**I want** to RSVP to a community event
**So that** I can confirm my attendance and the organizer knows who's coming.

**Acceptance criteria:**
- `POST /community/events/:eventId/rsvp` (requires auth, role: MOTHER)
- Creates `EventRSVP` record with status CONFIRMED
- `Event.currentAttendees` incremented atomically (Prisma transaction)
- If `maxAttendees` is set and `currentAttendees >= maxAttendees`, returns `409 { error: "Event is full" }` (FR-09-03)
- Push notification (FCM) sent to the event organizer: "X has RSVP'd to your event" (FR-09-06)
- Returns `201 { data: { rsvp, remainingSpots } }`
- Duplicate RSVP returns `409 { error: "Already RSVP'd" }`

**Unit tests:**
- RSVP created, `currentAttendees` incremented
- Full event rejected (409)
- Duplicate RSVP rejected (409)
- Push notification sent to organizer
- `remainingSpots` computed correctly (null when no maxAttendees)

### COMM-19: Cancel RSVP
**As a** mother
**I want** to cancel my RSVP to an event
**So that** I can free up my spot if I can no longer attend.

**Acceptance criteria:**
- `DELETE /community/events/:eventId/rsvp` (requires auth, role: MOTHER)
- Updates `EventRSVP.status` to CANCELLED
- `Event.currentAttendees` decremented atomically
- Only the RSVP owner can cancel — returns `403` otherwise
- Returns `200 { data: { message: "RSVP cancelled", remainingSpots } }`
- Cancelling an already-cancelled RSVP returns `400`

**Unit tests:**
- RSVP cancelled, `currentAttendees` decremented
- Non-owner rejected (403)
- Already-cancelled RSVP returns 400
- `remainingSpots` updated correctly

### COMM-20: Search and filter events
**As a** mother
**I want** to search events by location and filter by category and age range
**So that** I can find relevant events near me.

**Acceptance criteria:**
- `GET /community/events` (requires auth, role: MOTHER)
- Location filtering via PostGIS `ST_DWithin` (default 5-mile radius for public events) — FR-09-02
- Query params: `?search={venue/title}&category={category}&ageMin={n}&ageMax={n}&radius={miles}`
- Search matches against `title` and `venueName` (case-insensitive, partial match)
- Age range filter: events where the event's age range overlaps with the requested range
- Only non-archived, non-flagged PUBLIC events returned (plus INVITE_ONLY events the user has been invited to — future story)
- Sorted by `startTime` ascending (upcoming first)
- Pagination: cursor-based, 20 per page
- Each event includes: organizer (name, avatar), `currentAttendees`, `maxAttendees`, `remainingSpots`, whether the current user has RSVP'd
- Returns `200 { data: [events], meta: { cursor, hasMore } }`

**Unit tests:**
- Only events within radius returned
- Search by title matches correctly
- Category filter works
- Age range overlap filter works
- Archived events excluded
- User RSVP status included
- Pagination works correctly

### COMM-21: Auto-archive past events
**As a** system
**I want** past events automatically archived 48 hours after their end time
**So that** the event feed stays relevant and uncluttered.

**Acceptance criteria:**
- Scheduled job (Lambda triggered by EventBridge/cron every hour) queries events where `endTime < NOW() - 48 hours` and `isArchived = false` (FR-09-08)
- Sets `isArchived = true` in a batch update
- Archived events are excluded from the public feed but remain accessible via direct link or organizer's profile
- Also implemented as a service function `archivePastEvents()` callable from the backend for testing
- Returns count of events archived

**Unit tests:**
- Events past 48hr threshold archived
- Events within 48hr window not archived
- Already-archived events unaffected (idempotent)
- Archived events excluded from feed queries

### COMM-22: Event reminder push notifications
**As a** mother who RSVP'd to an event
**I want** to receive a push notification 24 hours before the event
**So that** I remember to attend.

**Acceptance criteria:**
- Scheduled job (Lambda triggered by EventBridge/cron every 15 minutes) queries events where `startTime BETWEEN NOW() + 23h45m AND NOW() + 24h15m` and reminder not yet sent
- Sends FCM push notification to all confirmed RSVP'd attendees: "Reminder: {event title} is tomorrow at {time}" (FR-09-06)
- Also sends a reminder to the organizer
- Tracks reminder-sent status to prevent duplicate sends (Redis key `event:reminder:{eventId}` with TTL)
- Creates in-app notification records for persistence

**Unit tests:**
- Reminder sent to all confirmed attendees
- Reminder sent to organizer
- Duplicate reminder prevented (idempotent)
- Cancelled RSVP attendees excluded

### COMM-23: Event attendee list
**As a** mother
**I want** to see who has RSVP'd to an event
**So that** I know who I'll be meeting.

**Acceptance criteria:**
- `GET /community/events/:eventId/attendees` (requires auth, role: MOTHER)
- Returns confirmed RSVP'd users: `id`, `firstName`, `avatarUrl`
- For the event card avatar stack: first 3 attendees + overflow count
- Full list paginated: cursor-based, 20 per page
- Only confirmed (not cancelled) RSVPs included
- Returns `200 { data: [attendees], meta: { totalCount, cursor, hasMore } }`

**Unit tests:**
- Only confirmed attendees returned
- Cancelled RSVPs excluded
- Pagination works correctly
- Total count accurate

---

## Image Upload

### COMM-24: Community image upload (presigned URL)
**As a** mother
**I want** to upload images for my community posts and events
**So that** I can share visual content with the community.

**Acceptance criteria:**
- `POST /community/uploads` (requires auth, role: MOTHER)
- Returns a presigned S3 upload URL
- S3 key format: `community/{userId}/{uuid}.{ext}`
- Accepted types: `image/jpeg`, `image/png`, `image/webp` (max 5MB)
- Max 4 images per request (for posts); 1 image for event cover
- Returns `200 { data: { uploadUrl, s3Key } }`

**Unit tests:**
- Presigned URL generated with correct key format
- Invalid file type rejected (400)
- URL expiry set correctly (15 minutes)

---

## API Route Summary

| Method | Path | Auth | Role | Story |
|--------|------|------|------|-------|
| `POST` | `/community/posts` | Yes | MOTHER | COMM-07 |
| `GET` | `/community/posts` | Yes | MOTHER | COMM-08, COMM-09 |
| `PATCH` | `/community/posts/:postId` | Yes | MOTHER | COMM-10 |
| `DELETE` | `/community/posts/:postId` | Yes | MOTHER | COMM-11 |
| `POST` | `/community/posts/:postId/reactions` | Yes | MOTHER | COMM-12 |
| `POST` | `/community/posts/:postId/comments` | Yes | MOTHER | COMM-13 |
| `GET` | `/community/posts/:postId/comments` | Yes | MOTHER | COMM-13 |
| `POST` | `/community/posts/:postId/report` | Yes | MOTHER | COMM-15 |
| `POST` | `/community/comments/:commentId/report` | Yes | MOTHER | COMM-15 |
| `GET` | `/community/presence` | Yes | MOTHER | COMM-16 |
| `POST` | `/community/events` | Yes | MOTHER | COMM-17 |
| `GET` | `/community/events` | Yes | MOTHER | COMM-20 |
| `POST` | `/community/events/:eventId/rsvp` | Yes | MOTHER | COMM-18 |
| `DELETE` | `/community/events/:eventId/rsvp` | Yes | MOTHER | COMM-19 |
| `GET` | `/community/events/:eventId/attendees` | Yes | MOTHER | COMM-23 |
| `POST` | `/community/uploads` | Yes | MOTHER | COMM-24 |
| `POST` | `/admin/moderation/keywords` | Yes | ADMIN | COMM-14 |
| `WS` | `/ws/community` | Yes (first msg) | MOTHER | COMM-16 |

---

## Implementation Order

```
COMM-01  Prisma: Post
    |
COMM-02  Prisma: Comment
    |
COMM-03  Prisma: PostReaction
    |
COMM-04  Prisma: Event
    |
COMM-05  Prisma: EventRSVP
    |
COMM-06  Shared Zod schemas
    |
    ├────────────────────────────────────────┐
    |                                        |
COMM-24  Image upload (presigned URL)     COMM-14  Auto-flag keywords
    |                                        |
COMM-07  Create post                      COMM-15  User report function
    |                                        |
COMM-08  Get community feed               COMM-16  Real-time presence
    |
COMM-09  Filter feed by category
    |
COMM-10  Update own post
    |
COMM-11  Delete own post
    |
COMM-12  Post reactions ──── COMM-13  Comments & threads
    |
    ├────────────────────────────────────────┐
    |                                        |
COMM-17  Create event                     COMM-22  Event reminder notifications
    |
COMM-18  RSVP with capacity
    |
COMM-19  Cancel RSVP
    |
COMM-20  Search & filter events
    |
COMM-21  Auto-archive past events
    |
COMM-23  Event attendee list
```

---

## Non-Functional Requirements (from PRD Table 18)

| Requirement | Target |
|---|---|
| Community feed radius | 10 miles default (user-configurable, max 25 miles) |
| Feed initial render | < 1.5 seconds; pagination loads < 1 second |
| Post image upload | Max 4 images per post, max 5MB each |
| Event search radius | 5 miles default for public events |
| Event auto-archive | 48 hours after event end time |
| Event reminder notification | 24 hours before event start |
| Presence indicator refresh | Every 5 minutes |
| Presence TTL | 5 minutes of inactivity |
| Content moderation | Auto-flag prohibited keywords; 3 unique reports trigger auto-flag |
| Data retention — community posts | Until deleted by author or moderated |
| General API rate limit | 100 req / 15 min per user |
| Post creation rate limit | 10 posts / hour per user |
| Event creation rate limit | 5 events / day per user |
| HTTPS/TLS | TLS 1.3 minimum for all API traffic |
| Privacy — location data | Used only for proximity matching; precise coordinates never exposed to other users |
| Scalability | Support 50,000 concurrent sessions at launch |
