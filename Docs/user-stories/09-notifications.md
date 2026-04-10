# Epic 9: Notifications & Customer Support

## Context

NannyMom uses a multi-channel notification system: Firebase Cloud Messaging (FCM) for push, Amazon SNS for SMS, and Amazon SES for email. A central dispatch service checks per-user notification preferences before sending. Users can toggle notifications per category and per channel, except for security-critical messages (OTP SMS, which are always sent). The customer support module provides live chat, searchable FAQ, email ticketing, and an emergency hotline.

**PRD references:** Section 9 Table 21 (Notification triggers), Section 6.11 (FR-13-* — Customer Support), Table 18 (NFRs), Table 19 (Config), Table 20 (User-level settings)
**Architecture references:** Root CLAUDE.md (FCM, SQS + Lambda for async jobs, SES), Backend CLAUDE.md (service layer, error handling)

---

## Prerequisites (Prisma Models)

### NOTIF-01: Prisma schema — Notification model
**As a** developer
**I want** the Prisma schema to define the `Notification` model
**So that** in-app notifications are persisted and queryable.

**Acceptance criteria:**
- `Notification` model with fields: `id` (UUID), `userId` (FK to User), `type` (enum — see below), `title` (String), `body` (String), `channel` (enum: `PUSH`, `SMS`, `EMAIL`, `IN_APP`), `isRead` (Boolean, default false), `referenceId` (nullable String — booking ID, post ID, etc.), `referenceType` (nullable String — "BOOKING", "POST", "EVENT", etc.), `createdAt`
- Enum `NotificationType { BOOKING_CONFIRMED BOOKING_CANCELLED NANNY_CHECKIN CARE_LOG_ENTRY LIVE_FEED_ACTIVATED BOOKING_REMINDER EVENT_REMINDER COMMUNITY_REPLY MARKETPLACE_MESSAGE WALLET_CREDIT REVIEW_WINDOW PROMO_EXPIRING EMERGENCY_ALERT }`
- Index on `userId` + `isRead` + `createdAt` for efficient in-app notification center queries
- Index on `userId` + `type` for filtered queries
- Migration generated and applied: `pnpm db:migrate:dev`
- Prisma client generated: `pnpm db:generate`

**Unit tests:**
- Verify migration applies cleanly
- Verify Notification can be created with all enum values

### NOTIF-02: Prisma schema — NotificationPreference model
**As a** developer
**I want** the Prisma schema to define the `NotificationPreference` model
**So that** users can control which notifications they receive on which channels.

**Acceptance criteria:**
- `NotificationPreference` model with fields: `id` (UUID), `userId` (FK to User), `category` (String — matches NotificationType or a group name), `pushEnabled` (Boolean, default true), `smsEnabled` (Boolean, default false), `emailEnabled` (Boolean, default true), `createdAt`, `updatedAt`
- Unique constraint on `userId` + `category` (one preference row per category per user)
- Default preferences created on user registration (all push enabled, SMS disabled except critical, email enabled for booking-related)
- Migration generated and applied

**Unit tests:**
- Verify migration applies cleanly
- Verify unique constraint on userId + category

### NOTIF-03: Prisma schema — SupportTicket model
**As a** developer
**I want** the Prisma schema to define the `SupportTicket` model
**So that** users can create and track support requests.

**Acceptance criteria:**
- `SupportTicket` model with fields: `id` (UUID), `userId` (FK to User), `ticketNumber` (String, unique — auto-generated format: "TKT-{YYMMDD}-{4-digit sequence}"), `subject` (String), `description` (String, max 2000 chars), `status` (enum: `OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`), `priority` (enum: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`), `assignedTo` (nullable String — agent name or ID), `resolvedAt` (nullable DateTime), `createdAt`, `updatedAt`
- Enum `TicketStatus { OPEN IN_PROGRESS RESOLVED CLOSED }`
- Enum `TicketPriority { LOW MEDIUM HIGH CRITICAL }`
- Index on `userId` + `status` for "my tickets" queries
- Index on `status` + `priority` for admin queue
- Migration generated and applied

**Unit tests:**
- Verify migration applies cleanly
- Verify auto-generated ticketNumber format

### NOTIF-04: Prisma schema — FAQ model
**As a** developer
**I want** the Prisma schema to define the `FAQ` model
**So that** frequently asked questions are stored and searchable.

**Acceptance criteria:**
- `FAQ` model with fields: `id` (UUID), `question` (String), `answer` (String), `category` (String — e.g., "billing", "nanny-vetting", "cancellations", "bookings"), `keywords` (String[] — array of search keywords), `contextTriggers` (String[] — array of user action identifiers for contextual suggestions, e.g., "booking_cancelled", "payment_failed"), `sortOrder` (Int, default 0), `isPublished` (Boolean, default true), `createdAt`, `updatedAt`
- Index on `category` for filtered queries
- Full-text search index on `question` + `answer` (PostgreSQL `tsvector` via raw SQL migration)
- Migration generated and applied

**Unit tests:**
- Verify migration applies cleanly
- Verify FAQ can be created and queried by category

---

## Push Notification Stories (FCM)

### NOTIF-05: Booking confirmed push notification
**As a** mother and nanny
**I want** to receive a push notification when a booking is confirmed
**So that** both parties are immediately informed.

**Acceptance criteria:**
- Triggered when booking status transitions to CONFIRMED
- Recipients: both the mother and the nanny associated with the booking
- Push payload: `{ title: "Booking Confirmed", body: "Your booking on {date} at {time} has been confirmed", data: { bookingId, type: "BOOKING_CONFIRMED" } }`
- Also creates an IN_APP Notification record for each recipient
- Also sends a confirmation email to both parties (see NOTIF-16)
- Respects user notification preferences (checks pushEnabled for BOOKING_CONFIRMED category)
- Unit tests cover: both recipients receive push, preference opt-out skips push but still creates in-app record

### NOTIF-06: Booking cancelled push notification
**As a** mother or nanny
**I want** to receive a push notification when a booking is cancelled by either party
**So that** I am immediately aware of the cancellation.

**Acceptance criteria:**
- Triggered when booking status transitions to CANCELLED
- Recipient: the other party (not the one who cancelled)
- Push payload: `{ title: "Booking Cancelled", body: "{canceller name} has cancelled the booking on {date}", data: { bookingId, type: "BOOKING_CANCELLED" } }`
- Creates an IN_APP Notification record
- Also sends a cancellation email (see NOTIF-17)
- Unit tests cover: mother cancels (nanny notified), nanny cancels (mother notified), preference opt-out

### NOTIF-07: Nanny check-in push notification
**As a** mother
**I want** to receive a push notification when my nanny checks in to start a booking
**So that** I know care has begun.

**Acceptance criteria:**
- Triggered when nanny records check-in on an active booking
- Recipient: the mother associated with the booking
- Push payload: `{ title: "Nanny Checked In", body: "{nanny name} has started your booking", data: { bookingId, type: "NANNY_CHECKIN" } }`
- Creates an IN_APP Notification record
- Unit tests cover: happy path, preference opt-out

### NOTIF-08: New care log entry notification
**As a** mother
**I want** to receive an in-app notification when my nanny logs a care activity
**So that** I can monitor care in real time.

**Acceptance criteria:**
- Triggered when a nanny creates a care log entry during an active booking
- Recipient: the mother associated with the booking
- Channel: IN_APP only (per PRD Table 21 — real-time in-app)
- Creates a Notification record with type CARE_LOG_ENTRY
- Body includes activity type and brief description: "Meal logged: Lunch — 6oz formula"
- Unit tests cover: meal entry, nap entry, diaper entry, activity entry

### NOTIF-09: Live feed activated notification
**As a** nanny
**I want** to receive an in-app notification when the mother activates the live video feed
**So that** I am aware I am being monitored (transparency per PRD FR-04-07).

**Acceptance criteria:**
- Triggered when mother starts a live feed session on an active booking
- Recipient: the nanny on the active booking
- Channel: IN_APP only (per PRD Table 21)
- Creates a Notification record with type LIVE_FEED_ACTIVATED
- Body: "Live feed has been activated by {mother name}"
- Unit tests cover: happy path, notification created with correct fields

### NOTIF-10: Booking reminder (24 hours before)
**As a** mother and nanny
**I want** to receive a reminder 24 hours before a booking
**So that** I can prepare in advance.

**Acceptance criteria:**
- Dispatched by a scheduled SQS + Lambda job that runs hourly, querying bookings starting in the next 24-25 hours that have not yet been reminded
- Recipients: both mother and nanny
- Channels: Push + Email (per PRD Table 21)
- Push payload: `{ title: "Booking Reminder", body: "Reminder: Your booking with {other party name} is tomorrow at {time}", data: { bookingId, type: "BOOKING_REMINDER" } }`
- Creates an IN_APP Notification record
- Marks the booking as "reminded" to prevent duplicate sends
- Unit tests cover: bookings within window are reminded, already-reminded bookings are skipped, preference opt-out

### NOTIF-11: Event reminder (24 hours before)
**As a** mother who RSVPed to an event
**I want** to receive a push reminder 24 hours before the event
**So that** I remember to attend.

**Acceptance criteria:**
- Dispatched by the same scheduled Lambda job as NOTIF-10
- Recipients: all users with RSVP status CONFIRMED for events starting in the next 24-25 hours
- Channel: Push (per PRD Table 21)
- Push payload: `{ title: "Event Tomorrow", body: "Reminder: {event title} is tomorrow at {time} — {venue}", data: { eventId, type: "EVENT_REMINDER" } }`
- Creates an IN_APP Notification record
- Unit tests cover: multiple attendees reminded, already-reminded events skipped

### NOTIF-12: Community and marketplace notifications
**As a** mother
**I want** to receive push notifications for community replies and marketplace messages
**So that** I stay engaged with conversations and buyer inquiries.

**Acceptance criteria:**
- **New community reply**: triggered when someone replies to the user's post; push payload: `{ title: "New Reply", body: "{author name} replied to your post", data: { postId, type: "COMMUNITY_REPLY" } }`
- **New marketplace message**: triggered when a buyer sends a message about the user's listing; push payload: `{ title: "New Message", body: "{buyer name} sent a message about '{listing title}'", data: { listingId, type: "MARKETPLACE_MESSAGE" } }`
- Both create IN_APP Notification records
- Both respect user notification preferences
- Unit tests cover: community reply notification, marketplace message notification, preference opt-out

### NOTIF-13: Wallet credit and review window notifications
**As a** mother
**I want** to be notified when wallet credits are added or when my review window opens
**So that** I am aware of credits and can leave timely reviews.

**Acceptance criteria:**
- **Wallet credit added**: triggered by WALL-08 (credit wallet service); push payload: `{ title: "Wallet Credited", body: "{amount} {currency} has been added to your wallet", data: { walletId, type: "WALLET_CREDIT" } }`
- **Review window opening**: triggered by a scheduled job 1 day after booking completion; push payload: `{ title: "How was your booking?", body: "Share your experience with {nanny name} — you have 7 days to leave a review", data: { bookingId, type: "REVIEW_WINDOW" } }`
- Both create IN_APP Notification records
- Unit tests cover: wallet credit notification, review window notification, preference opt-out

---

## SMS Notification Stories (Amazon SNS)

### NOTIF-14: Phone OTP via SMS
**As a** user
**I want** to receive a 6-digit OTP via SMS for phone verification
**So that** I can verify my phone number securely.

**Acceptance criteria:**
- Dispatched by the auth service (AUTH-12 from Epic 1)
- Sent via Amazon SNS SMS
- **Cannot be disabled** by user notification preferences (security-critical)
- SMS body: "Your NannyMom verification code is {OTP}. It expires in 5 minutes."
- Rate limited: 3 per 15 minutes per user (enforced at auth service level)
- Unit tests cover: SMS dispatched regardless of user preferences, rate limit enforcement

### NOTIF-15: Critical booking SMS alerts
**As a** mother
**I want** to receive SMS alerts for critical booking issues (nanny late, booking cancelled)
**So that** I am reached even if I miss a push notification.

**Acceptance criteria:**
- **Nanny late**: if nanny has not checked in within 15 minutes of booking start time, send SMS to mother: "Alert: Your nanny {name} has not checked in for the {time} booking. Contact support: {hotline}"
- **Booking cancelled (last-minute)**: if nanny cancels within 2 hours of booking start, send SMS to mother: "Alert: {nanny name} has cancelled your {time} booking. We are finding a replacement."
- Sent via Amazon SNS SMS
- These are classified as CRITICAL priority and bypass normal preference checks (always sent if user has a verified phone number)
- Creates an IN_APP Notification record as well
- Unit tests cover: late nanny SMS, last-minute cancellation SMS, no verified phone (skip SMS but still create in-app)

---

## Email Notification Stories (Amazon SES)

### NOTIF-16: Booking confirmed email
**As a** mother and nanny
**I want** to receive a confirmation email when a booking is confirmed
**So that** I have a written record.

**Acceptance criteria:**
- Triggered alongside NOTIF-05 (booking confirmed push)
- Sent via Amazon SES
- Email includes: booking date, time, duration, nanny/mother name, address (masked to neighborhood), total cost (mother only), cancellation policy
- Uses an HTML email template stored in `src/templates/booking-confirmed.html`
- Respects emailEnabled preference for BOOKING_CONFIRMED category
- Unit tests cover: email sent to both parties, preference opt-out skips email

### NOTIF-17: Booking cancelled email
**As a** mother or nanny
**I want** to receive an email when a booking is cancelled
**So that** I have a record of the cancellation and next steps.

**Acceptance criteria:**
- Triggered alongside NOTIF-06 (booking cancelled push)
- Email includes: booking date, cancellation reason (if provided), refund status (if applicable), support contact
- Respects emailEnabled preference for BOOKING_CANCELLED category
- Unit tests cover: email content includes refund info when applicable, preference opt-out

### NOTIF-18: Booking reminder email
**As a** mother and nanny
**I want** to receive a reminder email 24 hours before a booking
**So that** I have a written reminder with booking details.

**Acceptance criteria:**
- Triggered alongside NOTIF-10 (booking reminder push)
- Email includes: booking date, time, other party name, address, any preparation notes
- Respects emailEnabled preference for BOOKING_REMINDER category
- Unit tests cover: email sent alongside push, preference opt-out

### NOTIF-19: Promotional code expiring email
**As a** mother
**I want** to be notified when a promotional code I have is about to expire
**So that** I can use it before it is lost.

**Acceptance criteria:**
- Triggered by a scheduled Lambda job that checks for promo codes expiring within 48 hours
- Channels: Push + Email (per PRD Table 21)
- Email includes: promo code, discount value, expiry date, CTA link to book
- Push payload: `{ title: "Promo Expiring Soon", body: "Your promo code {code} expires in {hours} hours — use it now!", data: { promoCode, type: "PROMO_EXPIRING" } }`
- Respects user preferences
- Unit tests cover: promo expiring email sent, already-notified promos skipped

---

## Notification Preferences Stories

### NOTIF-20: Get notification preferences
**As a** user
**I want** to view my notification preferences
**So that** I can see which notifications I receive and on which channels.

**Acceptance criteria:**
- `GET /notification-preferences` (requires auth)
- Returns `200 { data: preferences[] }` — one entry per notification category
- Each entry includes: category, pushEnabled, smsEnabled, emailEnabled
- If no preferences exist for the user (first time), return system defaults and auto-create preference records
- Default preferences per PRD Table 20: all push enabled, SMS disabled (except OTP — always on), email enabled for booking-related
- Unit tests cover: existing preferences, auto-creation of defaults

### NOTIF-21: Update notification preferences
**As a** user
**I want** to toggle specific notification channels on or off per category
**So that** I control how I am contacted.

**Acceptance criteria:**
- `PATCH /notification-preferences` (requires auth)
- Request body: `{ preferences: [{ category, pushEnabled?, smsEnabled?, emailEnabled? }] }` — partial update, only specified fields are changed
- Validates that OTP SMS cannot be disabled; returns `400 { error: "OTP SMS notifications cannot be disabled" }` if attempted
- Updates matching NotificationPreference records (upsert if not found)
- Returns `200 { data: preferences[] }` — full updated list
- Unit tests cover: toggle push off for one category, attempt to disable OTP SMS (rejected), upsert new category

---

## In-App Notification Center Stories

### NOTIF-22: List in-app notifications
**As a** user
**I want** to see all my notifications in a chronological list
**So that** I can review everything I have been notified about.

**Acceptance criteria:**
- `GET /notifications` (requires auth)
- Query params: `page` (default 1), `limit` (default 20, max 50), `type` (optional NotificationType filter), `isRead` (optional Boolean filter)
- Returns `200 { data: notifications[], meta: { page, limit, total, totalPages, unreadCount } }`
- `unreadCount` = total unread notifications for the user (not just the current page)
- Sorted by `createdAt` descending (most recent first)
- Each notification includes: id, type, title, body, isRead, referenceId, referenceType, createdAt
- Unit tests cover: paginated results, type filter, isRead filter, unreadCount accuracy

### NOTIF-23: Mark notification as read
**As a** user
**I want** to mark a notification as read
**So that** it no longer appears as unread.

**Acceptance criteria:**
- `PATCH /notifications/:id/read` (requires auth)
- Validates the notification belongs to the authenticated user; returns `404` if not found or not owned
- Sets `isRead = true`
- Returns `200 { data: { notification } }`
- Idempotent — marking an already-read notification returns `200` without error
- Unit tests cover: mark unread as read, mark already-read (idempotent), notification not owned

### NOTIF-24: Mark all notifications as read
**As a** user
**I want** to mark all my notifications as read at once
**So that** I can clear my notification badge quickly.

**Acceptance criteria:**
- `POST /notifications/mark-all-read` (requires auth)
- Updates all notifications for the authenticated user where `isRead = false` to `isRead = true`
- Returns `200 { data: { updatedCount } }` — number of notifications marked as read
- Unit tests cover: multiple unread marked, no unread (updatedCount = 0)

---

## Customer Support — Live Chat Stories

### NOTIF-25: Live chat agent availability
**As a** user
**I want** to see whether a support agent is available before starting a chat
**So that** I know whether I will get a real-time response.

**Acceptance criteria:**
- `GET /support/chat/availability` (requires auth)
- Returns `200 { data: { isAvailable, estimatedWaitMinutes } }`
- `isAvailable` is determined by checking a Redis key set by the admin dashboard indicating agent online status
- `estimatedWaitMinutes` is computed from the current open chat queue length (stored in Redis)
- If outside operating hours, returns `isAvailable: false` with `estimatedWaitMinutes: null` and `nextAvailableAt` (timestamp of next operating hours start)
- Unit tests cover: agents available, agents unavailable (outside hours), queue wait time calculation

### NOTIF-26: Initiate live chat session
**As a** user
**I want** to start a live chat with a support agent
**So that** I can get real-time help with my issue.

**Acceptance criteria:**
- `POST /support/chat/start` (requires auth)
- Request body: `{ subject, initialMessage }`
- Creates a chat session record (or integrates with a third-party chat service like Intercom/Zendesk)
- Returns `200 { data: { sessionId, agentName (or null if queued), position (queue position), estimatedWaitMinutes } }`
- If no agents available, user is placed in queue with their position number
- Creates a SupportTicket with status OPEN linked to the chat session
- Unit tests cover: agent available (immediate assignment), no agent (queued), ticket created

---

## Customer Support — FAQ Stories

### NOTIF-27: List FAQs
**As a** user
**I want** to browse frequently asked questions
**So that** I can find answers without contacting support.

**Acceptance criteria:**
- `GET /support/faq` (requires auth)
- Query params: `category` (optional filter), `search` (optional keyword search)
- Returns `200 { data: faqs[] }`
- Each FAQ includes: id, question, answer, category
- If `search` is provided, uses PostgreSQL full-text search (`ts_vector` + `ts_query`) on question and answer fields
- Search results include a `highlights` field with matching terms wrapped in `<mark>` tags (per PRD FR-13-02)
- Sorted by `sortOrder` ascending, then `createdAt` ascending
- Only returns published FAQs (`isPublished = true`)
- Unit tests cover: list all, filter by category, keyword search with highlights, no results

### NOTIF-28: Contextual FAQ suggestions
**As a** user
**I want** to see relevant FAQs based on my recent in-app actions
**So that** I get proactive help without searching.

**Acceptance criteria:**
- `GET /support/faq/contextual` (requires auth)
- Query params: `context` (String — the user action identifier, e.g., "booking_cancelled", "payment_failed")
- Returns FAQs where `contextTriggers` array contains the given context value
- Returns `200 { data: faqs[] }` — max 5 results, sorted by sortOrder
- If no matching FAQs found, returns an empty array
- Unit tests cover: matching context returns relevant FAQs, no matching context returns empty array

---

## Customer Support — Email Ticket Stories

### NOTIF-29: Create support ticket
**As a** user
**I want** to submit a support ticket from within the app
**So that** I can report issues and receive a response via email.

**Acceptance criteria:**
- `POST /support/tickets` (requires auth)
- Request body validated with Zod: `{ subject (3-200 chars), description (10-2000 chars), priority?: "LOW" | "MEDIUM" | "HIGH" }` — priority defaults to MEDIUM
- Auto-generates `ticketNumber` in format "TKT-{YYMMDD}-{4-digit sequence}"
- Creates a SupportTicket record with status OPEN
- Sends a confirmation email to the user via SES: includes ticket number, subject, expected response time (within 24 hours)
- Returns `201 { data: { ticket } }` — includes ticketNumber
- Rate limited: 5 tickets per hour per user
- Unit tests cover: happy path, validation errors, confirmation email sent, rate limit

### NOTIF-30: List user's support tickets
**As a** user
**I want** to see my submitted support tickets and their status
**So that** I can track resolution progress.

**Acceptance criteria:**
- `GET /support/tickets` (requires auth)
- Query params: `page` (default 1), `limit` (default 20, max 50), `status` (optional filter)
- Returns `200 { data: tickets[], meta: { page, limit, total, totalPages } }`
- Each ticket includes: id, ticketNumber, subject, status, priority, createdAt, resolvedAt
- Sorted by `createdAt` descending (most recent first)
- Users only see their own tickets
- Unit tests cover: paginated results, status filter, empty list

---

## Emergency Hotline Story

### NOTIF-31: Emergency hotline call
**As a** user
**I want** to tap "Call Now" on the support screen to call the emergency hotline
**So that** I can get urgent help immediately.

**Acceptance criteria:**
- `GET /support/emergency-hotline` (requires auth)
- Returns `200 { data: { phoneNumber, isAvailable: true, label: "24/7 Emergency Hotline" } }`
- Phone number is read from config (`EMERGENCY_HOTLINE_NUMBER` env var)
- The actual phone call is initiated client-side using the native phone dialer — this endpoint only provides the number
- Logs the request for auditing: creates a record with userId, timestamp, and source screen
- Unit tests cover: returns configured phone number, audit log created

---

## Notification Dispatch Service

### NOTIF-32: Central notification dispatch service
**As a** developer
**I want** a central notification dispatch service that routes notifications to the correct channels based on user preferences
**So that** all notification logic is consolidated in one place.

**Acceptance criteria:**
- `src/services/notification-dispatch.service.ts` exports `dispatchNotification({ userId, type, title, body, referenceId?, referenceType?, channels?: Channel[] })`
- Workflow:
  1. Look up user's NotificationPreference for the given type/category
  2. For each requested channel (PUSH, SMS, EMAIL, IN_APP), check if the user has that channel enabled
  3. Always create an IN_APP Notification record regardless of preferences
  4. For PUSH: enqueue FCM message to SQS for async delivery via Lambda
  5. For SMS: enqueue SNS message to SQS for async delivery via Lambda
  6. For EMAIL: enqueue SES message to SQS for async delivery via Lambda
  7. Critical notifications (OTP, emergency) bypass preference checks
- Returns `{ dispatched: { push: boolean, sms: boolean, email: boolean, inApp: true } }`
- All external calls (FCM, SNS, SES) are async via SQS — the dispatch function returns immediately after enqueuing
- Handles missing FCM token gracefully (logs warning, skips push)
- Handles missing phone number gracefully (logs warning, skips SMS)
- Unit tests cover: all channels enabled, push disabled, SMS disabled, email disabled, critical notification bypasses preferences, missing FCM token, missing phone number

---

## API Route Summary

| Method | Path | Auth | Role | Story |
|--------|------|------|------|-------|
| `GET` | `/notifications` | Yes | any | NOTIF-22 |
| `PATCH` | `/notifications/:id/read` | Yes | any | NOTIF-23 |
| `POST` | `/notifications/mark-all-read` | Yes | any | NOTIF-24 |
| `GET` | `/notification-preferences` | Yes | any | NOTIF-20 |
| `PATCH` | `/notification-preferences` | Yes | any | NOTIF-21 |
| `GET` | `/support/chat/availability` | Yes | any | NOTIF-25 |
| `POST` | `/support/chat/start` | Yes | any | NOTIF-26 |
| `GET` | `/support/faq` | Yes | any | NOTIF-27 |
| `GET` | `/support/faq/contextual` | Yes | any | NOTIF-28 |
| `POST` | `/support/tickets` | Yes | any | NOTIF-29 |
| `GET` | `/support/tickets` | Yes | any | NOTIF-30 |
| `GET` | `/support/emergency-hotline` | Yes | any | NOTIF-31 |

---

## Implementation Order

```
NOTIF-01  Notification model
    |
NOTIF-02  NotificationPreference model
    |
NOTIF-03  SupportTicket model
    |
NOTIF-04  FAQ model
    |
NOTIF-32  Central dispatch service
    |________________________________________
    |                   |                    |
NOTIF-20  Get prefs  NOTIF-22  List notifs  NOTIF-27  List FAQs
    |                   |                    |
NOTIF-21  Update prefs NOTIF-23  Mark read   NOTIF-28  Contextual FAQs
                        |
                     NOTIF-24  Mark all read
    |
NOTIF-05  Booking confirmed push
    |
NOTIF-06  Booking cancelled push
    |
NOTIF-07  Nanny check-in push
    |
NOTIF-08  Care log entry notification
    |
NOTIF-09  Live feed activated notification
    |
NOTIF-10  Booking reminder (24hr) ──── NOTIF-11  Event reminder (24hr)
    |
NOTIF-12  Community & marketplace notifications
    |
NOTIF-13  Wallet credit & review window notifications
    |
NOTIF-14  Phone OTP SMS ──── NOTIF-15  Critical booking SMS
    |
NOTIF-16  Booking confirmed email
    |
NOTIF-17  Booking cancelled email
    |
NOTIF-18  Booking reminder email
    |
NOTIF-19  Promo expiring email
    |
NOTIF-25  Live chat availability
    |
NOTIF-26  Initiate live chat
    |
NOTIF-29  Create support ticket
    |
NOTIF-30  List support tickets
    |
NOTIF-31  Emergency hotline
```

---

## Non-Functional Requirements (from PRD Table 18 & Table 21)

| Requirement | Target |
|---|---|
| Push notification delivery | < 5 seconds from event trigger to device receipt |
| SMS delivery (OTP) | < 10 seconds from request to SMS receipt |
| Email delivery | < 60 seconds from event trigger to inbox |
| Notification dispatch | Async via SQS — dispatch function returns in < 100ms |
| OTP SMS | Cannot be disabled by user preferences |
| Critical SMS (nanny late, last-minute cancel) | Bypass preference checks; always sent if phone verified |
| In-app notification persistence | All notifications persisted regardless of channel preferences |
| FAQ search | Full-text search results in < 500ms |
| Support ticket response SLA | Within 24 hours (per PRD FR-13-04) |
| Emergency hotline | 24/7 availability |
| Notification rate limit | Max 10 push notifications per user per hour (prevent spam) |
| Support ticket rate limit | 5 tickets per hour per user |
| General API rate limit | 100 req / 15 min per user |
| All API traffic | HTTPS/TLS 1.3 minimum |
