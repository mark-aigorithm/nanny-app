# Surveys — design

**Date:** 2026-10-19 · **Status:** draft, awaiting review · **Branch:** `feat/surveys`

## Goal

Admins write surveys in a new **Surveys** page of the console, publish them to chosen mothers
(all mothers, admin-curated groups, or hand-picked individuals), and see every mother's answers.
Mothers get a push + in-app notification and are prompted in the app to **Answer** or **Skip**.
The admin sees who answered, who skipped and who never responded, and can resend to any of them.

### Decisions (from the user)

| Question | Answer |
|---|---|
| Who receives surveys? | **Mothers only.** Nannies are out of scope. |
| Question types | **Free text, single choice, multi choice, rating 1–5, yes/no.** |
| Editing after publish? | **No — published surveys are locked.** Duplicate into a new draft to change. The admin can **close** a survey; it then disappears for every mother who hasn't answered. |
| How does a mother meet it? | **Prompt on next app open**, **tapping the notification**, and a **Surveys entry in the profile tab** that is hidden when she has none pending. |
| Does Skip remove it? | **No.** Skip only dismisses the automatic prompt; the survey stays in her profile list and she can still answer it (status becomes Answered). |
| Groups | **Hand-picked static lists** of mothers. No rule-based segments. |
| Choosing recipients at publish | **All mothers, any groups, and individual mothers — combined**, deduplicated. |
| Required questions | **Per question** — the admin marks each Required or Optional. |
| Mother picker | A **table sortable by bookings count, hours booked, sign-up date** and other useful columns, used both for group membership and individual recipients. |

### Assumptions (stated, not contested)

- The recipient list is **frozen at publish**. A mother added to a group later is not sent the
  survey automatically; the admin uses **Add recipients** on the published survey.
- Picker metrics count **COMPLETED bookings only** (`Booking.status = COMPLETED`), so cancelled or
  upcoming bookings don't inflate them.
- Submitted answers are **final** — no editing.
- "Didn't respond" = recipient status `PENDING` (never pressed Skip or submitted).
- Resend resets status to `PENDING`, so the automatic prompt shows again on next app open.
- If the rating prompt and a survey are both due, the rating prompt wins; the survey shows on the
  next open.
- Not anonymous — every answer is tied to a mother.

### Out of scope

Scheduled publishing, conditional/branching questions, anonymous surveys, CSV export, nanny
surveys, rule-based groups, editing a published survey.

## Approach

**Relational storage, one row per answer.** Locked surveys suit fixed relational rows, and the
admin results page — per-question counts, rating averages — is plain SQL over `SurveyAnswer`.
Rejected: a JSON blob per response (aggregation in application code, no referential check that an
answer matches its question) and a generic forms engine (YAGNI).

## Data model (Prisma)

```prisma
enum SurveyStatus { DRAFT PUBLISHED CLOSED }
enum SurveyQuestionType { TEXT SINGLE_CHOICE MULTI_CHOICE RATING YES_NO }
enum SurveyRecipientStatus { PENDING SKIPPED ANSWERED }

model Survey {
  id           Int            @id @default(autoincrement())
  title        String
  description  String?
  status       SurveyStatus   @default(DRAFT)
  createdById  Int            @map("created_by_id")   // admin User
  publishedAt  DateTime?      @map("published_at")
  closedAt     DateTime?      @map("closed_at")
  createdAt / updatedAt
  questions    SurveyQuestion[]
  recipients   SurveyRecipient[]
}

model SurveyQuestion {
  id        Int                @id @default(autoincrement())
  surveyId  Int                @map("survey_id")     // onDelete: Cascade
  order     Int
  type      SurveyQuestionType
  prompt    String
  required  Boolean            @default(true)
  options   SurveyQuestionOption[]
  @@unique([surveyId, order])
}

model SurveyQuestionOption {
  id         Int    @id @default(autoincrement())
  questionId Int    @map("question_id")              // onDelete: Cascade
  order      Int
  label      String
}

model SurveyRecipient {
  id          Int                   @id @default(autoincrement())
  surveyId    Int                   @map("survey_id")
  userId      Int                   @map("user_id")
  status      SurveyRecipientStatus @default(PENDING)
  sentCount   Int                   @default(1) @map("sent_count")
  lastSentAt  DateTime              @map("last_sent_at")
  skippedAt   DateTime?             @map("skipped_at")
  answeredAt  DateTime?             @map("answered_at")
  createdAt
  answers     SurveyAnswer[]
  @@unique([surveyId, userId])
  @@index([userId, status])
}

model SurveyAnswer {
  id           Int     @id @default(autoincrement())
  recipientId  Int     @map("recipient_id")          // onDelete: Cascade
  questionId   Int     @map("question_id")
  textValue    String? @map("text_value")
  ratingValue  Int?    @map("rating_value")          // 1..5
  boolValue    Boolean? @map("bool_value")
  options      SurveyAnswerOption[]                  // SINGLE/MULTI choice
  @@unique([recipientId, questionId])
}

model SurveyAnswerOption {
  answerId  Int  @map("answer_id")                   // onDelete: Cascade
  optionId  Int  @map("option_id")
  @@id([answerId, optionId])
}

model UserGroup {
  id          Int      @id @default(autoincrement())
  name        String   @unique
  description String?
  createdById Int      @map("created_by_id")
  createdAt / updatedAt
  members     UserGroupMember[]
}

model UserGroupMember {
  groupId  Int      @map("group_id")                 // onDelete: Cascade
  userId   Int      @map("user_id")
  addedAt  DateTime @default(now()) @map("added_at")
  @@id([groupId, userId])
}
```

Table and column names are snake_case via `@@map`/`@map`, as everywhere else. Migration
`2026xxxxxxxxxx_add_surveys`.

`NotificationType` gains `SURVEY` and `NotificationReferenceType` gains `SURVEY` — kept in sync
across the Prisma enums, `toApiNotificationType` in `notification.service.ts`, and
`NotificationTypeSchema` in `packages/shared/src/notifications.ts`.

## Lifecycle

| Action | Allowed when | Effect |
|---|---|---|
| Create / edit / delete | `DRAFT` | Questions and options freely editable and reorderable. |
| Duplicate | any status | New `DRAFT` copy of title, description, questions, options. |
| Publish | `DRAFT`, ≥1 question, every choice question has ≥2 options | Status → `PUBLISHED`, `publishedAt` set; recipients created `PENDING`; notify each. |
| Add recipients | `PUBLISHED` | Same targeting body as publish; existing recipients are ignored; new ones notified. |
| Resend | `PUBLISHED` | Targets: selected `userIds`, all `SKIPPED`, or all `PENDING`. `ANSWERED` recipients are never resent. Status → `PENDING`, `sentCount++`, `lastSentAt` = now; notify each. |
| Close | `PUBLISHED` | Status → `CLOSED`, `closedAt` set. Mothers' pending lists drop it; answer/skip return 409. Answers kept. |

Targeting resolves `allMothers` → every active, non-deleted `MOTHER`; `groupIds` → their members
(filtered to active mothers); `userIds` → as given (validated as active mothers). Union, dedupe.

**Notification fan-out** runs in the request, in batches (e.g. 50 users via `Promise.all` per
batch): `createInAppNotification` + `dispatchPush` with
`data: { type: 'SURVEY', surveyId: String(id) }`. `dispatchPush` already swallows per-user errors,
so one bad token doesn't fail the publish. **Known limit:** Vercel's function timeout bounds the
fan-out; fine for hundreds of mothers, thousands would need a queue (the planned SQS + Lambda).

## Backend API

Shared Zod schemas in `packages/shared/src/survey.ts` (and `user-group.ts`), validated with
`validateBody` / `validateQuery`. Services: `survey.service.ts` (mother side),
`admin-survey.service.ts`, `admin-group.service.ts`.

### Admin (`admin.routes.ts`)

New admin section **`surveys`** (label "Surveys") in `ADMIN_SECTIONS` / labels / paths. Every
route below gets a rule in `ADMIN_ROUTE_PERMISSIONS` — `GET` → `VIEW`, everything else → `MANAGE`.
Groups live under the same section.

| Method & path | Purpose |
|---|---|
| `GET /admin/surveys?status&page&limit` | List with recipient / answered / skipped / pending counts. |
| `POST /admin/surveys` | Create draft (title, description, questions[]). |
| `GET /admin/surveys/:id` | Survey with questions + options + counts. |
| `PATCH /admin/surveys/:id` | Replace draft content (409 unless `DRAFT`). |
| `DELETE /admin/surveys/:id` | Delete draft (409 unless `DRAFT`). |
| `POST /admin/surveys/:id/duplicate` | New draft copy. |
| `POST /admin/surveys/:id/publish` | Body `{ allMothers?, groupIds?, userIds? }` (at least one). Returns recipient count. |
| `POST /admin/surveys/:id/recipients` | Same body; add recipients to a published survey. |
| `POST /admin/surveys/:id/resend` | Body `{ userIds: number[] }` or `{ status: 'SKIPPED' \| 'PENDING' }`. Returns count resent. |
| `POST /admin/surveys/:id/close` | Close. |
| `GET /admin/surveys/:id/results` | Per question: choice/yes-no counts, rating distribution + average, answered count; text answers paged separately via `?questionId&page`. |
| `GET /admin/surveys/:id/recipients?status&page&limit&sortBy&sortDir` | Per-mother rows: name, phone, status, sentCount, lastSentAt, skippedAt, answeredAt. |
| `GET /admin/surveys/:id/recipients/:userId` | That mother's answers. |
| `GET/POST /admin/groups`, `GET/PATCH/DELETE /admin/groups/:id` | Group CRUD (list includes member count). |
| `GET /admin/groups/:id/members?page&sortBy…` | Members in picker-table shape. |
| `POST /admin/groups/:id/members`, `DELETE /admin/groups/:id/members` | Body `{ userIds }`; add is idempotent. |
| `GET /admin/mothers/picker?search&groupId?&sortBy&sortDir&page&limit` | Mother picker rows (below). |

**Mother picker row:** id, name, phone, `completedBookings`, `hoursBooked` (sum of
`durationHours`), `totalSpent` (sum of `totalAmount`), `lastBookingAt`, `createdAt`,
`lastLoginAt`. All sortable; search on name/phone. Aggregates come from one grouped query over
COMPLETED bookings joined to users (raw SQL or `groupBy` + merge), so sorting by an aggregate is
done in the database, not after paging.

### Mother (`survey.routes.ts`, `requireAuth`, MOTHER role)

| Method & path | Purpose |
|---|---|
| `GET /surveys/pending` | Her `PENDING` and `SKIPPED` recipients on `PUBLISHED` surveys: id, title, description, status, question count. Drives both the prompt and the profile entry. |
| `GET /surveys/:id` | Questions + options. 404 unless she is a recipient; 409 if closed or already answered. |
| `POST /surveys/:id/skip` | `PENDING` → `SKIPPED`. Idempotent on `SKIPPED`; 409 if answered/closed. |
| `POST /surveys/:id/answers` | Body `{ answers: [{ questionId, text? \| rating? \| bool? \| optionIds? }] }`. Validated against each question: value matches type, rating 1–5, option ids belong to the question, single choice = exactly one, every required question answered, no unknown questions. Writes all answers and sets `ANSWERED` in one transaction. 409 if closed or already answered. |

## Admin UI (`apps/admin`)

Follows the `nanny-app-admin-design` skill. New sidebar item **Surveys** (lucide `ClipboardList`)
→ `/surveys` with tabs **Surveys** | **Groups** (`?tab=`, like the Users page).

- **Surveys tab** — table: title, status badge, recipients, answered, skipped, pending, response
  rate, created. Status filter. "New survey" button.
- **Survey editor** (`/surveys/:id` while `DRAFT`) — title, description, ordered question cards
  (type select, prompt, Required switch, option list for choice types), add / reorder / delete,
  Save. Actions: **Publish** (opens the recipient picker), Delete, Duplicate.
- **Survey detail** (`/surveys/:id` while `PUBLISHED`/`CLOSED`) — read-only questions plus:
  - **Results** tab: bar chart per choice and yes/no question, rating distribution + average,
    paged list of text answers.
  - **Recipients** tab: status filter, row checkboxes, **Resend to selected**, **Resend to all
    skipped (n)**, **Resend to all no-response (n)**; clicking a row opens that mother's answers
    in a modal.
  - Header: **Add recipients**, **Close** (confirm dialog), **Duplicate**.
- **Recipient picker modal** — "All mothers" switch, group multi-select, the mother picker table
  with checkboxes, live count of selected unique recipients, confirm. Resend actions confirm with
  the count.
- **Groups tab** — table: name, members, created; create/rename/delete. **Group detail** — member
  table (picker columns) with remove; **Add mothers** opens the picker table.
- **Mother picker table** is one reusable component (`features/surveys/mother-picker-table.tsx`):
  columns name, phone, bookings, hours booked, total spent, last booking, joined, last active; all
  sortable; search; per-row and page-level checkboxes; selection kept across pages. The shared
  `Table` has no selection support today — selection is added in this component, not by
  reworking `Table`.

API functions in `src/lib/api.ts` alongside the existing ones; react-query keys `['surveys', …]`,
`['groups', …]`, `['mother-picker', …]`.

## Mobile (`apps/mobile`, parent only)

Follows the `nanny-app-mobile-design` skill and the UI-sweep layout rules.

- **`useSurveyPrompt` + `SurveyPromptHost`** mounted in `app/(parent)/_layout.tsx`, modelled on
  `usePendingRating` / `RatingPromptHost`: fetches `/surveys/pending` for authenticated mothers,
  re-fetches on `AppState` foreground. If any `PENDING` survey exists (and no rating prompt is
  showing), shows a bottom sheet with title, description, **Answer** and **Skip**. Skip calls
  `/surveys/:id/skip` and invalidates the pending query. One survey per prompt; the oldest first.
- **Answer screen** `app/(parent)/survey/[id].tsx` — all questions on one scroll view; inputs:
  multiline text, radio list, checkbox list, 1–5 stars, Yes/No segmented buttons; required marker;
  Submit disabled until required questions are answered; thank-you state on success; a "This
  survey has closed" state on 409.
- **Push tap** — `navigateFromNotification` gains a `SURVEY` branch → `/survey/:id`. Foreground
  `onMessage` also invalidates the pending-surveys query.
- **Profile tab** — a "Surveys" row with a count badge, rendered only when the pending list is
  non-empty, opening a simple list of her pending and skipped surveys.

## Testing

- **Backend integration** — a new journey `aNN-surveys.test.ts`: draft CRUD; publish with all /
  groups / users and dedupe; closed and drafts invisible to mothers; skip then answer from profile;
  answer validation per type and required; resend to selected / all skipped / all pending and that
  answered recipients are never resent; close → 409 on answer and skip; in-app notification rows
  created (count, as `a15` does). Group CRUD and membership. Add the survey and group routes to
  `a12-operator-access-matrix`.
- **Backend unit** — answer validation and results aggregation.
- **Shared** — Vitest for the survey Zod schemas.
- **Admin** — Vitest + MSW: editor (add/reorder questions, options), publish via picker, recipients
  tab resend actions, mother picker sorting and cross-page selection.
- **Mobile** — Jest: answer form validation per type, prompt host shows/hides and Skip. UI sweep of
  the prompt sheet, answer screen and profile entry before calling the mobile part done. A Maestro
  flow (receive → skip → answer from profile) is optional.

## Rollout

Prisma migration must be applied to the target database before the backend deploy (nothing in the
repo does this automatically). The mobile part ships in the next EAS build; until then the backend
and admin are usable, but mothers on old builds get no prompt and no answer screen. Old builds
parse notifications with the shared `NotificationTypeSchema`; the plan must check how they handle
an unknown `SURVEY` type (e.g. a strict enum failing the whole notifications list) and make the
backend safe for them before publishing a survey in production.
