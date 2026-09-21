# Community Post Moderation (all types) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every community post a mother writes — marketplace listing, event, Q&A — waits for an admin's approval before it reaches the feed, and an admin can take a live post down afterwards with a reason the author sees.

**Architecture:** The moderation columns (`moderation_status`, `rejection_reason`, `reviewed_at`, `reviewed_by_id`) already exist on every `community_posts` row and the whole visibility model (`assertPostVisible`, the feed's `OR: [approved, own]`) is type-agnostic. The change is therefore: (1) `community.service` stops special-casing MARKETPLACE when it sets `PENDING`; (2) the admin moderation service/routes/page are generalised from "listings" to "posts" with a type filter; (3) the mobile "My listings" screen becomes "My posts". **No Prisma migration.** Takedown keeps its current semantics: reject-with-reason on a live post hides it, the author sees the reason and can edit & resubmit.

**Tech Stack:** Express + Prisma (backend), Zod schemas in `packages/shared`, React 19 + TanStack Query + MSW/Vitest + Playwright (admin), Expo/React Native + Jest + Maestro (mobile).

## Context

Today only `MARKETPLACE` posts go through review (`mapCreateInput` in `apps/backend/src/services/community.service.ts:194-203`, `reReview` in `updatePost` at `:384-392`); Q&A and events are created `APPROVED` and go straight to the feed. The admin console has a Marketplace page (`apps/admin/src/pages/marketplace-page.tsx`) backed by `admin-marketplace.service.ts` that already implements approve / reject / take-down (reject on an approved row) with a mandatory reason and seller notifications. The mobile app has "My listings" (`apps/mobile/src/screens/parent/MyListingsScreen.tsx`) showing the author's own pending/rejected listings with the reason and an edit-and-resubmit action. The user wants this exact gate and takedown applied to **every** post type.

Decisions made with the user (2026-09-21):
- Takedown = reject with reason (author can edit & resubmit). No separate "removed" state.
- One admin **Community** page (rename of Marketplace) with a Type filter; permission section key stays `marketplace` so stored operator grants keep working; label → "Community", path → `/community`.
- Mobile "My listings" → **"My posts"** for all types; shortcut on every community filter.
- Review is always on for all three types — no per-type toggle.

## Global Constraints

- No `any`; strict TS with `noUncheckedIndexedAccess` everywhere.
- Backend: no business logic in routes; services are the only Prisma callers; every admin route must have a row in `ADMIN_ROUTE_PERMISSIONS` (`apps/backend/src/lib/admin-permissions.ts`) — `admin-permissions.test.ts` walks the router and fails otherwise.
- Admin: reuse `@admin/components/ui`; tokens only in `global.css`; mutations report via `useToast`; write controls gated by `useCanManage('marketplace')`.
- Mobile: theme tokens only; styles in `screens/parent/styles/*.styles.ts`; screens wrapped in `ScreenContainer` + `StackHeader`; pull-to-refresh via `useRefreshByUser`.
- Windows file-casing: mobile `components/ui/*.tsx` are lowercase — always edit via the exact on-disk path.
- Notification copy for **marketplace** posts stays exactly `Your listing is live` / `Your listing needs changes` (the mobile c08 flow asserts it).
- Existing live Q&A/event rows stay live — the column default is `APPROVED`; nothing backfills.
- Local dev has no Docker/DB by default; verify with `pnpm typecheck` + unit tests. Integration/E2E need `pnpm test:env` (see root CLAUDE.md).
- Commit after every task with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## File map

| Area | Create | Modify | Delete |
|---|---|---|---|
| Docs | `Docs/superpowers/specs/2026-09-21-community-post-moderation-design.md`, `Docs/superpowers/plans/2026-09-21-community-post-moderation.md` | `Docs/testing/e2e-flows.md` (B6 section) | — |
| Shared | — | `packages/shared/src/admin.ts` (moderation block), `packages/shared/src/community.ts` (comments), `packages/shared/src/operator.ts` (label/path), `packages/shared/src/__tests__/community-moderation.test.ts` (new) | — |
| Backend | `apps/backend/src/services/admin-community.service.ts`, `apps/backend/src/__tests__/admin-community.service.test.ts` | `community.service.ts`, `admin-marketplace.service.ts`, `routes/admin.routes.ts`, `lib/admin-permissions.ts`, `prisma/schema.prisma` (doc comment only), `__tests__/community.service.test.ts`, `__tests__/admin-marketplace.service.test.ts` | — |
| Admin | `src/pages/community-page.tsx`, `src/features/community/post-table.tsx`, `src/features/community/__tests__/post-table.test.tsx`, `e2e/b06-community-moderation.spec.ts` | `src/lib/api.ts`, `src/app.tsx`, `src/components/admin-layout.tsx`, `src/components/ui/icon.tsx`, `src/features/marketplace/official-listing-form.tsx`, `src/styles/global.css` (comment), `e2e/helpers/backend.ts`, `e2e/a12-operator-ui.spec.ts` | `src/pages/marketplace-page.tsx`, `src/features/marketplace/listing-table.tsx`, `e2e/b06-marketplace-moderation.spec.ts` |
| Mobile | `src/screens/parent/MyPostsScreen.tsx`, `src/screens/parent/styles/my-posts-screen.styles.ts`, `app/(parent)/my-posts.tsx`, `src/screens/parent/__tests__/MyPostsScreen.test.tsx`, `src/__preview__/MyPostsPreview.tsx` | `src/hooks/useCommunity.ts`, `src/lib/communityUtils.ts`, `src/screens/parent/CommunityScreen.tsx`, `CommunityFeedScreen.tsx`, `CreatePostScreen.tsx`, `NotificationsScreen.tsx`, `styles/community-screen.styles.ts`, `styles/community-feed-screen.styles.ts`, `e2e/flows/c05-community.yaml`, `c08-notification-centre.yaml`, `_shot-c-community.yaml`, `e2e/scripts/advance.js` | `MyListingsScreen.tsx`, `styles/my-listings-screen.styles.ts`, `app/(parent)/my-listings.tsx`, `__tests__/MyListingsScreen.test.tsx`, `__preview__/MyListingsPreview.tsx` |

---

### Task 1: Design spec + plan into the repo

**Files:**
- Create: `Docs/superpowers/specs/2026-09-21-community-post-moderation-design.md`
- Create: `Docs/superpowers/plans/2026-09-21-community-post-moderation.md` (a copy of this plan file)

- [ ] **Step 1: Write the spec**

```markdown
# Community post moderation (all types) — design

**Date:** 2026-09-21

## Problem
Only marketplace listings are reviewed before publication. Q&A and event posts go live the
moment a mother writes them, and an admin has no way to take one down with a reason.

## Decision
Apply the existing listing moderation model to every `CommunityPost` type.

- **Gate:** `createPost` and `updatePost` set `moderation_status = PENDING` for QA, MARKETPLACE and
  EVENT alike. An edit to a live post re-enters review (as listings do today).
- **Visibility:** unchanged — approved posts are public; the author additionally sees her own
  pending/rejected posts in the feed, detail, comments and "My posts". `toggleEventRsvp` gains the
  same `assertPostVisible` gate as like/comment.
- **Takedown:** rejecting an approved post with a reason hides it; the author sees the reason and
  can edit & resubmit. No separate "removed" state.
- **Existing rows:** untouched (`moderation_status` defaults to `APPROVED`). No migration.
- **Admin console:** the Marketplace page becomes **Community** (`/community`): one table with a
  Type filter (All / Marketplace / Q&A / Events) and the Status filter; a Type badge; a Details
  column (price · event date + place · —). Approve / Reject / Take down, plus official-listing
  Edit / Delete, as today. The official-listing form stays on the page. The permission section
  key stays `marketplace` (stored operator grants keep working); its label becomes "Community".
- **API:** moderation moves to `GET /admin/community/posts?type=&status=`,
  `POST /admin/community/posts/:id/approve`, `POST /admin/community/posts/:id/reject`.
  Official-listing CRUD stays under `/admin/marketplace/listings`.
- **Notifications:** reuse `MARKETPLACE_LISTING_APPROVED / _REJECTED` with type-aware copy
  ("Your event is live", "Your post needs changes"; marketplace copy unchanged).
- **Mobile:** "My listings" → **"My posts"** at `/(parent)/my-posts`, every type, per-type row
  (type chip; price / event date + place / question excerpt). Shortcut on every community filter.
  The review notice on Create post applies to every type; editing any post shows "Resubmit".

## Out of scope
Per-type moderation toggle; admin notification on submission; a distinct "removed" state.
```

- [ ] **Step 2: Copy this plan** to `Docs/superpowers/plans/2026-09-21-community-post-moderation.md`.

- [ ] **Step 3: Commit**

```bash
git add Docs/superpowers/specs/2026-09-21-community-post-moderation-design.md Docs/superpowers/plans/2026-09-21-community-post-moderation.md
git commit -m "docs: community post moderation spec and plan" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Shared schemas — `AdminCommunityPost`, filters, section label

**Files:**
- Modify: `packages/shared/src/admin.ts:811-861` (replace the marketplace moderation block; keep `CreateOfficialListingSchema`/`UpdateOfficialListingSchema`)
- Modify: `packages/shared/src/community.ts:26-32` and `:96-100` (comments only)
- Modify: `packages/shared/src/operator.ts:45,62`
- Create: `packages/shared/src/__tests__/community-moderation.test.ts`

**Interfaces (produced):**
- `AdminCommunityStatusFilterSchema` = `z.enum(['ALL','PENDING','APPROVED','REJECTED'])`, type `AdminCommunityStatusFilter`
- `AdminCommunityTypeFilterSchema` = `z.enum(['ALL','QA','MARKETPLACE','EVENT'])`, type `AdminCommunityTypeFilter`
- `AdminCommunityPostSchema` / `AdminCommunityPost` (shape below)
- `AdminCommunityPostListQuerySchema` / `AdminCommunityPostListQuery` = `AdminListQuerySchema.extend({ type, status })`
- `RejectPostSchema` / `RejectPostInput` = `{ reason: string }`
- `ADMIN_SECTION_LABELS.marketplace === 'Community'`, `ADMIN_SECTION_PATHS.marketplace === '/community'`

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/__tests__/community-moderation.test.ts
import { describe, expect, it } from 'vitest';

import { AdminCommunityPostListQuerySchema, RejectPostSchema } from '../admin';
import { ADMIN_SECTION_LABELS, ADMIN_SECTION_PATHS } from '../operator';

describe('AdminCommunityPostListQuerySchema', () => {
  it('defaults to the pending queue across every type', () => {
    expect(AdminCommunityPostListQuerySchema.parse({})).toMatchObject({
      type: 'ALL',
      status: 'PENDING',
    });
  });

  it('falls back rather than failing on an unknown filter value', () => {
    expect(AdminCommunityPostListQuerySchema.parse({ type: 'BOGUS', status: 'nope' })).toMatchObject({
      type: 'ALL',
      status: 'PENDING',
    });
  });
});

describe('RejectPostSchema', () => {
  it('requires a reason', () => {
    expect(RejectPostSchema.safeParse({ reason: '   ' }).success).toBe(false);
    expect(RejectPostSchema.parse({ reason: ' Too blurry ' }).reason).toBe('Too blurry');
  });
});

describe('marketplace section', () => {
  it('is presented as Community while keeping its permission key', () => {
    expect(ADMIN_SECTION_LABELS.marketplace).toBe('Community');
    expect(ADMIN_SECTION_PATHS.marketplace).toBe('/community');
  });
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `pnpm --filter=@nanny-app/shared test -- community-moderation`
Expected: FAIL (`AdminCommunityPostListQuerySchema` not exported; label is `Marketplace`).

- [ ] **Step 3: Replace the moderation block in `admin.ts`**

Replace lines 811–861 (from the `// Marketplace moderation` banner through `RejectListingInput`) with:

```ts
// ──────────────────────────────────────────────────────────────
// Community moderation (review queue for every post type) + official listings
// ──────────────────────────────────────────────────────────────

/** Moderation filter for the queue. Defaults to the pending queue. */
export const AdminCommunityStatusFilterSchema = z.enum([
  'ALL', 'PENDING', 'APPROVED', 'REJECTED',
]);
export type AdminCommunityStatusFilter = z.infer<typeof AdminCommunityStatusFilterSchema>;

/** Post-type filter for the queue. `ALL` is the default: one queue, oldest first. */
export const AdminCommunityTypeFilterSchema = z.enum(['ALL', 'QA', 'MARKETPLACE', 'EVENT']);
export type AdminCommunityTypeFilter = z.infer<typeof AdminCommunityTypeFilterSchema>;

/** One row in the admin community table — any post type. */
export const AdminCommunityPostSchema = z.object({
  /** CommunityPost id. */
  id: z.number().int(),
  type: CommunityPostTypeSchema,
  /** Null for a Q&A post with no headline — show the body instead. */
  title: z.string().nullable(),
  body: z.string().nullable(),
  price: z.number().nullable(),
  imageUrls: z.array(z.string()),
  tags: z.array(z.string()),
  /** Events only. */
  location: z.string().nullable(),
  eventStartsAt: z.string().nullable(),
  maxAttendees: z.number().int().nullable(),
  rsvpCount: z.number().int(),
  moderationStatus: PostModerationStatusSchema,
  rejectionReason: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  /** Platform-authored listing — pinned in the feed and never reviewed. */
  isOfficial: z.boolean(),
  /** Official listings only: the number buyers contact instead of messaging. */
  contactPhone: z.string().nullable(),
  /** Author. For an official listing this is the admin who created it. */
  author: z.object({
    id: z.number().int(),
    name: z.string(),
    avatarUrl: z.string().nullable(),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AdminCommunityPost = z.infer<typeof AdminCommunityPostSchema>;

/** Paginated queue query (GET /admin/community/posts). */
export const AdminCommunityPostListQuerySchema = AdminListQuerySchema.extend({
  type: AdminCommunityTypeFilterSchema.catch('ALL').default('ALL'),
  status: AdminCommunityStatusFilterSchema.catch('PENDING').default('PENDING'),
});
export type AdminCommunityPostListQuery = z.infer<typeof AdminCommunityPostListQuerySchema>;

/**
 * The reason is mandatory here (unlike `RejectNannySchema`) — the author has to
 * know what to change before she resubmits.
 */
export const RejectPostSchema = z.object({
  reason: z.string().trim().min(1, 'A reason is required').max(500),
});
export type RejectPostInput = z.infer<typeof RejectPostSchema>;
```

Add `CommunityPostTypeSchema` to the existing import on line 14: `import { CommunityPostTypeSchema, CommunityTagSchema, PostModerationStatusSchema } from './community';`

- [ ] **Step 4: Update comments in `community.ts`**

Lines 26–30 become:
```ts
/**
 * Moderation state of a post. Every type — Q&A, marketplace, event — is
 * reviewed: a new or edited post is `pending` until an admin approves it. A
 * rejected post stays visible to its author (with the reason) so she can edit
 * and resubmit it; rejecting a live post is how an admin takes it down.
 */
```
Lines 96–100 become:
```ts
/**
 * The author's own posts, whatever their moderation state — this is what the
 * mobile "My posts" screen reads so she can see her pending and rejected
 * posts alongside the live ones.
 */
```

- [ ] **Step 5: Update `operator.ts`**

Line 45: `marketplace: 'Community',` — add above the map a comment line: `// 'marketplace' is the stored permission key; the section now covers every community post.`
Line 62: `marketplace: '/community',`

- [ ] **Step 6: Run tests + typecheck the package**

Run: `pnpm --filter=@nanny-app/shared test -- community-moderation` → PASS.
Run: `pnpm --filter=@nanny-app/shared typecheck` → PASS. (Backend/admin will fail typecheck until Tasks 4–6; that is expected.)

- [ ] **Step 7: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): admin community post schemas and Community section label" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Backend — every post type enters review; RSVP respects visibility

**Files:**
- Modify: `apps/backend/src/services/community.service.ts:179-215` (`mapCreateInput`), `:382-392` (`reReview`), `:665-676` (`toggleEventRsvp`)
- Modify: `apps/backend/src/__tests__/community.service.test.ts:283-324, 444-457`
- Modify: `apps/backend/prisma/schema.prisma:1175-1177` (doc comment only — no migration)

- [ ] **Step 1: Rewrite the two tests that pin the old behaviour and add three**

In `community.service.test.ts` replace the test `'leaves QA posts approved — only listings are reviewed'` (lines 308–324) with:

```ts
  it('creates a QA post as PENDING review', async () => {
    mockPrisma.communityPost.create.mockResolvedValue({
      ...samplePost,
      moderationStatus: PrismaPostModerationStatus.PENDING,
    } as never);

    const result = await createPost(decoded, {
      type: 'qa',
      body: 'Hello community',
      tags: [],
      imageUrls: [],
    });

    expect(mockPrisma.communityPost.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          moderationStatus: PrismaPostModerationStatus.PENDING,
        }),
      }),
    );
    expect(result.moderationStatus).toBe('pending');
  });

  it('creates an event as PENDING review', async () => {
    mockPrisma.communityPost.create.mockResolvedValue({
      ...samplePost,
      type: PrismaCommunityPostType.EVENT,
      moderationStatus: PrismaPostModerationStatus.PENDING,
    } as never);

    await createPost(decoded, {
      type: 'event',
      title: 'Coffee morning',
      location: 'Maadi',
      eventStartsAt: '2026-10-01T09:00:00.000Z',
      tags: [],
      imageUrls: [],
    });

    expect(mockPrisma.communityPost.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: PrismaCommunityPostType.EVENT,
          moderationStatus: PrismaPostModerationStatus.PENDING,
        }),
      }),
    );
  });
```

Replace `'does not re-review an edited QA post'` (lines 444–457) with:

```ts
  it('sends an edited QA post back to review too', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(samplePost as never);
    mockPrisma.communityPost.update.mockResolvedValue({
      ...samplePost,
      moderationStatus: PrismaPostModerationStatus.PENDING,
    } as never);
    mockPrisma.postLike.findFirst.mockResolvedValue(null);
    mockPrisma.eventRsvp.findFirst.mockResolvedValue(null);

    const result = await updatePost(decoded, 22, { body: 'Edited' });

    expect(mockPrisma.communityPost.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          moderationStatus: PrismaPostModerationStatus.PENDING,
          rejectionReason: null,
          reviewedAt: null,
          reviewedById: null,
        }),
      }),
    );
    expect(result.moderationStatus).toBe('pending');
  });

  it('hides another member’s pending event from RSVP behind a 404', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue({
      ...samplePost,
      type: PrismaCommunityPostType.EVENT,
      authorId: 999,
      moderationStatus: PrismaPostModerationStatus.PENDING,
    } as never);

    await expect(toggleEventRsvp(decoded, 22)).rejects.toEqual(
      expect.objectContaining<Partial<AppError>>({ statusCode: 404 }),
    );
  });
```

Rename the describe on line 283 to `'community.service — moderation'`. (The event payload matches the `event` variant of `CreateCommunityPostSchema` in `packages/shared/src/community.ts:60-69` — `title`, `location`, `eventStartsAt` required; `tags`/`imageUrls` defaulted.)

- [ ] **Step 2: Run — expect the three rewritten/new tests to fail**

Run: `pnpm --filter=@nanny-app/backend test:unit -- community.service`
Expected: 4 failures (QA pending, event pending, QA re-review, RSVP 404).

- [ ] **Step 3: Implement**

`mapCreateInput` — move the pending flag into `base` and drop the marketplace-only line:

```ts
function mapCreateInput(body: CreateCommunityPostRequest, authorId: number) {
  const base = {
    authorId,
    type: toPrismaPostType(body.type),
    tags: body.tags ?? [],
    imageUrls: body.imageUrls ?? [],
    // Every post goes through admin review before it reaches the feed.
    moderationStatus: PrismaPostModerationStatus.PENDING,
  };

  switch (body.type) {
    case 'qa':
      return { ...base, title: body.title ?? null, body: body.body };
    case 'marketplace':
      return {
        ...base,
        title: body.title,
        body: body.body ?? null,
        price: new Prisma.Decimal(body.price),
        imageUrls: body.imageUrls,
      };
    case 'event':
      return {
        ...base,
        title: body.title,
        body: body.body ?? null,
        location: body.location,
        eventStartsAt: new Date(body.eventStartsAt),
        price: body.price !== undefined ? new Prisma.Decimal(body.price) : null,
        maxAttendees: body.maxAttendees ?? null,
      };
  }
}
```

`updatePost` — replace the `reReview` block (lines 382–392) with:

```ts
  // Any edit sends the post back through review — including an edit to an
  // already-approved one, so changed prices, dates and photos are always seen.
  const reReview = {
    moderationStatus: PrismaPostModerationStatus.PENDING,
    rejectionReason: null,
    reviewedAt: null,
    reviewedById: null,
  };
```

`toggleEventRsvp` — after `const post = await loadPostOrThrow(postId);` add `assertPostVisible(post, user.id);` (before the type check).

`schema.prisma` lines 1175–1177 comment becomes:
```prisma
/// Moderation state of a community post. Every type is reviewed — a new or
/// edited post is PENDING until an admin approves it. The column defaults to
/// APPROVED so posts that predate moderation stay live.
```
(Doc-comment change only; `prisma migrate diff` produces nothing.)

- [ ] **Step 4: Run the whole unit suite for the file**

Run: `pnpm --filter=@nanny-app/backend test:unit -- community.service` → all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/community.service.ts apps/backend/src/__tests__/community.service.test.ts apps/backend/prisma/schema.prisma
git commit -m "feat(community): every post type waits for admin review" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Backend — `admin-community.service` (queue, approve, reject) + slim `admin-marketplace.service`

**Files:**
- Create: `apps/backend/src/services/admin-community.service.ts`
- Create: `apps/backend/src/__tests__/admin-community.service.test.ts`
- Modify: `apps/backend/src/services/admin-marketplace.service.ts` (keep only official-listing CRUD)
- Modify: `apps/backend/src/__tests__/admin-marketplace.service.test.ts` (drop the list/approve/reject describes)

**Interfaces (produced):**
```ts
// admin-community.service.ts
export const communityPostInclude: Prisma.CommunityPostInclude;        // { author: { select: {id, firstName, lastName, avatarUrl} } }
export type CommunityPostRow = Prisma.CommunityPostGetPayload<{ include: typeof communityPostInclude }>;
export function toAdminCommunityPost(row: CommunityPostRow): AdminCommunityPost;
export async function resolveAdminId(adminFirebaseUid: string): Promise<number>;
export async function listCommunityPosts(query: AdminCommunityPostListQuery): Promise<{ posts: AdminCommunityPost[]; meta: PaginationMeta }>;
export async function approvePost(id: number, adminFirebaseUid: string): Promise<AdminCommunityPost>;
export async function rejectPost(id: number, input: RejectPostInput, adminFirebaseUid: string): Promise<AdminCommunityPost>;
// admin-marketplace.service.ts (unchanged signatures, now returning AdminCommunityPost)
createOfficialListing, updateOfficialListing, deleteOfficialListing
```

- [ ] **Step 1: Write the failing tests**

```ts
// apps/backend/src/__tests__/admin-community.service.test.ts
import { CommunityPostType, PostModerationStatus } from '@prisma/client';

import { AppError } from '@backend/lib/errors';

jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: { findFirst: jest.fn() },
    communityPost: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}));

jest.mock('@backend/services/notification.service', () => ({
  createInAppNotification: jest.fn(),
  dispatchPush: jest.fn(),
}));

import { prisma } from '@backend/db/prisma';
import {
  createInAppNotification,
  dispatchPush,
} from '@backend/services/notification.service';
import {
  approvePost,
  listCommunityPosts,
  rejectPost,
} from '@backend/services/admin-community.service';

const mockPrisma = prisma as unknown as {
  user: { findFirst: jest.Mock };
  communityPost: { count: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
  $transaction: jest.Mock;
};
const mockNotify = createInAppNotification as jest.Mock;
const mockPush = dispatchPush as jest.Mock;

const ADMIN_UID = 'firebase-admin';
const ADMIN_ID = 3;
const author = { id: 29, firstName: 'Jane', lastName: 'Doe', avatarUrl: null };

function makePost(overrides: Record<string, unknown> = {}) {
  return {
    id: 44,
    authorId: author.id,
    type: CommunityPostType.MARKETPLACE,
    title: 'Stroller',
    body: 'Barely used',
    imageUrls: ['https://cdn.example.com/stroller.jpg'],
    price: 1200,
    location: null,
    eventStartsAt: null,
    maxAttendees: null,
    rsvpCount: 0,
    tags: [],
    likeCount: 0,
    commentCount: 0,
    moderationStatus: PostModerationStatus.PENDING,
    rejectionReason: null,
    reviewedAt: null,
    reviewedById: null,
    isOfficial: false,
    contactPhone: null,
    createdAt: new Date('2026-08-01T10:00:00.000Z'),
    updatedAt: new Date('2026-08-01T10:00:00.000Z'),
    deletedAt: null,
    author,
    ...overrides,
  };
}

const eventPost = () =>
  makePost({
    id: 45,
    type: CommunityPostType.EVENT,
    title: 'Coffee morning',
    location: 'Maadi',
    eventStartsAt: new Date('2026-10-01T09:00:00.000Z'),
    price: null,
    imageUrls: [],
  });

const qaPost = () =>
  makePost({ id: 46, type: CommunityPostType.QA, title: null, body: 'Where do I buy a pram in Cairo that is not overpriced?', price: null, imageUrls: [] });

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.user.findFirst.mockResolvedValue({ id: ADMIN_ID });
  mockPrisma.$transaction.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));
});

describe('listCommunityPosts', () => {
  it('defaults to every type, pending, oldest submission first', async () => {
    mockPrisma.communityPost.count.mockResolvedValue(1);
    mockPrisma.communityPost.findMany.mockResolvedValue([eventPost()]);

    const { posts, meta } = await listCommunityPosts({ type: 'ALL', status: 'PENDING', page: 1, limit: 20 });

    expect(mockPrisma.communityPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null, moderationStatus: 'PENDING' }),
        orderBy: { createdAt: 'asc' },
      }),
    );
    expect(mockPrisma.communityPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.not.objectContaining({ type: expect.anything() }) }),
    );
    expect(posts[0]).toMatchObject({
      type: 'event',
      location: 'Maadi',
      eventStartsAt: '2026-10-01T09:00:00.000Z',
      moderationStatus: 'pending',
      author: { name: 'Jane Doe' },
    });
    expect(meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
  });

  it('narrows to one type and drops the status filter for ALL', async () => {
    mockPrisma.communityPost.count.mockResolvedValue(0);
    mockPrisma.communityPost.findMany.mockResolvedValue([]);

    await listCommunityPosts({ type: 'QA', status: 'ALL', page: 1, limit: 20 });

    expect(mockPrisma.communityPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: CommunityPostType.QA }),
        orderBy: [{ isOfficial: 'desc' }, { createdAt: 'desc' }],
      }),
    );
    expect(mockPrisma.communityPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.not.objectContaining({ moderationStatus: expect.anything() }) }),
    );
  });
});

describe('approvePost', () => {
  it('publishes the post, stamps the reviewer and notifies the author with event copy', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(eventPost());
    mockPrisma.communityPost.update.mockResolvedValue({
      ...eventPost(),
      moderationStatus: PostModerationStatus.APPROVED,
    });

    const result = await approvePost(45, ADMIN_UID);

    expect(mockPrisma.communityPost.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          moderationStatus: PostModerationStatus.APPROVED,
          rejectionReason: null,
          reviewedById: ADMIN_ID,
        }),
      }),
    );
    expect(result.moderationStatus).toBe('approved');
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: author.id,
        type: 'MARKETPLACE_LISTING_APPROVED',
        title: 'Your event is live',
        referenceId: 45,
        referenceType: 'COMMUNITY_POST',
      }),
    );
    expect(mockPush).toHaveBeenCalled();
  });

  it('keeps the listing wording for a marketplace post', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(makePost());
    mockPrisma.communityPost.update.mockResolvedValue(makePost({ moderationStatus: PostModerationStatus.APPROVED }));

    await approvePost(44, ADMIN_UID);

    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ title: 'Your listing is live' }));
  });

  it('is idempotent on an already-approved post', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(makePost({ moderationStatus: PostModerationStatus.APPROVED }));

    const result = await approvePost(44, ADMIN_UID);

    expect(result.moderationStatus).toBe('approved');
    expect(mockPrisma.communityPost.update).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('refuses a non-admin caller', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    await expect(approvePost(44, 'firebase-mother')).rejects.toEqual(
      expect.objectContaining<Partial<AppError>>({ statusCode: 403 }),
    );
  });

  it('404s on a post that does not exist', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(null);
    await expect(approvePost(999, ADMIN_UID)).rejects.toEqual(
      expect.objectContaining<Partial<AppError>>({ statusCode: 404 }),
    );
  });
});

describe('rejectPost', () => {
  it('stores the reason and tells the author what to fix, naming a Q&A post by its question', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(qaPost());
    mockPrisma.communityPost.update.mockResolvedValue({
      ...qaPost(),
      moderationStatus: PostModerationStatus.REJECTED,
      rejectionReason: 'Please keep it on topic',
    });

    const result = await rejectPost(46, { reason: 'Please keep it on topic' }, ADMIN_UID);

    expect(mockPrisma.communityPost.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          moderationStatus: PostModerationStatus.REJECTED,
          rejectionReason: 'Please keep it on topic',
          reviewedById: ADMIN_ID,
        }),
      }),
    );
    expect(result.rejectionReason).toBe('Please keep it on topic');
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'MARKETPLACE_LISTING_REJECTED',
        title: 'Your post needs changes',
        body: expect.stringContaining('Where do I buy a pram in Cairo that is not'),
      }),
    );
  });

  it('takes down an already-approved post', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(makePost({ moderationStatus: PostModerationStatus.APPROVED }));
    mockPrisma.communityPost.update.mockResolvedValue(
      makePost({ moderationStatus: PostModerationStatus.REJECTED, rejectionReason: 'Prohibited item' }),
    );

    const result = await rejectPost(44, { reason: 'Prohibited item' }, ADMIN_UID);

    expect(result.moderationStatus).toBe('rejected');
  });

  it('refuses to reject an official listing', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(makePost({ isOfficial: true }));
    await expect(rejectPost(44, { reason: 'nope' }, ADMIN_UID)).rejects.toEqual(
      expect.objectContaining<Partial<AppError>>({ statusCode: 400 }),
    );
  });
});
```

- [ ] **Step 2: Run — expect module-not-found failure**

Run: `pnpm --filter=@nanny-app/backend test:unit -- admin-community.service`
Expected: FAIL — cannot find `@backend/services/admin-community.service`.

- [ ] **Step 3: Create `admin-community.service.ts`**

```ts
import {
  CommunityPostType,
  NotificationReferenceType,
  PostModerationStatus,
  Prisma,
} from '@prisma/client';

import type {
  AdminCommunityPost,
  AdminCommunityPostListQuery,
  PaginationMeta,
  RejectPostInput,
} from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import {
  createInAppNotification,
  dispatchPush,
} from '@backend/services/notification.service';

export const communityPostInclude = {
  author: {
    select: { id: true, firstName: true, lastName: true, avatarUrl: true },
  },
} satisfies Prisma.CommunityPostInclude;

export type CommunityPostRow = Prisma.CommunityPostGetPayload<{
  include: typeof communityPostInclude;
}>;

function toApiType(type: CommunityPostType): AdminCommunityPost['type'] {
  switch (type) {
    case CommunityPostType.MARKETPLACE:
      return 'marketplace';
    case CommunityPostType.EVENT:
      return 'event';
    default:
      return 'qa';
  }
}

function toApiStatus(status: PostModerationStatus): AdminCommunityPost['moderationStatus'] {
  switch (status) {
    case PostModerationStatus.PENDING:
      return 'pending';
    case PostModerationStatus.REJECTED:
      return 'rejected';
    default:
      return 'approved';
  }
}

export function toAdminCommunityPost(row: CommunityPostRow): AdminCommunityPost {
  return {
    id: row.id,
    type: toApiType(row.type),
    title: row.title,
    body: row.body,
    price: row.price !== null ? Number(row.price) : null,
    imageUrls: row.imageUrls,
    tags: row.tags,
    location: row.location,
    eventStartsAt: row.eventStartsAt?.toISOString() ?? null,
    maxAttendees: row.maxAttendees,
    rsvpCount: row.rsvpCount,
    moderationStatus: toApiStatus(row.moderationStatus),
    rejectionReason: row.rejectionReason,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    isOfficial: row.isOfficial,
    contactPhone: row.contactPhone,
    author: {
      id: row.author.id,
      // The '-' placeholder last name (see the mothers list) is dropped.
      name: `${row.author.firstName} ${row.author.lastName === '-' ? '' : row.author.lastName}`.trim(),
      avatarUrl: row.author.avatarUrl,
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Resolve the calling admin's internal user id from their Firebase uid. */
export async function resolveAdminId(adminFirebaseUid: string): Promise<number> {
  const admin = await prisma.user.findFirst({
    where: {
      firebaseUid: adminFirebaseUid,
      deletedAt: null,
      role: { in: ['ADMIN', 'SUPERUSER', 'OPERATOR'] },
    },
    select: { id: true },
  });
  if (!admin) throw errors.forbidden('Admin access required');
  return admin.id;
}

async function loadPost(id: number): Promise<CommunityPostRow> {
  const post = await prisma.communityPost.findFirst({
    where: { id, deletedAt: null },
    include: communityPostInclude,
  });
  if (!post) throw errors.notFound('Post not found.');
  return post;
}

const EXCERPT_LENGTH = 40;

/**
 * How the author's notification refers to the post: the noun matches the type
 * (the marketplace wording is pinned by the mobile E2E suite), and a Q&A post
 * with no headline is named by the start of its question.
 */
function describePost(post: CommunityPostRow): { noun: string; name: string } {
  const noun =
    post.type === CommunityPostType.MARKETPLACE
      ? 'listing'
      : post.type === CommunityPostType.EVENT
        ? 'event'
        : 'post';
  const excerpt = post.body && post.body.length > EXCERPT_LENGTH
    ? `${post.body.slice(0, EXCERPT_LENGTH).trimEnd()}…`
    : post.body;
  return { noun, name: post.title ?? excerpt ?? `Your ${noun}` };
}

/**
 * Tell the author what happened to her post. Skipped for official listings,
 * where the admin is the author and would be notifying himself.
 */
async function notifyAuthor(
  post: CommunityPostRow,
  approved: boolean,
  reason?: string,
): Promise<void> {
  if (post.isOfficial) return;

  const { noun, name } = describePost(post);
  const title = approved ? `Your ${noun} is live` : `Your ${noun} needs changes`;
  const body = approved
    ? `"${name}" was approved and is now in the community.`
    : `"${name}" was not approved: ${reason ?? 'please review it and resubmit.'}`;

  await createInAppNotification({
    userId: post.authorId,
    type: approved ? 'MARKETPLACE_LISTING_APPROVED' : 'MARKETPLACE_LISTING_REJECTED',
    title,
    body,
    referenceId: post.id,
    referenceType: NotificationReferenceType.COMMUNITY_POST,
  });
  await dispatchPush(post.authorId, {
    title,
    body,
    data: {
      type: approved ? 'marketplace_listing_approved' : 'marketplace_listing_rejected',
      postId: String(post.id),
    },
  });
}

/**
 * The moderation queue across every post type. Defaults (via the query
 * schema) to PENDING — the posts actually waiting on an admin — with the
 * oldest submission first so authors are served in the order they posted.
 */
export async function listCommunityPosts({
  type,
  status,
  page,
  limit,
}: AdminCommunityPostListQuery): Promise<{ posts: AdminCommunityPost[]; meta: PaginationMeta }> {
  const where: Prisma.CommunityPostWhereInput = {
    deletedAt: null,
    ...(type !== 'ALL' ? { type: type as CommunityPostType } : {}),
    ...(status !== 'ALL' ? { moderationStatus: status as PostModerationStatus } : {}),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.communityPost.count({ where }),
    prisma.communityPost.findMany({
      where,
      include: communityPostInclude,
      orderBy:
        status === 'PENDING'
          ? { createdAt: 'asc' }
          : [{ isOfficial: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    posts: rows.map(toAdminCommunityPost),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

/** Publish a post. Idempotent — approving an approved post is a no-op. */
export async function approvePost(
  id: number,
  adminFirebaseUid: string,
): Promise<AdminCommunityPost> {
  const adminId = await resolveAdminId(adminFirebaseUid);
  const post = await loadPost(id);

  if (post.moderationStatus === PostModerationStatus.APPROVED) {
    return toAdminCommunityPost(post);
  }

  const updated = await prisma.communityPost.update({
    where: { id },
    data: {
      moderationStatus: PostModerationStatus.APPROVED,
      rejectionReason: null,
      reviewedAt: new Date(),
      reviewedById: adminId,
    },
    include: communityPostInclude,
  });

  await notifyAuthor(updated, true);
  return toAdminCommunityPost(updated);
}

/**
 * Reject a post with a reason the author sees in "My posts". Also serves as a
 * takedown: an already-approved post can be rejected, which pulls it straight
 * out of the feed.
 */
export async function rejectPost(
  id: number,
  input: RejectPostInput,
  adminFirebaseUid: string,
): Promise<AdminCommunityPost> {
  const adminId = await resolveAdminId(adminFirebaseUid);
  const post = await loadPost(id);

  if (post.isOfficial) {
    throw errors.badRequest('Official listings are not reviewed. Delete it instead.');
  }

  const updated = await prisma.communityPost.update({
    where: { id },
    data: {
      moderationStatus: PostModerationStatus.REJECTED,
      rejectionReason: input.reason,
      reviewedAt: new Date(),
      reviewedById: adminId,
    },
    include: communityPostInclude,
  });

  await notifyAuthor(updated, false, input.reason);
  return toAdminCommunityPost(updated);
}
```

- [ ] **Step 4: Slim `admin-marketplace.service.ts` to official listings only**

Replace the whole file with:

```ts
import { CommunityPostType, PostModerationStatus, Prisma } from '@prisma/client';

import {
  normalizePhone,
  type AdminCommunityPost,
  type CreateOfficialListingInput,
  type UpdateOfficialListingInput,
} from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import {
  communityPostInclude,
  resolveAdminId,
  toAdminCommunityPost,
  type CommunityPostRow,
} from '@backend/services/admin-community.service';

// Official ("Sold by NannyNow") listings. Moderation of seller posts — every
// type — lives in admin-community.service.

async function loadListing(id: number): Promise<CommunityPostRow> {
  const listing = await prisma.communityPost.findFirst({
    where: { id, type: CommunityPostType.MARKETPLACE, deletedAt: null },
    include: communityPostInclude,
  });
  if (!listing) throw errors.notFound('Listing not found.');
  return listing;
}

/**
 * Publish an official ("Sold by NannyNow") listing. Authored by the acting
 * admin, approved on creation, and pinned above seller listings in the feed.
 */
export async function createOfficialListing(
  input: CreateOfficialListingInput,
  adminFirebaseUid: string,
): Promise<AdminCommunityPost> {
  const adminId = await resolveAdminId(adminFirebaseUid);

  const created = await prisma.communityPost.create({
    data: {
      authorId: adminId,
      type: CommunityPostType.MARKETPLACE,
      title: input.title,
      body: input.body ?? null,
      price: new Prisma.Decimal(input.price),
      imageUrls: input.imageUrls,
      tags: input.tags ?? [],
      isOfficial: true,
      contactPhone: normalizePhone(input.contactPhone),
      moderationStatus: PostModerationStatus.APPROVED,
      reviewedAt: new Date(),
      reviewedById: adminId,
    },
    include: communityPostInclude,
  });

  return toAdminCommunityPost(created);
}

/** Edit an official listing. Never re-enters review — an admin authored it. */
export async function updateOfficialListing(
  id: number,
  input: UpdateOfficialListingInput,
): Promise<AdminCommunityPost> {
  const listing = await loadListing(id);
  if (!listing.isOfficial) {
    throw errors.badRequest('Only official listings can be edited here.');
  }

  const updated = await prisma.communityPost.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.price !== undefined ? { price: new Prisma.Decimal(input.price) } : {}),
      ...(input.imageUrls !== undefined ? { imageUrls: input.imageUrls } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.contactPhone !== undefined
        ? { contactPhone: normalizePhone(input.contactPhone) }
        : {}),
    },
    include: communityPostInclude,
  });

  return toAdminCommunityPost(updated);
}

/** Soft-delete an official listing (sellers remove their own from the app). */
export async function deleteOfficialListing(id: number): Promise<void> {
  const listing = await loadListing(id);
  if (!listing.isOfficial) {
    throw errors.badRequest('Only official listings can be deleted here. Reject it instead.');
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.communityPost.update({ where: { id }, data: { deletedAt: now } }),
    prisma.comment.updateMany({
      where: { postId: id, deletedAt: null },
      data: { deletedAt: now },
    }),
  ]);
}
```

- [ ] **Step 5: Trim `admin-marketplace.service.test.ts`**

Delete the `listMarketplaceListings`, `approveListing` and `rejectListing` describes (lines 90–234) and their imports; keep `createOfficialListing` and `updateOfficialListing / deleteOfficialListing`. Add `location: null, eventStartsAt: null, maxAttendees: null, rsvpCount: 0, likeCount: 0, commentCount: 0` to `makeListing`. Keep the `notification.service` mock (the file still imports the community service, which imports it).

- [ ] **Step 6: Run both suites**

Run: `pnpm --filter=@nanny-app/backend test:unit -- admin-community.service admin-marketplace.service`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/services/admin-community.service.ts apps/backend/src/services/admin-marketplace.service.ts apps/backend/src/__tests__/admin-community.service.test.ts apps/backend/src/__tests__/admin-marketplace.service.test.ts
git commit -m "feat(admin): moderate every community post type from one service" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Backend — routes and the permission table

**Files:**
- Modify: `apps/backend/src/routes/admin.routes.ts:9-36` (imports), `:93-98` (service imports), `:509-590` (route block)
- Modify: `apps/backend/src/lib/admin-permissions.ts:93-107`

**Interfaces (produced — the admin app depends on these):**
- `GET  /admin/community/posts?type=ALL|QA|MARKETPLACE|EVENT&status=ALL|PENDING|APPROVED|REJECTED&page&limit` → `okPaged(AdminCommunityPost[], meta)`
- `POST /admin/community/posts/:id/approve` → `ok(AdminCommunityPost)`
- `POST /admin/community/posts/:id/reject` body `{ reason }` → `ok(AdminCommunityPost)`
- `POST /admin/marketplace/listings`, `PATCH /admin/marketplace/listings/:id`, `DELETE /admin/marketplace/listings/:id` — unchanged

- [ ] **Step 1: Update the permission table** (replace lines 93–107)

```ts
  // ── Community moderation (every post type) + official listings ──
  // Stored permission key stays `marketplace`; the console labels it "Community".
  { method: 'GET', pattern: '/community/posts', requires: section('marketplace', 'VIEW') },
  {
    method: 'POST',
    pattern: '/community/posts/:id/approve',
    requires: section('marketplace', 'MANAGE'),
  },
  {
    method: 'POST',
    pattern: '/community/posts/:id/reject',
    requires: section('marketplace', 'MANAGE'),
  },
  { method: 'POST', pattern: '/marketplace/listings', requires: section('marketplace', 'MANAGE') },
  { method: 'PATCH', pattern: '/marketplace/listings/:id', requires: section('marketplace', 'MANAGE') },
  { method: 'DELETE', pattern: '/marketplace/listings/:id', requires: section('marketplace', 'MANAGE') },
```

- [ ] **Step 2: Run the permissions test — expect failure (stale rows vs. router)**

Run: `pnpm --filter=@nanny-app/backend test:unit -- admin-permissions`
Expected: FAIL — `/community/posts` declared but not routed; `/marketplace/listings` GET routed but undeclared.

- [ ] **Step 3: Rewrite the route block** (lines 509–590)

```ts
// ── Community moderation (every post type) ─────────────────────

adminRouter.get(
  '/community/posts',
  validateQuery(AdminCommunityPostListQuerySchema),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const query = res.locals['validatedQuery'] as AdminCommunityPostListQuery;
      const { posts, meta } = await listCommunityPosts(query);
      res.json(okPaged(posts, meta));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.post(
  '/community/posts/:id/approve',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      res.json(ok(await approvePost(routeIdParam(req.params.id), req.firebaseUser.uid)));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.post(
  '/community/posts/:id/reject',
  validateBody(RejectPostSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      res.json(ok(await rejectPost(routeIdParam(req.params.id), req.body, req.firebaseUser.uid)));
    } catch (err) {
      next(err);
    }
  },
);

// ── Official marketplace listings ──────────────────────────────

adminRouter.post(
  '/marketplace/listings',
  validateBody(CreateOfficialListingSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const listing = await createOfficialListing(req.body, req.firebaseUser.uid);
      res.status(201).json(ok(listing));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.patch(
  '/marketplace/listings/:id',
  validateBody(UpdateOfficialListingSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await updateOfficialListing(routeIdParam(req.params.id), req.body)));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.delete(
  '/marketplace/listings/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await deleteOfficialListing(routeIdParam(req.params.id));
      res.json(ok({ deleted: true }));
    } catch (err) {
      next(err);
    }
  },
);
```

Imports: replace `AdminMarketplaceListQuerySchema, type AdminMarketplaceListQuery` with `AdminCommunityPostListQuerySchema, type AdminCommunityPostListQuery`; replace `RejectListingSchema` with `RejectPostSchema`; replace the `admin-marketplace.service` import list with `createOfficialListing, deleteOfficialListing, updateOfficialListing` and add `import { approvePost, listCommunityPosts, rejectPost } from '@backend/services/admin-community.service';`.

- [ ] **Step 4: Verify**

Run: `pnpm --filter=@nanny-app/backend test:unit -- admin-permissions` → PASS.
Run: `pnpm --filter=@nanny-app/backend typecheck` → PASS.
Run: `pnpm --filter=@nanny-app/backend test:unit` → all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/routes/admin.routes.ts apps/backend/src/lib/admin-permissions.ts
git commit -m "feat(admin-api): community post moderation routes" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Admin console — Community page with type filter

**Files:**
- Modify: `apps/admin/src/lib/api.ts:15-20` (type imports), `:616-670`
- Modify: `apps/admin/src/components/ui/icon.tsx:9-21` (add `MessagesSquare` to the Navigation group)
- Modify: `apps/admin/src/components/admin-layout.tsx:9-31, 45`
- Modify: `apps/admin/src/app.tsx:19, 158-161`
- Create: `apps/admin/src/pages/community-page.tsx` (delete `marketplace-page.tsx`)
- Create: `apps/admin/src/features/community/post-table.tsx` (delete `features/marketplace/listing-table.tsx`)
- Modify: `apps/admin/src/features/marketplace/official-listing-form.tsx:7, 32, 202, 269` (type rename, `title ?? ''`, query key)
- Modify: `apps/admin/src/styles/global.css:3543` (section comment → `Community moderation`; add `.listing-cell-meta`)
- Create: `apps/admin/src/features/community/__tests__/post-table.test.tsx`
- Modify: `apps/admin/e2e/a12-operator-ui.spec.ts:26` (`'Marketplace'` → `'Community'`)

**Interfaces (produced):**
```ts
// lib/api.ts
fetchCommunityPosts(type: AdminCommunityTypeFilter, status: AdminCommunityStatusFilter, { page, limit }: AdminListQuery): Promise<Paged<AdminCommunityPost[]>>
approvePost(id: number): Promise<AdminCommunityPost>
rejectPost(id: number, reason: string): Promise<AdminCommunityPost>
createOfficialListing / updateOfficialListing / deleteOfficialListing — unchanged, typed AdminCommunityPost
// query key: ['community-posts', type, status, page, limit]; invalidate on ['community-posts']
```

- [ ] **Step 1: Write the failing component test**

```tsx
// apps/admin/src/features/community/__tests__/post-table.test.tsx
/**
 * The table now carries every post type. What is worth pinning: a Q&A post
 * with no headline is still identifiable (by its question), an event shows
 * where and when, the decision goes to the community endpoint, and a live
 * post's menu says "Take down" rather than "Reject".
 */
import type { AdminCommunityPost, AdminUser } from '@nanny-app/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { PostTable } from '@admin/features/community/post-table';
import { PermissionsProvider } from '@admin/lib/permissions';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

function ok<T>(data: T) {
  return HttpResponse.json({ data, error: null });
}

const ADMIN: AdminUser = {
  id: 1,
  name: 'Ops Admin',
  email: 'ops@example.com',
  role: 'ADMIN',
  permissions: {},
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const BASE: AdminCommunityPost = {
  id: 44,
  type: 'marketplace',
  title: 'Stroller',
  body: 'Barely used',
  price: 1200,
  imageUrls: [],
  tags: [],
  location: null,
  eventStartsAt: null,
  maxAttendees: null,
  rsvpCount: 0,
  moderationStatus: 'pending',
  rejectionReason: null,
  reviewedAt: null,
  isOfficial: false,
  contactPhone: null,
  author: { id: 29, name: 'Jane Doe', avatarUrl: null },
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-01T10:00:00.000Z',
};

const QA: AdminCommunityPost = {
  ...BASE,
  id: 46,
  type: 'qa',
  title: null,
  body: 'Where do I buy a pram in Cairo?',
  price: null,
};

const EVENT: AdminCommunityPost = {
  ...BASE,
  id: 45,
  type: 'event',
  title: 'Coffee morning',
  location: 'Maadi Community Hall',
  eventStartsAt: '2026-10-01T09:00:00.000Z',
  price: null,
};

function renderTable(posts: AdminCommunityPost[]) {
  server.use(http.get('/api/admin/me', () => ok(ADMIN)));
  return renderWithProviders(
    <PermissionsProvider>
      <ToastProvider>
        <PostTable posts={posts} />
      </ToastProvider>
    </PermissionsProvider>,
  );
}

describe('PostTable', () => {
  it('names a Q&A post by its question and shows an event’s place', () => {
    renderTable([QA, EVENT]);

    expect(screen.getByText('Where do I buy a pram in Cairo?')).toBeInTheDocument();
    expect(screen.getByText('Q&A')).toBeInTheDocument();
    expect(screen.getByText('Maadi Community Hall')).toBeInTheDocument();
    expect(screen.getByText('Event')).toBeInTheDocument();
  });

  it('approves through the community endpoint', async () => {
    let approvedId: string | null = null;
    server.use(
      http.post('/api/admin/community/posts/:id/approve', ({ params }) => {
        approvedId = String(params['id']);
        return ok({ ...EVENT, moderationStatus: 'approved' });
      }),
    );
    renderTable([EVENT]);

    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Coffee morning' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Approve' }));

    await waitFor(() => expect(approvedId).toBe('45'));
    expect(await screen.findByText('Post approved')).toBeInTheDocument();
  });

  it('offers Take down on a live post and sends the reason', async () => {
    let body: unknown = null;
    server.use(
      http.post('/api/admin/community/posts/:id/reject', async ({ request }) => {
        body = await request.json();
        return ok({ ...QA, moderationStatus: 'rejected', rejectionReason: 'Off topic' });
      }),
    );
    renderTable([{ ...QA, moderationStatus: 'approved' }]);

    await userEvent.click(await screen.findByRole('button', { name: /Actions for/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Take down' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'Off topic');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Take down' }));

    await waitFor(() => expect(body).toEqual({ reason: 'Off topic' }));
    expect(await screen.findByText('Post rejected')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `pnpm --filter=@nanny-app/admin test -- post-table`
Expected: FAIL — module `@admin/features/community/post-table` not found.

- [ ] **Step 3: `lib/api.ts` — replace the marketplace block** (lines 616–670) and the type imports on lines 15–20

```ts
// ── Community moderation (every post type) ─────────────────────

export async function fetchCommunityPosts(
  type: AdminCommunityTypeFilter,
  status: AdminCommunityStatusFilter,
  { page, limit }: AdminListQuery,
): Promise<Paged<AdminCommunityPost[]>> {
  const res = await apiClient.get<PagedEnvelope<AdminCommunityPost[]>>(
    '/admin/community/posts',
    { params: { type, status, page, limit } },
  );
  return { data: res.data.data, meta: res.data.meta };
}

export async function approvePost(id: number): Promise<AdminCommunityPost> {
  const res = await apiClient.post<ApiEnvelope<AdminCommunityPost>>(
    `/admin/community/posts/${id}/approve`,
  );
  return res.data.data;
}

export async function rejectPost(id: number, reason: string): Promise<AdminCommunityPost> {
  const res = await apiClient.post<ApiEnvelope<AdminCommunityPost>>(
    `/admin/community/posts/${id}/reject`,
    { reason },
  );
  return res.data.data;
}

// ── Official marketplace listings ──────────────────────────────

export async function createOfficialListing(
  input: CreateOfficialListingInput,
): Promise<AdminCommunityPost> {
  const res = await apiClient.post<ApiEnvelope<AdminCommunityPost>>(
    '/admin/marketplace/listings',
    input,
  );
  return res.data.data;
}

export async function updateOfficialListing(
  id: number,
  input: UpdateOfficialListingInput,
): Promise<AdminCommunityPost> {
  const res = await apiClient.patch<ApiEnvelope<AdminCommunityPost>>(
    `/admin/marketplace/listings/${id}`,
    input,
  );
  return res.data.data;
}

export async function deleteOfficialListing(id: number): Promise<void> {
  await apiClient.delete(`/admin/marketplace/listings/${id}`);
}
```
Imports: swap `AdminMarketplaceListing, AdminMarketplaceStatusFilter` for `AdminCommunityPost, AdminCommunityStatusFilter, AdminCommunityTypeFilter`.

- [ ] **Step 4: Nav, icon, route**

`icon.tsx`: add `MessagesSquare,` after `Store,` in the Navigation group.
`admin-layout.tsx`: import `MessagesSquare` (keep `Store` only if still used elsewhere; otherwise drop it); nav row → `{ to: '/community', label: 'Community', icon: MessagesSquare, section: 'marketplace' },`.
`app.tsx`: `import { CommunityPage } from './pages/community-page';` and the route `path="community"` rendering `<Guarded section="marketplace"><CommunityPage /></Guarded>`.
`a12-operator-ui.spec.ts:26`: `'Community',`.

- [ ] **Step 5: `pages/community-page.tsx`** (delete `marketplace-page.tsx`)

```tsx
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import {
  ADMIN_PAGE_SIZES,
  type AdminCommunityStatusFilter,
  type AdminCommunityTypeFilter,
} from '@nanny-app/shared';

import {
  ErrorState,
  FilterSelect,
  PageHeader,
  Pagination,
  StaleRefreshBanner,
  TableSkeleton,
} from '@admin/components/ui';
import { PostTable } from '@admin/features/community/post-table';
import { OfficialListingForm } from '@admin/features/marketplace/official-listing-form';
import { fetchCommunityPosts } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';
import { usePagination } from '@admin/lib/use-pagination';

const TYPE_FILTERS: { value: AdminCommunityTypeFilter; label: string }[] = [
  { value: 'ALL', label: 'All types' },
  { value: 'MARKETPLACE', label: 'Marketplace' },
  { value: 'QA', label: 'Q&A' },
  { value: 'EVENT', label: 'Events' },
];

const STATUS_FILTERS: { value: AdminCommunityStatusFilter; label: string }[] = [
  { value: 'PENDING', label: 'Pending review' },
  { value: 'APPROVED', label: 'Live' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'ALL', label: 'All' },
];

export function CommunityPage() {
  const canManage = useCanManage('marketplace');
  const [type, setType] = useState<AdminCommunityTypeFilter>('ALL');
  const [status, setStatus] = useState<AdminCommunityStatusFilter>('PENDING');
  const { page, limit, setPage, setLimit, reset } = usePagination();

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['community-posts', type, status, page, limit],
    queryFn: () => fetchCommunityPosts(type, status, { page, limit }),
  });
  const posts = data?.data;
  const meta = data?.meta;

  return (
    <section>
      <PageHeader
        title="Community"
        subtitle="Review what mothers post — questions, events and listings — before it reaches the feed, and publish official listings of your own."
      />

      {canManage && <OfficialListingForm />}

      <p className="panel-lead">
        New and edited posts wait here until you approve them. Rejecting one sends the author
        the reason so she can fix it and resubmit — and takes a live post straight out of the
        feed.
      </p>

      <div className="filter-bar">
        <FilterSelect
          label="Type"
          value={type}
          options={TYPE_FILTERS}
          onChange={(value) => {
            setType(value as AdminCommunityTypeFilter);
            reset();
          }}
        />
        <FilterSelect
          label="Status"
          value={status}
          options={STATUS_FILTERS}
          onChange={(value) => {
            setStatus(value as AdminCommunityStatusFilter);
            reset();
          }}
        />
      </div>

      {isLoading && <TableSkeleton columns={7} />}
      {error != null && !posts && (
        <ErrorState
          message={apiErrorMessage(error)}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      )}
      {posts && (
        <>
          {error != null && (
            <StaleRefreshBanner
              message={apiErrorMessage(error)}
              onRetry={() => void refetch()}
              retrying={isFetching}
            />
          )}
          <PostTable posts={posts} />
          {meta && (
            <Pagination
              page={meta.page}
              totalPages={meta.totalPages}
              total={meta.total}
              limit={meta.limit}
              limitOptions={ADMIN_PAGE_SIZES}
              label="posts"
              onPageChange={setPage}
              onLimitChange={setLimit}
            />
          )}
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 6: `features/community/post-table.tsx`** (delete `features/marketplace/listing-table.tsx`)

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { AdminCommunityPost, CreateOfficialListingInput } from '@nanny-app/shared';

import {
  ActionMenu,
  Badge,
  Ban,
  Check,
  type Column,
  ConfirmDialog,
  ICON_SIZE,
  MenuItem,
  MenuSeparator,
  Pencil,
  PromptDialog,
  Table,
  Trash2,
  useToast,
} from '@admin/components/ui';
import {
  approvePost,
  deleteOfficialListing,
  rejectPost,
  updateOfficialListing,
} from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';
import { formatDateTime, formatEgp } from '@admin/lib/format';
import { OfficialListingEditModal } from '@admin/features/marketplace/official-listing-form';

const STATUS_TONE = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
} as const;

const STATUS_LABEL = {
  pending: 'Pending review',
  approved: 'Live',
  rejected: 'Rejected',
} as const;

const TYPE_LABEL = {
  qa: 'Q&A',
  marketplace: 'Marketplace',
  event: 'Event',
} as const;

/** What a row is called in toasts and dialogs — a listing is still a listing. */
function nounFor(post: AdminCommunityPost): string {
  return post.type === 'marketplace' ? 'listing' : post.type === 'event' ? 'event' : 'post';
}

/** A Q&A post may have no headline; its question is what identifies it. */
export function displayTitle(post: AdminCommunityPost): string {
  return post.title ?? post.body ?? `Post #${post.id}`;
}

type PostTableProps = {
  posts: AdminCommunityPost[];
};

export function PostTable({ posts }: PostTableProps) {
  const canManage = useCanManage('marketplace');
  const queryClient = useQueryClient();
  const toast = useToast();
  const [rejecting, setRejecting] = useState<AdminCommunityPost | null>(null);
  const [editing, setEditing] = useState<AdminCommunityPost | null>(null);
  const [deleting, setDeleting] = useState<AdminCommunityPost | null>(null);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['community-posts'] });

  const approveMutation = useMutation({
    mutationFn: approvePost,
    onSuccess: (post) => {
      invalidate();
      toast.success('Post approved', `“${displayTitle(post)}” is now live in the community.`);
    },
    onError: (err) => toast.error('Couldn’t approve post', apiErrorMessage(err)),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => rejectPost(id, reason),
    onSuccess: (post) => {
      invalidate();
      setRejecting(null);
      toast.success('Post rejected', `The author can edit “${displayTitle(post)}” and resubmit.`);
    },
    onError: (err) => toast.error('Couldn’t reject post', apiErrorMessage(err)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: number; input: CreateOfficialListingInput }) =>
      updateOfficialListing(id, input),
    onSuccess: (post) => {
      invalidate();
      setEditing(null);
      toast.success('Listing updated', displayTitle(post));
    },
    onError: (err) => toast.error('Couldn’t update listing', apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteOfficialListing,
    onSuccess: () => {
      invalidate();
      setDeleting(null);
      toast.success('Official listing deleted');
    },
    onError: (err) => toast.error('Couldn’t delete listing', apiErrorMessage(err)),
  });

  const columns: Column<AdminCommunityPost>[] = [
    {
      key: 'item',
      header: 'Post',
      render: (post) => (
        <div className="listing-cell">
          {post.imageUrls[0] ? (
            <img className="listing-cell-image" src={post.imageUrls[0]} alt="" />
          ) : (
            <span className="listing-cell-image listing-cell-image--empty" aria-hidden="true" />
          )}
          <div className="listing-cell-text">
            <span className="listing-cell-title">{displayTitle(post)}</span>
            {post.title && post.body && <span className="listing-cell-body">{post.body}</span>}
          </div>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (post) => <Badge>{TYPE_LABEL[post.type]}</Badge>,
    },
    {
      key: 'details',
      header: 'Details',
      render: (post) => {
        if (post.type === 'marketplace') {
          return post.price !== null ? formatEgp(post.price) : <span className="table-empty">—</span>;
        }
        if (post.type === 'event') {
          return (
            <div className="listing-cell-text">
              {post.eventStartsAt && <span>{formatDateTime(post.eventStartsAt)}</span>}
              {post.location && <span className="listing-cell-meta">{post.location}</span>}
            </div>
          );
        }
        return <span className="table-empty">—</span>;
      },
    },
    {
      key: 'author',
      header: 'Author',
      render: (post) => (post.isOfficial ? <Badge>Official</Badge> : post.author.name),
    },
    {
      key: 'status',
      header: 'Status',
      render: (post) => (
        <div className="listing-status">
          <Badge tone={STATUS_TONE[post.moderationStatus]}>{STATUS_LABEL[post.moderationStatus]}</Badge>
          {post.rejectionReason && <span className="listing-reason">{post.rejectionReason}</span>}
        </div>
      ),
    },
    {
      key: 'submitted',
      header: 'Submitted',
      render: (post) => formatDateTime(post.createdAt),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (post) => (
        <ActionMenu label={`Actions for ${displayTitle(post)}`} disabled={!canManage}>
          {!post.isOfficial && (
            <MenuItem
              icon={<Check size={ICON_SIZE.menu} />}
              disabled={post.moderationStatus === 'approved' || approveMutation.isPending}
              onSelect={() => approveMutation.mutate(post.id)}
            >
              Approve
            </MenuItem>
          )}
          {!post.isOfficial && (
            <MenuItem
              icon={<Ban size={ICON_SIZE.menu} />}
              disabled={post.moderationStatus === 'rejected'}
              onSelect={() => setRejecting(post)}
            >
              {post.moderationStatus === 'approved' ? 'Take down' : 'Reject'}
            </MenuItem>
          )}
          {post.isOfficial && (
            <>
              <MenuItem icon={<Pencil size={ICON_SIZE.menu} />} onSelect={() => setEditing(post)}>
                Edit
              </MenuItem>
              <MenuSeparator />
              <MenuItem danger icon={<Trash2 size={ICON_SIZE.menu} />} onSelect={() => setDeleting(post)}>
                Delete
              </MenuItem>
            </>
          )}
        </ActionMenu>
      ),
    },
  ];

  return (
    <>
      <Table columns={columns} rows={posts} rowKey={(post) => post.id} empty="No posts in this queue." />

      {rejecting && (
        <PromptDialog
          title={
            rejecting.moderationStatus === 'approved'
              ? `Take down ${nounFor(rejecting)}`
              : `Reject ${nounFor(rejecting)}`
          }
          message={`The author sees this reason on “${displayTitle(rejecting)}” and can edit it and resubmit.`}
          label="Reason"
          placeholder="e.g. Photos are too blurry to see the item"
          confirmLabel={rejecting.moderationStatus === 'approved' ? 'Take down' : `Reject ${nounFor(rejecting)}`}
          multiline
          required
          danger
          busy={rejectMutation.isPending}
          onSubmit={(reason) => rejectMutation.mutate({ id: rejecting.id, reason })}
          onCancel={() => setRejecting(null)}
        />
      )}

      {editing && (
        <OfficialListingEditModal
          listing={editing}
          busy={updateMutation.isPending}
          onCancel={() => setEditing(null)}
          onSave={(input) => updateMutation.mutate({ id: editing.id, input })}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete official listing"
          message={`Delete “${displayTitle(deleting)}”? It disappears from the marketplace immediately.`}
          confirmLabel="Delete listing"
          danger
          busy={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}
```

`official-listing-form.tsx`: change the type import to `AdminCommunityPost`; in `draftFromListing` use `listing.title ?? ''`; the query invalidation key becomes `['community-posts']`; `OfficialListingEditModal`'s `listing` prop is `AdminCommunityPost`.

`global.css` line 3543 comment → `/* ── Community moderation (Community) ───────────────── */` and add after `.listing-cell-body, .listing-reason { … }`:
```css
.listing-cell-meta {
  color: var(--color-text-muted);
  font-size: 0.8rem;
}
```

- [ ] **Step 7: Verify**

Run: `pnpm --filter=@nanny-app/admin test -- post-table` → PASS.
Run: `pnpm --filter=@nanny-app/admin typecheck` → PASS (fix any remaining `AdminMarketplaceListing` references it reports).
Run: `pnpm --filter=@nanny-app/admin test` → all PASS.
Optional visual check: `pnpm --filter=@nanny-app/admin dev` and open `/community` (needs a backend).

- [ ] **Step 8: Commit**

```bash
git add apps/admin/src apps/admin/e2e/a12-operator-ui.spec.ts
git commit -m "feat(admin): Community page moderates every post type" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Admin E2E — B6 becomes community moderation

**Files:**
- Modify: `apps/admin/e2e/helpers/backend.ts:534-700`
- Create: `apps/admin/e2e/b06-community-moderation.spec.ts` (delete `b06-marketplace-moderation.spec.ts`)
- Modify: `Docs/testing/e2e-flows.md:285-310`

- [ ] **Step 1: Helpers** — in `backend.ts`:
  - Update the section comment: moderation is through `/admin/community/posts`.
  - Add generic seeders alongside `seedListing`:
  ```ts
  export type SeededPost = { id: number; title: string; author: SeededMother };

  /** A Q&A post a mother has just asked: PENDING, so not yet in anybody's feed. */
  export async function seedQuestion(options: { author?: SeededMother } = {}): Promise<SeededPost> {
    const author = options.author ?? (await seedMother());
    const { surname } = unique('question');
    const title = `E2E question ${surname}`;
    const post = (await call('POST', '/community/posts', author.token, {
      type: 'qa',
      title,
      body: 'Where do I buy a pram in Cairo? Seeded by the admin E2E suite.',
    })) as { id: number };
    return { id: post.id, title, author };
  }

  /** An event a mother has just proposed: PENDING, so nobody else can RSVP yet. */
  export async function seedEvent(options: { author?: SeededMother } = {}): Promise<SeededPost> {
    const author = options.author ?? (await seedMother());
    const { surname } = unique('event');
    const title = `E2E coffee morning ${surname}`;
    const post = (await call('POST', '/community/posts', author.token, {
      type: 'event',
      title,
      location: 'Maadi Community Hall',
      eventStartsAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      maxAttendees: 10,
    })) as { id: number };
    return { id: post.id, title, author };
  }

  /** A viewer's attempt to RSVP — 404 while the event is unpublished, 200 once live. */
  export async function rsvpStatus(viewerToken: string, id: number): Promise<number> {
    return statusOf('POST', `/community/posts/${id}/rsvp`, viewerToken);
  }

  /**
   * Whether a post is in the feed the app renders for `type`, walking pages —
   * the E2E database is never truncated, so page 1 drifts from "just posted".
   */
  export async function findInFeed(
    viewerToken: string,
    type: 'qa' | 'marketplace' | 'event',
    id: number,
  ): Promise<{ id: number; title: string | null } | null> {
    for (let page = 1; page <= 20; page += 1) {
      const posts = (await call(
        'GET',
        `/community/posts?type=${type}&limit=50&page=${page}`,
        viewerToken,
      )) as Array<{ id: number; title: string | null }>;

      const match = posts.find((post) => post.id === id);
      if (match) return match;
      if (posts.length < 50) return null;
    }
    throw new Error(`Walked 20 pages of the ${type} feed without reaching the end.`);
  }

  export function findInMarketplaceFeed(viewerToken: string, id: number) {
    return findInFeed(viewerToken, 'marketplace', id);
  }
  ```
  (Replace the old `findInMarketplaceFeed` body with the two functions above.)
  - `listMyListings` → `listMyPosts(token)` hitting `/community/my-posts?limit=50`.
  - `approveListingAsAdmin` → `approvePostAsAdmin` (`/admin/community/posts/${id}/approve`); `rejectListingAsAdmin` → `rejectPostAsAdmin` (`/admin/community/posts/${id}/reject`).
  - `listingVisibleTo` → keep name, add alias `postVisibleTo` = same function (the spec reads better).

- [ ] **Step 2: Spec** — rename the file to `b06-community-moderation.spec.ts`; `openQueue` goes to `/community`; every toast/dialog assertion updates: `'Listing approved'` → `'Post approved'`, `'Listing rejected'` → `'Post rejected'`, button `'Reject listing'` stays (it is `Reject ${noun}` = "Reject listing" for a marketplace row). Add two tests:

```ts
test('a question waits for review like a listing, and lands in the Q&A feed once approved', async ({ page }) => {
  const question = await seedQuestion();
  const reader = await seedMother();

  expect(await postVisibleTo(reader.token, question.id)).toBe(false);
  expect(await findInFeed(reader.token, 'qa', question.id)).toBeNull();

  await openQueue(page);
  await chooseOption(page, 'Type', 'Q&A');
  const row = await findRow(page, question.title);
  await expect(row).toContainText('Q&A');
  await expect(row).toContainText('Pending review');

  await chooseAction(page, question.title, 'Approve');
  await expect(toast(page, 'Post approved')).toBeVisible();
  expect(await findInFeed(reader.token, 'qa', question.id)).not.toBeNull();
});

test('taking down a live event closes RSVP with it', async ({ page }) => {
  const admin = await superuserToken();
  const event = await seedEvent();
  const guest = await seedMother();

  // Unpublished: a guest cannot even find it to RSVP.
  expect(await rsvpStatus(guest.token, event.id)).toBe(404);

  await approvePostAsAdmin(admin, event.id);
  expect(await rsvpStatus(guest.token, event.id)).toBe(200);

  await openQueue(page, 'Live');
  await chooseOption(page, 'Type', 'Events');
  const row = await findRow(page, event.title);
  await expect(row).toContainText('Maadi Community Hall');

  await chooseAction(page, event.title, 'Take down');
  await page.getByLabel('Reason').fill('Venue is not confirmed.');
  await page.getByRole('button', { name: 'Take down' }).click();
  await expect(toast(page, 'Post rejected')).toBeVisible();

  expect(await postVisibleTo(guest.token, event.id)).toBe(false);
  // The author still sees it, with the reason, so she can fix it.
  const mine = await listMyPosts(event.author.token);
  expect(mine.find((p) => p.id === event.id)?.rejectionReason).toBe('Venue is not confirmed.');
});
```

- [ ] **Step 3: Docs** — `Docs/testing/e2e-flows.md` B6 heading → `### B6. Community post moderation · UI:both — covered by b06-community-moderation.spec.ts`; first paragraph: every type is moderated through `/admin/community/posts`; add one sentence for each new test. Update `Docs/test-inventory.txt` line 1740 to the new file name and count (9 tests).

- [ ] **Step 4: Typecheck + run (E2E only if the stack is up)**

Run: `pnpm --filter=@nanny-app/admin typecheck` → PASS.
If available: `pnpm test:env`, `pnpm --filter=@nanny-app/backend start:test`, then `pnpm --filter=@nanny-app/admin test:e2e -- b06 a12` → PASS. Otherwise record in the commit body that E2E was not run locally.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/e2e Docs/testing/e2e-flows.md Docs/test-inventory.txt
git commit -m "test(admin-e2e): community moderation covers questions and events" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Mobile — "My posts" for every type

**Files:**
- Modify: `apps/mobile/src/hooks/useCommunity.ts:89-111` (`useMyListings` → `useMyPosts`, no type filter, key `'my-posts'`)
- Modify: `apps/mobile/src/lib/communityUtils.ts:124-131` (`'my-listings'` → `'my-posts'`)
- Create: `apps/mobile/src/screens/parent/MyPostsScreen.tsx` + `styles/my-posts-screen.styles.ts` (delete the `MyListings*` pair)
- Create: `apps/mobile/app/(parent)/my-posts.tsx` (delete `my-listings.tsx`)
- Modify: `apps/mobile/src/screens/parent/CommunityScreen.tsx:108-121`, `CommunityFeedScreen.tsx:144-157`, their style files (`myListingsLink/Text` → `myPostsLink/Text`, comment)
- Modify: `apps/mobile/src/screens/parent/CreatePostScreen.tsx:219, 231, 267-276`
- Modify: `apps/mobile/src/screens/parent/NotificationsScreen.tsx:82-96`
- Create: `apps/mobile/src/screens/parent/__tests__/MyPostsScreen.test.tsx` (delete `MyListingsScreen.test.tsx`)
- Create: `apps/mobile/src/__preview__/MyPostsPreview.tsx` (delete `MyListingsPreview.tsx`; same fixtures + one event + one Q&A; query key `['community', 'my-posts']`)
- Check `grep -rn "my-listings\|useMyListings\|MyListings" apps/mobile/src` returns nothing when done (the `PostCard.test`/`PostDetailScreen.test` only use `moderationStatus` and need no change).

- [ ] **Step 1: Write the failing screen test** (`MyPostsScreen.test.tsx` — same harness as the old file, importing `MyPostsScreen`)

```tsx
describe('MyPostsScreen', () => {
  it('shows the rejection reason and an edit-and-resubmit action', async () => {
    mockPosts([makePost({ moderationStatus: 'rejected', rejectionReason: 'Photos are too blurry' })]);
    const { getByText } = renderScreen();

    await waitFor(() => expect(getByText('Needs changes')).toBeTruthy());
    expect(getByText('Photos are too blurry')).toBeTruthy();
    fireEvent.press(getByText('Edit & resubmit'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(parent)/create-post',
        params: expect.objectContaining({ postId: '44', returnTo: 'my-posts' }),
      }),
    );
  });

  it('labels each type and shows an event’s date and place', async () => {
    mockPosts([
      makePost({ id: 45, type: 'event', title: 'Coffee morning', location: 'Maadi', eventStartsAt: '2026-10-01T09:00:00.000Z', price: null, moderationStatus: 'pending' }),
      makePost({ id: 46, type: 'qa', title: null, body: 'Where do I buy a pram?', price: null, moderationStatus: 'pending' }),
    ]);
    const { getByText, getAllByText } = renderScreen();

    await waitFor(() => expect(getByText('Coffee morning')).toBeTruthy());
    expect(getByText('Event')).toBeTruthy();
    expect(getByText(/Maadi/)).toBeTruthy();
    expect(getByText('Q&A')).toBeTruthy();
    expect(getByText('Where do I buy a pram?')).toBeTruthy();
    expect(getAllByText('Under review')).toHaveLength(2);
    expect(getAllByText('Edit post')).toHaveLength(2);
  });

  it('opens a live post in the feed it belongs to', async () => {
    mockPosts([makePost({ id: 45, type: 'event', title: 'Coffee morning', price: null })]);
    const { getByText } = renderScreen();

    await waitFor(() => expect(getByText('Live')).toBeTruthy());
    fireEvent.press(getByText('Coffee morning'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(parent)/post-detail',
        params: expect.objectContaining({ postId: '45', filter: 'Events' }),
      }),
    );
  });

  it('explains the empty state', async () => {
    mockPosts([]);
    const { getByText } = renderScreen();
    await waitFor(() => expect(getByText('Nothing posted yet')).toBeTruthy());
  });
});
```
(`makePost` = the old `makeListing`; `mockPosts` = the old `mockListings`.)

- [ ] **Step 2: Run — expect failure**

Run: `pnpm --filter=@nanny-app/mobile test -- MyPostsScreen` → FAIL (module missing).

- [ ] **Step 3: Hook + utils**

`useCommunity.ts`:
```ts
/**
 * The signed-in mother's own posts of every type, in every moderation state —
 * this is the only place a pending or rejected post is listed for her.
 */
export function useMyPosts() {
  return useInfiniteQuery<PostsPage>({
    queryKey: [COMMUNITY_KEY, 'my-posts'],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const params: MyPostsQuery = { page: pageParam as number, limit: 20 };
      const { items, meta } = await unwrapPaginated<CommunityPostResponse[], PaginationMeta>(
        api.get('/community/my-posts', { params }),
      );
      return { posts: items, meta };
    },
    getNextPageParam: (lastPage) =>
      lastPage.meta.page < lastPage.meta.totalPages ? lastPage.meta.page + 1 : undefined,
  });
}
```
Update the `useUpdatePost` doc comment: `/** Edit a post. Every post goes back to pending review on save. */`

`communityUtils.ts`: `CommunityReturnTo = 'community' | 'community-feed' | 'my-posts'`; `if (params.returnTo === 'my-posts') return { pathname: '/(parent)/my-posts' };`. Add:
```ts
/** The feed pill a post belongs under — for opening its detail from elsewhere. */
export function feedFilterForType(type: CommunityPostType): 'Q&A' | 'Marketplace' | 'Events' {
  switch (type) {
    case 'qa':
      return 'Q&A';
    case 'marketplace':
      return 'Marketplace';
    case 'event':
      return 'Events';
  }
}
```

- [ ] **Step 4: `MyPostsScreen.tsx`**

```tsx
import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { CommunityPostResponse } from '@nanny-app/shared';

import { Button, Card, ScreenContainer, StackHeader } from '@mobile/components/ui';
import { useMyPosts } from '@mobile/hooks/useCommunity';
import { useRefreshByUser } from '@mobile/hooks/useRefreshByUser';
import {
  feedFilterForType,
  formatEventDate,
  formatPrice,
  formatTimeAgo,
  getPostTypeLabel,
} from '@mobile/lib/communityUtils';
import { resolveImageUri } from '@mobile/lib/imageUri';
import { colors } from '@mobile/theme';
import { styles } from './styles/my-posts-screen.styles';

type StatusMeta = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  chipStyle: object;
  textStyle: object;
};

function statusMeta(post: CommunityPostResponse): StatusMeta {
  switch (post.moderationStatus) {
    case 'pending':
      return {
        label: 'Under review',
        icon: 'time-outline',
        color: colors.textTertiary,
        chipStyle: styles.chipPending,
        textStyle: styles.chipTextPending,
      };
    case 'rejected':
      return {
        label: 'Needs changes',
        icon: 'alert-circle',
        color: colors.error,
        chipStyle: styles.chipRejected,
        textStyle: styles.chipTextRejected,
      };
    default:
      return {
        label: 'Live',
        icon: 'checkmark-circle',
        color: colors.successDark,
        chipStyle: styles.chipLive,
        textStyle: styles.chipTextLive,
      };
  }
}

/** The one-line detail under the title: what the type is about. */
function detailLine(post: CommunityPostResponse): string | null {
  switch (post.type) {
    case 'marketplace':
      return formatPrice(post.price);
    case 'event':
      return [formatEventDate(post.eventStartsAt), post.location].filter(Boolean).join(' · ');
    default:
      return null;
  }
}

function editLabel(post: CommunityPostResponse): string {
  if (post.moderationStatus === 'rejected') return 'Edit & resubmit';
  return post.type === 'marketplace' ? 'Edit listing' : 'Edit post';
}

function PostRow({
  post,
  onEdit,
  onOpen,
}: {
  post: CommunityPostResponse;
  onEdit: () => void;
  onOpen: () => void;
}) {
  const meta = statusMeta(post);
  const detail = detailLine(post);
  const imageUri = post.imageUrls
    .map(resolveImageUri)
    .find((url): url is string => Boolean(url));

  return (
    <Card style={styles.postCard}>
      <Pressable style={styles.postHeader} onPress={onOpen}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.thumb} resizeMode="cover" />
        ) : (
          <View style={[styles.thumb, styles.thumbEmpty]}>
            <Ionicons name="image-outline" size={20} color={colors.textPlaceholder} />
          </View>
        )}
        <View style={styles.postBody}>
          <Text style={styles.typeLabel}>{getPostTypeLabel(post.type)}</Text>
          <Text style={styles.postTitle} numberOfLines={1}>
            {post.title ?? post.body}
          </Text>
          {detail && <Text style={styles.postDetail}>{detail}</Text>}
          <Text style={styles.postTime}>{formatTimeAgo(post.createdAt)}</Text>
        </View>
      </Pressable>

      <View style={[styles.chip, meta.chipStyle]}>
        <Ionicons name={meta.icon} size={14} color={meta.color} />
        <Text style={[styles.chipText, meta.textStyle]}>{meta.label}</Text>
      </View>

      {post.moderationStatus === 'rejected' && post.rejectionReason && (
        <Text style={styles.reason}>{post.rejectionReason}</Text>
      )}

      {post.moderationStatus !== 'approved' && (
        <Button
          variant={post.moderationStatus === 'rejected' ? 'primary' : 'outline'}
          onPress={onEdit}
          title={editLabel(post)}
        />
      )}
    </Card>
  );
}

/**
 * Everything the mother has posted — questions, events and listings — with
 * its review state. This is where a rejected post shows the admin's reason and
 * gets edited and resubmitted.
 */
export default function MyPostsScreen() {
  const router = useRouter();
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useMyPosts();
  const { isRefreshingByUser, refreshByUser } = useRefreshByUser(refetch);

  const posts = useMemo(() => data?.pages.flatMap((page) => page.posts) ?? [], [data]);

  const openEdit = (postId: number) =>
    router.push({
      pathname: '/(parent)/create-post',
      params: { postId: String(postId), returnTo: 'my-posts' },
    } as never);

  const openDetail = (post: CommunityPostResponse) =>
    router.push({
      pathname: '/(parent)/post-detail',
      params: { postId: String(post.id), returnTo: 'community', filter: feedFilterForType(post.type) },
    } as never);

  return (
    <ScreenContainer useSafeArea={false}>
      <StackHeader title="My posts" subtitle="New and edited posts are reviewed before they go live." />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshingByUser} onRefresh={refreshByUser} tintColor={colors.primary} />
        }
      >
        {isLoading && (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}

        {isError && <Text style={styles.errorText}>Couldn’t load your posts. Pull to refresh.</Text>}

        {!isLoading && !isError && posts.length === 0 && (
          <Card style={styles.emptyCard}>
            <Ionicons name="albums-outline" size={26} color={colors.textPlaceholder} />
            <Text style={styles.emptyTitle}>Nothing posted yet</Text>
            <Text style={styles.emptyBody}>
              Ask a question, host an event or sell something and it will show up here while it’s
              reviewed.
            </Text>
          </Card>
        )}

        {posts.map((post) => (
          <PostRow key={post.id} post={post} onEdit={() => openEdit(post.id)} onOpen={() => openDetail(post)} />
        ))}

        {hasNextPage && (
          <Pressable style={styles.loadMore} onPress={() => fetchNextPage()} disabled={isFetchingNextPage}>
            <Text style={styles.loadMoreText}>{isFetchingNextPage ? 'Loading…' : 'Load more'}</Text>
          </Pressable>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
```

`styles/my-posts-screen.styles.ts`: copy `my-listings-screen.styles.ts`, rename `listingCard/Header/Body/Title/Price/Time` → `postCard/postHeader/postBody/postTitle/postDetail/postTime`, and add:
```ts
  typeLabel: {
    ...typeScale.caption,
    fontWeight: '700',
    color: colors.primaryDark,
    textTransform: 'uppercase',
  },
```
(`postDetail` keeps the old `listingPrice` style.)

`app/(parent)/my-posts.tsx`:
```tsx
import MyPostsScreen from '@mobile/screens/parent/MyPostsScreen';

export default MyPostsScreen;
```

- [ ] **Step 5: Shortcuts, create screen, notifications**

`CommunityScreen.tsx` + `CommunityFeedScreen.tsx`: drop the `activeFilter === 'Marketplace' &&` guard; comment → `{/* Every post is reviewed before it goes live, so an author needs somewhere to track hers — and to fix a rejected one. */}`; `router.push('/(parent)/my-posts' as never)`; gate copy `'Create your free account to post in the community.'`; icon `albums-outline`; label `My posts`; style names `myPostsLink` / `myPostsText` (rename in both `.styles.ts` files and fix the "(Marketplace filter only)" comments).

`CreatePostScreen.tsx`:
- Line 219: header `editingId ? (postType === 'Marketplace' ? 'Edit listing' : 'Edit post') : 'Create post'` — unchanged.
- Line 231: `{editingId ? 'Resubmit' : 'Post'}`.
- Lines 267–276: show the notice for every type:
```tsx
        <View style={styles.reviewNotice}>
          <Ionicons name="shield-checkmark-outline" size={16} color={colors.textTertiary} />
          <Text style={styles.reviewNoticeText}>{reviewNotice(postType, Boolean(editingId))}</Text>
        </View>
```
  with, above the component:
```ts
/** Type-specific so the marketplace line stays exactly what the E2E flow asserts. */
function reviewNotice(type: CreatePostUiType, editing: boolean): string {
  const noun = type === 'Marketplace' ? 'listing' : type === 'Event' ? 'event' : 'post';
  if (editing) return `Saving sends this ${noun} back for review before it goes live again.`;
  if (type === 'Marketplace') {
    return 'Listings are reviewed by our team before they appear in the marketplace.';
  }
  return `${type === 'Event' ? 'Events' : 'Posts'} are reviewed by our team before they appear in the community.`;
}
```

`NotificationsScreen.tsx` lines 82–96 become:
```tsx
    // A rejected post needs fixing, so send her to My posts; an approved one
    // is live, so open it. The notification doesn't carry the post's type, so
    // the detail screen returns to the community's default pill.
    if (notification.referenceType === 'community_post' && notification.referenceId) {
      if (notification.type === 'marketplace_listing_rejected') {
        router.push('/(parent)/my-posts' as never);
      } else {
        router.push({
          pathname: '/(parent)/post-detail',
          params: { postId: notification.referenceId, returnTo: 'community' },
        });
      }
      return;
    }
```
(`getCommunityReturnHref` already tolerates a missing `filter` — its spread is conditional. No existing mobile test asserts the old `my-listings` path apart from `MyListingsScreen.test.tsx`, which this task replaces.)

- [ ] **Step 6: Verify**

Run: `pnpm --filter=@nanny-app/mobile test -- MyPostsScreen CreatePostScreen Notifications Community` → PASS.
Run: `pnpm --filter=@nanny-app/mobile typecheck` → PASS.
Run: `grep -rn "my-listings\|MyListings\|useMyListings" apps/mobile/src apps/mobile/app` → no output.
Optional visual: `COMPONENT=src/__preview__/MyPostsPreview.tsx pnpm --filter=@nanny-app/mobile preview:web` then serve on a high port and screenshot per the mobile CLAUDE.md workflow.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src apps/mobile/app
git commit -m "feat(mobile): My posts tracks every post through review" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Mobile E2E flows + advance script

**Files:**
- Modify: `apps/mobile/e2e/flows/c05-community.yaml`
- Modify: `apps/mobile/e2e/flows/c08-notification-centre.yaml:55` (`'My listings'` → `'My posts'`)
- Modify: `apps/mobile/e2e/flows/_shot-c-community.yaml:52` (`'My listings'` → `'My posts'`)
- Modify: `apps/mobile/e2e/scripts/advance.js:259-283, 321-350, 489-515`

- [ ] **Step 1: `advance.js`**
  - `seedListingNotifications`: URLs → `/admin/community/posts/${id}/approve|reject`.
  - Line ~514 (the marketplace conversation seeder): `/admin/community/posts/${listingId}/approve`.
  - Add an `adminApproveEvent` step and register it as `'admin-approve-event'`:
  ```js
  /**
   * Publishes the event the flow just proposed on screen. Every post now waits
   * for review, and a second mother cannot RSVP to — or even see — an event
   * that is still pending; approving it is what makes the capacity check about
   * capacity rather than about visibility.
   */
  function adminApproveEvent() {
    var motherToken = signIn(MOTHER_EMAIL);
    var events = call('GET', motherToken, '/community/my-posts?type=event&limit=50');
    if (!events || events.length === 0) throw new Error('The mother has no event posts.');
    var adminToken = signIn(ADMIN_EMAIL, ADMIN_PASSWORD);
    call('POST', adminToken, '/admin/community/posts/' + events[0].id + '/approve');
    output.eventId = String(events[0].id);
  }
  ```
  - `eventAtCapacity`: unchanged (it reads the newest event and RSVPs as the second mother).

- [ ] **Step 2: `c05-community.yaml`**
  - Header comment: every post is moderated; the author still sees her own pending post in the feed (with an "Under review" chip), which is why the on-screen create → appear → like → comment loop still works without an admin; the event is approved over HTTP before the second mother is turned away by capacity.
  - After the Q&A post appears (line 72–74) add `- assertVisible: 'Under review'` and change the comment on lines 70–71.
  - Before `# ── The ceiling` insert:
  ```yaml
  # Approved over HTTP: a pending event is invisible to anybody but its author,
  # so the second mother would be told "not found", not "full".
  - runScript:
      file: ../scripts/advance.js
      env:
        ADVANCE: admin-approve-event
  ```
  - Lines 200, 240, 242: `'My listings'` → `'My posts'`. Line 236 comment: "it is on My posts".
  - Line 210 stays (marketplace copy unchanged).

- [ ] **Step 3: Run if the lab is available** (see `apps/mobile/e2e/README.md` and the `mobile-e2e-lab` skill): `pnpm test:e2e:mobile -- c05 c08`. Otherwise note in the commit body that the device tier was not run.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/e2e
git commit -m "test(mobile-e2e): every post waits for review in the community flow" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Whole-repo verification

- [ ] `pnpm typecheck` (repo root, all packages) → PASS.
- [ ] `pnpm test:unit` (root) → PASS (shared, backend unit, admin, mobile).
- [ ] If the stack is available: `pnpm test:env` → `pnpm --filter=@nanny-app/backend test:integration` (the community/marketplace journeys, if any, must still pass) → `pnpm --filter=@nanny-app/admin test:e2e -- b06 a12`.
- [ ] `grep -rn "AdminMarketplaceListing\|RejectListingSchema\|listMarketplaceListings\|approveListing\|rejectListing\|/admin/marketplace/listings/[^']*approve" apps packages Docs --include=*.ts --include=*.tsx --include=*.js --include=*.md` → only historical spec/plan docs may match.
- [ ] Update `.claude/CLAUDE.md`? No — nothing there describes moderation. `apps/backend/CLAUDE.md` route list is generic; no change.
- [ ] Final commit if anything was touched during verification.

## Verification summary (what "done" looks like)

1. Backend unit: `community.service` creates QA/EVENT/MARKETPLACE as `PENDING`, re-reviews any edit, RSVP on another member's pending event → 404; `admin-community.service` lists/approves/rejects across types with type-aware notification copy; `admin-permissions.test` green with the new routes.
2. Admin: `/community` renders the Type + Status filters, Q&A rows identified by their question, event rows show date + place, Approve/Reject/Take down hit `/admin/community/posts/...`; sidebar says "Community"; `post-table.test.tsx` green; b06 E2E green when run.
3. Mobile: "My posts" lists every type with the right chip/detail, edit → `returnTo: 'my-posts'`, rejected → "Edit & resubmit"; Create post shows the review notice for every type; rejected-notification tap opens My posts; c05/c08 flows updated.
4. No Prisma migration in the diff; `pnpm --filter=@nanny-app/backend exec prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma` (needs a shadow DB) reports no change — or simply confirm `git status prisma/migrations` is clean.
