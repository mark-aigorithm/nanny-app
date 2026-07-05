# Implemented Notifications (MVP)

This document describes the notification types and infrastructure **currently implemented** in NannyApp as of the Marketplace Chat MVP. It reflects the live codebase, not the full Epic 9 spec in `Docs/user-stories/09-notifications.md`.

---

## Summary

| Channel | Status |
|---------|--------|
| In-app notification center | Implemented |
| Firebase Cloud Messaging (push) | Implemented |
| SMS | Not implemented |
| Email | Not implemented |
| Per-category user preferences | Not implemented |

Only **one notification type** is live today: **marketplace message**.

---

## Notification types

### 1. `marketplace_message`

**Purpose:** Alert the other party when a new text message is sent in a marketplace chat (buyer ↔ seller on a `CommunityPost` listing).

| Field | Value |
|-------|--------|
| **API type** | `marketplace_message` |
| **DB enum** | `MARKETPLACE_MESSAGE` |
| **Reference type** | `conversation` |
| **Reference ID** | Conversation ID |

**Trigger**

- Fires when `POST /conversations/:id/messages` succeeds and the recipient is the other participant in the thread.
- Triggered from `conversation.service.ts` → `sendMessage()`.

**Who receives it**

- The **other participant** in the conversation (not the sender).
- Marketplace chat is mother-to-mother only (same auth rules as community).

**In-app copy**

| Field | Template |
|-------|----------|
| **Title** | `New message` |
| **Body** | `{senderFirstName} {senderLastName} sent a message about "{listingTitle}"` |
| **Listing title fallback** | `your listing` if the post has no title |

**Example**

- Title: `New message`
- Body: `Jane Buyer sent a message about "Stroller"`

**Tap action (mobile)**

- Opens the chat thread: `/(parent)/chat/messaging?conversationId={referenceId}`

**Push (FCM)**

| Field | Value |
|-------|--------|
| **Notification title** | Same as in-app title |
| **Notification body** | Same as in-app body |
| **Data payload** | See below |

```json
{
  "type": "MARKETPLACE_MESSAGE",
  "conversationId": "<conversation-id>",
  "communityPostId": "<community-post-id>",
  "title": "New message"
}
```

**Not sent when**

- Push is skipped silently if the recipient has no registered device tokens.
- If the recipient has the same conversation open in the app (foreground), the client refreshes messages instead of treating it as a new external alert (polling + FCM foreground handler).

---

## Infrastructure

### Database models

| Model | Table | Purpose |
|-------|--------|---------|
| `Notification` | `notifications` | Persisted in-app notifications |
| `DeviceToken` | `device_tokens` | FCM tokens per user/device (`ios` / `android`) |

**`Notification` fields (relevant)**

- `userId`, `type`, `title`, `body`, `isRead`, `referenceId`, `referenceType`, `createdAt`, soft-delete via `deletedAt`

### Backend API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/notifications` | Paginated list (`page`, `limit`, optional `unreadOnly=true`) |
| `GET` | `/notifications/unread-count` | Unread count for bell badges |
| `PATCH` | `/notifications/:id/read` | Mark one notification read |
| `PATCH` | `/notifications/read-all` | Mark all unread notifications read |
| `POST` | `/devices/push-token` | Register FCM token |
| `DELETE` | `/devices/push-token` | Remove FCM token (e.g. logout) |

**Auth:** All routes require Firebase JWT (`requireAuth`).

**Push dispatch:** `notification.service.ts` → `dispatchPush()` uses Firebase Admin `admin.messaging().sendEachForMulticast()`. Invalid tokens are soft-deleted automatically.

### Shared types

Defined in `packages/shared/src/notifications.ts`:

- `NotificationType`: `'marketplace_message'`
- `NotificationReferenceType`: `'conversation'`
- `NotificationResponse`, list query/response, unread count, push-token schemas

### Mobile

| Surface | Behavior |
|---------|----------|
| **Notifications screen** | Live list from API; All / Unread filters; date grouping; pull-to-refresh; load more; mark read / mark all read |
| **Notification bell** | `NotificationBellButton` shows dynamic unread count on Home dashboard, Community feed header, and parent tab header |
| **Push registration** | Onboarding “Enable notifications” + app root `usePushNotifications` after sign-in |
| **Push handling** | Foreground: refresh queries; background/tap: deep-link to chat |
| **Polling** | Notification list refetches every 15s when screen focused; unread count polls every 15s globally |

**Key files**

- `apps/mobile/src/screens/parent/NotificationsScreen.tsx`
- `apps/mobile/src/hooks/useNotifications.ts`
- `apps/mobile/src/hooks/usePushNotifications.ts`
- `apps/mobile/src/components/NotificationBellButton.tsx`
- `apps/backend/src/services/notification.service.ts`
- `apps/backend/src/services/conversation.service.ts` (trigger)

---

## Not implemented (planned in Epic 9, not built)

The following types appear in product specs but **do not exist** in the Prisma enum or code yet:

- `BOOKING_CONFIRMED`
- `BOOKING_CANCELLED`
- `NANNY_CHECKIN`
- `CARE_LOG_ENTRY`
- `LIVE_FEED_ACTIVATED`
- `BOOKING_REMINDER`
- `EVENT_REMINDER`
- `COMMUNITY_REPLY`
- `WALLET_CREDIT`
- `REVIEW_WINDOW`
- `PROMO_EXPIRING`
- `EMERGENCY_ALERT`

Also not built:

- `NotificationPreference` (per-category toggles)
- SMS / SES email dispatch
- SQS/Lambda async notification queue
- Admin notification tooling

---

## How to test `marketplace_message`

1. Sign in as **Mother A** and create or open a marketplace post.
2. Sign in as **Mother B** → open post → **Message seller** → send a message.
3. As **Mother A**:
   - Bell icon should show unread count.
   - **Notifications** screen should list “New message” with the listing title in the body.
   - Tap notification → opens the chat thread.
4. With a **native dev build** and push permission granted, Mother A should also receive an FCM push when the app is backgrounded.

**Requirements for push**

- Native build (not Expo Go) with `@react-native-firebase/messaging`
- `google-services.json` / `GoogleService-Info.plist` configured
- Backend Firebase Admin credentials in `.env`
- Device token registered via `POST /devices/push-token`
