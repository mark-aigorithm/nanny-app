# Admin Official Posts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins publish official events, Q&A and listings from a "New post ▾" menu on the Community page, and edit or delete official posts of any type.

**Architecture:**
- **Shared:** `packages/shared` gains a `type`-tagged `CreateOfficialPostSchema` and a flat `UpdateOfficialPostSchema`.
- **Backend:** `admin-marketplace.service.ts` becomes `admin-official-post.service.ts`, which handles all three types. Three routes under `/admin/community/official-posts` replace `/admin/marketplace/listings`.
- **Admin:** the listing form becomes a type-driven `OfficialPostFormModal`. The table offers Edit and Delete for any official post, and the page header holds the New post menu.

**Tech Stack:**
- Zod in `packages/shared`, tested with Vitest.
- Express, Prisma and Jest in `apps/backend`: the `unit` project; there's no DB locally.
- React 19, TanStack Query, Vitest and MSW in `apps/admin`, plus Playwright for E2E. E2E needs the test stack, so it's typechecked here, not run.

**Spec:** `Docs/superpowers/specs/2026-09-28-admin-official-posts-design.md`

## Global Constraints

- **Branch:** `feat/admin-official-posts`. Check with `git branch --show-current` before the first commit.
- **Windows:** keep on-disk file casing, and edit through the exact-cased path. `apps/admin/src/app.tsx` and the `components/ui/*.tsx` files are lowercase.
- **Git:** add files by name, never `git add -A` or `git add .`. End every commit message with a blank line and then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Backend Jest:** run `npx jest --selectProjects unit --runTestsByPath <file>` from `apps/backend`. A bare path runs every suite.
- **TypeScript:** strict, with no `any`. Use `import type` for types.
- **Admin styling:**
  - Use tokens only; never write a raw hex.
  - Reuse `@admin/components/ui`.
  - No `window.confirm` or `window.prompt`.
- **Wall-clock:** event date and time travel as platform **wall-clock** (`YYYY-MM-DDTHH:mm:ss`, Africa/Cairo, no offset), validated by `wallClockField` and converted to UTC on the backend with `wallClockToUtc`. This is the same contract as the booking editor.
- **Copy:**
  - Menu items: `Event`, `Q&A`, `Listing`.
  - Header subtitle: "Review what mothers post before it reaches the feed, and post events, Q&A and listings as NannyNow."
  - 400 for a field of another type: "That field doesn't apply to this kind of post."
  - 404: "Post not found."

---

### Task 1: Shared schemas

**Files:**
- Modify: `packages/shared/src/admin.ts`. Add the new schemas right after `UpdateOfficialListingSchema` (around line 1056). Leave the old listing schemas in place; Task 3 removes them.
- Create: `packages/shared/src/__tests__/official-post.test.ts`
- Modify: `Docs/superpowers/specs/2026-09-28-admin-official-posts-design.md` (event row: the ISO datetime becomes wall-clock)

**Interfaces:**
- Produces:
  - `CreateOfficialPostSchema` / `type CreateOfficialPostInput`: a discriminated union on `type`: `'marketplace' | 'event' | 'qa'`.
  - `UpdateOfficialPostSchema` / `type UpdateOfficialPostInput`: flat and all optional.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/__tests__/official-post.test.ts
import { describe, expect, it } from 'vitest';

import { CreateOfficialPostSchema, UpdateOfficialPostSchema } from '../admin';

describe('CreateOfficialPostSchema', () => {
  it('accepts an event with wall-clock time and no photos, defaulting tags', () => {
    const parsed = CreateOfficialPostSchema.parse({
      type: 'event',
      title: 'Mommy & me picnic',
      eventStartsAt: '2026-10-10T11:00:00',
      location: 'Merryland Park',
    });
    expect(parsed).toEqual({
      type: 'event',
      title: 'Mommy & me picnic',
      eventStartsAt: '2026-10-10T11:00:00',
      location: 'Merryland Park',
      imageUrls: [],
      tags: [],
    });
  });

  it('refuses an event time carrying an offset', () => {
    const result = CreateOfficialPostSchema.safeParse({
      type: 'event',
      title: 'Picnic',
      eventStartsAt: '2026-10-10T11:00:00Z',
      location: 'Park',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a Q&A with only a body', () => {
    const parsed = CreateOfficialPostSchema.parse({ type: 'qa', body: 'Summer hours start Sunday.' });
    expect(parsed).toMatchObject({ type: 'qa', body: 'Summer hours start Sunday.', imageUrls: [] });
  });

  it('refuses a Q&A with an empty body', () => {
    expect(CreateOfficialPostSchema.safeParse({ type: 'qa', body: '   ' }).success).toBe(false);
  });

  it('keeps the listing rules: a photo and a contact phone are required', () => {
    const base = { type: 'marketplace', title: 'Car seat', price: 3500, contactPhone: '+201001234567' };
    expect(CreateOfficialPostSchema.safeParse({ ...base, imageUrls: [] }).success).toBe(false);
    expect(
      CreateOfficialPostSchema.safeParse({ ...base, imageUrls: ['https://cdn.example.com/a.jpg'] })
        .success,
    ).toBe(true);
  });
});

describe('UpdateOfficialPostSchema', () => {
  it('lets an event clear its price and attendee cap', () => {
    expect(UpdateOfficialPostSchema.parse({ price: null, maxAttendees: null })).toEqual({
      price: null,
      maxAttendees: null,
    });
  });

  it('checks the event time is wall-clock', () => {
    expect(UpdateOfficialPostSchema.safeParse({ eventStartsAt: '2026-10-10T11:00' }).success).toBe(
      false,
    );
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd packages/shared && npx vitest run src/__tests__/official-post.test.ts`
Expected: FAIL, because `CreateOfficialPostSchema` isn't exported.

- [ ] **Step 3: Implement**

Insert this into `packages/shared/src/admin.ts` directly after the `export type UpdateOfficialListingInput = …` line. `wallClockField`, `CommunityTagSchema` and `PhoneNumberSchema` are already imported in this file.

```ts
// ── Official posts (events, Q&A and listings published as NannyNow) ──

const officialTags = z.array(CommunityTagSchema).max(5, 'At most 5 tags allowed').default([]);
const officialPhotos = z.array(z.string().url()).max(4).default([]);

/**
 * An official post, published by an admin and live at once. The fields mirror
 * what a mother fills in for the same type (`CreateCommunityPostSchema`), plus a
 * contact phone on listings. An event's start is platform wall-clock, like
 * every other time the console sends; the backend converts it to UTC.
 */
export const CreateOfficialPostSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('marketplace'),
    title: z.string().trim().min(1, 'Product name is required').max(200),
    body: z.string().trim().max(2000).optional(),
    price: z.number().positive('Price must be greater than 0'),
    imageUrls: z.array(z.string().url()).min(1, 'At least one image is required').max(4),
    tags: officialTags,
    contactPhone: PhoneNumberSchema,
  }),
  z.object({
    type: z.literal('event'),
    title: z.string().trim().min(1, 'Event name is required').max(200),
    body: z.string().trim().max(2000).optional(),
    eventStartsAt: wallClockField('Event date and time'),
    location: z.string().trim().min(1, 'Location is required').max(500),
    price: z.number().nonnegative().optional(),
    maxAttendees: z.number().int().positive().optional(),
    imageUrls: officialPhotos,
    tags: officialTags,
  }),
  z.object({
    type: z.literal('qa'),
    title: z.string().trim().max(200).optional(),
    body: z.string().trim().min(1, 'Body is required').max(2000),
    imageUrls: officialPhotos,
    tags: officialTags,
  }),
]);
export type CreateOfficialPostInput = z.infer<typeof CreateOfficialPostSchema>;

/**
 * An edit to an official post. A post never changes type, so this is flat; the
 * service refuses fields that don't belong to the stored type and keeps each
 * type's required fields. `null` clears: a Q&A title, a description, an event's
 * price (free again) or its attendee cap.
 */
export const UpdateOfficialPostSchema = z.object({
  title: z.string().trim().min(1).max(200).nullable().optional(),
  body: z.string().trim().min(1).max(2000).nullable().optional(),
  imageUrls: z.array(z.string().url()).max(4).optional(),
  tags: z.array(CommunityTagSchema).max(5, 'At most 5 tags allowed').optional(),
  price: z.number().nonnegative().nullable().optional(),
  contactPhone: PhoneNumberSchema.optional(),
  eventStartsAt: wallClockField('Event date and time').optional(),
  location: z.string().trim().min(1).max(500).optional(),
  maxAttendees: z.number().int().positive().nullable().optional(),
});
export type UpdateOfficialPostInput = z.infer<typeof UpdateOfficialPostSchema>;
```

In the spec's schema table, change the `event` row's `eventStartsAt` from "(ISO datetime)" to "(platform wall-clock `YYYY-MM-DDTHH:mm:ss`, converted to UTC by the backend)".

- [ ] **Step 4: Run it and watch it pass**

Run: `cd packages/shared && npx vitest run src/__tests__/official-post.test.ts && npx tsc --noEmit -p tsconfig.json`
Expected: all 7 tests PASS, and tsc prints nothing.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/admin.ts packages/shared/src/__tests__/official-post.test.ts Docs/superpowers/specs/2026-09-28-admin-official-posts-design.md
git commit -m "Shared: official post schemas for events, Q&A and listings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Backend service, routes and permissions

**Files:**
- Rename: `apps/backend/src/services/admin-marketplace.service.ts` → `apps/backend/src/services/admin-official-post.service.ts` (`git mv`, then replace the contents)
- Rename: `apps/backend/src/__tests__/admin-marketplace.service.test.ts` → `apps/backend/src/__tests__/admin-official-post.service.test.ts` (`git mv`, then replace the contents)
- Modify: `apps/backend/src/routes/admin.routes.ts`:
  - imports: lines ~25, ~53 and ~106–111
  - the "Official marketplace listings" block (~637–675)
- Modify: `apps/backend/src/lib/admin-permissions.ts:112-114`
- Modify: `apps/backend/src/__tests__/admin-permissions.test.ts:126`
- Modify: `Docs/test-inventory.txt:111-113` (the entry names)

**Interfaces:**
- Consumes:
  - `CreateOfficialPostSchema`, `UpdateOfficialPostSchema` and their input types (Task 1).
  - From `admin-community.service`: `communityPostInclude`, `resolveAdminId(uid): Promise<number>`, `toAdminCommunityPost(row): AdminCommunityPost` and `type CommunityPostRow`.
  - `wallClockToUtc(wall: string): Date`, from `@backend/lib/platform-time`.
- Produces:
  - HTTP: `POST /admin/community/official-posts`, `PATCH /admin/community/official-posts/:id` and `DELETE /admin/community/official-posts/:id`. POST and PATCH return `AdminCommunityPost`; DELETE returns `{ deleted: true }`.
  - Service functions:
    - `createOfficialPost(input, adminUid)`
    - `updateOfficialPost(id, input)`
    - `deleteOfficialPost(id)`

- [ ] **Step 1: Move the files and write the failing tests**

```bash
cd apps/backend
git mv src/services/admin-marketplace.service.ts src/services/admin-official-post.service.ts
git mv src/__tests__/admin-marketplace.service.test.ts src/__tests__/admin-official-post.service.test.ts
```

Replace the test file's contents with:

```ts
import { CommunityPostType, PostModerationStatus } from '@prisma/client';

import { AppError } from '@backend/lib/errors';

jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: { findFirst: jest.fn() },
    communityPost: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    comment: { updateMany: jest.fn() },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}));

// admin-community.service (imported for the shared row mapping) pulls this in.
jest.mock('@backend/services/notification.service', () => ({
  createInAppNotification: jest.fn(),
  dispatchPush: jest.fn(),
}));

import { prisma } from '@backend/db/prisma';
import { createInAppNotification } from '@backend/services/notification.service';
import {
  createOfficialPost,
  deleteOfficialPost,
  updateOfficialPost,
} from '@backend/services/admin-official-post.service';

const mockPrisma = prisma as unknown as {
  user: { findFirst: jest.Mock };
  communityPost: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  comment: { updateMany: jest.Mock };
  $transaction: jest.Mock;
};

const mockNotify = createInAppNotification as jest.Mock;

const ADMIN_UID = 'firebase-admin';
const ADMIN_ID = 3;

const seller = { id: 29, firstName: 'Jane', lastName: 'Doe', avatarUrl: null };

function makePost(overrides: Record<string, unknown> = {}) {
  return {
    id: 44,
    authorId: seller.id,
    type: CommunityPostType.MARKETPLACE,
    title: 'Stroller',
    body: 'Barely used',
    price: 1200,
    imageUrls: ['https://cdn.example.com/stroller.jpg'],
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
    author: seller,
    ...overrides,
  };
}

/** An official post of `type`, as the admin created it. */
function official(type: CommunityPostType, overrides: Record<string, unknown> = {}) {
  return makePost({
    type,
    authorId: ADMIN_ID,
    isOfficial: true,
    moderationStatus: PostModerationStatus.APPROVED,
    ...overrides,
  });
}

/** The `data` the service handed to prisma.communityPost.create. */
function createdData(): Record<string, unknown> {
  return (mockPrisma.communityPost.create.mock.calls[0]?.[0] as { data: Record<string, unknown> })
    .data;
}

/** The `data` the service handed to prisma.communityPost.update. */
function updatedData(): Record<string, unknown> {
  return (mockPrisma.communityPost.update.mock.calls[0]?.[0] as { data: Record<string, unknown> })
    .data;
}

const badRequest = expect.objectContaining<Partial<AppError>>({ statusCode: 400 });

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.user.findFirst.mockResolvedValue({ id: ADMIN_ID });
  mockPrisma.$transaction.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));
});

describe('createOfficialPost', () => {
  it('publishes a live, official listing with a normalised contact phone', async () => {
    mockPrisma.communityPost.create.mockResolvedValue(official(CommunityPostType.MARKETPLACE));

    const result = await createOfficialPost(
      {
        type: 'marketplace',
        title: 'Convertible car seat',
        price: 3500,
        imageUrls: ['https://cdn.example.com/seat.jpg'],
        tags: [],
        // Deliberately unformatted — the service normalises before storing.
        contactPhone: '+20 (100) 123.4567',
      },
      ADMIN_UID,
    );

    expect(createdData()).toMatchObject({
      authorId: ADMIN_ID,
      type: CommunityPostType.MARKETPLACE,
      isOfficial: true,
      moderationStatus: PostModerationStatus.APPROVED,
      reviewedById: ADMIN_ID,
      contactPhone: '+201001234567',
    });
    expect(result.isOfficial).toBe(true);
    // The admin is the author — nobody to notify.
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('publishes an event, converting Cairo wall-clock to UTC and leaving it free', async () => {
    mockPrisma.communityPost.create.mockResolvedValue(official(CommunityPostType.EVENT));

    await createOfficialPost(
      {
        type: 'event',
        title: 'Mommy & me picnic',
        eventStartsAt: '2026-01-15T18:00:00',
        location: 'Merryland Park',
        imageUrls: [],
        tags: [],
      },
      ADMIN_UID,
    );

    const data = createdData();
    expect(data).toMatchObject({
      type: CommunityPostType.EVENT,
      title: 'Mommy & me picnic',
      location: 'Merryland Park',
      isOfficial: true,
      moderationStatus: PostModerationStatus.APPROVED,
      price: null,
      maxAttendees: null,
    });
    // Cairo is UTC+2 in January.
    expect(data['eventStartsAt']).toEqual(new Date('2026-01-15T16:00:00.000Z'));
    expect(data['contactPhone']).toBeUndefined();
  });

  it('publishes a Q&A with no title', async () => {
    mockPrisma.communityPost.create.mockResolvedValue(official(CommunityPostType.QA));

    await createOfficialPost(
      { type: 'qa', body: 'Summer hours start Sunday.', imageUrls: [], tags: [] },
      ADMIN_UID,
    );

    expect(createdData()).toMatchObject({
      type: CommunityPostType.QA,
      title: null,
      body: 'Summer hours start Sunday.',
      isOfficial: true,
    });
    expect(createdData()['contactPhone']).toBeUndefined();
  });
});

describe('updateOfficialPost', () => {
  it('refuses a field that belongs to another type', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(official(CommunityPostType.MARKETPLACE));
    await expect(updateOfficialPost(44, { location: 'Park' })).rejects.toEqual(badRequest);

    mockPrisma.communityPost.findFirst.mockResolvedValue(official(CommunityPostType.EVENT));
    await expect(updateOfficialPost(44, { contactPhone: '+201001234567' })).rejects.toEqual(
      badRequest,
    );

    mockPrisma.communityPost.findFirst.mockResolvedValue(official(CommunityPostType.QA));
    await expect(updateOfficialPost(44, { price: 50 })).rejects.toEqual(badRequest);

    expect(mockPrisma.communityPost.update).not.toHaveBeenCalled();
  });

  it('keeps a listing priced and pictured', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(official(CommunityPostType.MARKETPLACE));
    await expect(updateOfficialPost(44, { price: 0 })).rejects.toEqual(badRequest);
    await expect(updateOfficialPost(44, { price: null })).rejects.toEqual(badRequest);
    await expect(updateOfficialPost(44, { imageUrls: [] })).rejects.toEqual(badRequest);
    await expect(updateOfficialPost(44, { title: null })).rejects.toEqual(badRequest);
  });

  it('keeps a Q&A body and an event name', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(official(CommunityPostType.QA));
    await expect(updateOfficialPost(44, { body: null })).rejects.toEqual(badRequest);

    mockPrisma.communityPost.findFirst.mockResolvedValue(official(CommunityPostType.EVENT));
    await expect(updateOfficialPost(44, { title: null })).rejects.toEqual(badRequest);
  });

  it('makes an event free and uncapped again, and moves its time', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(
      official(CommunityPostType.EVENT, { price: 100, maxAttendees: 20 }),
    );
    mockPrisma.communityPost.update.mockResolvedValue(official(CommunityPostType.EVENT));

    await updateOfficialPost(44, {
      price: null,
      maxAttendees: null,
      eventStartsAt: '2026-01-20T10:30:00',
    });

    expect(updatedData()).toEqual({
      price: null,
      maxAttendees: null,
      eventStartsAt: new Date('2026-01-20T08:30:00.000Z'),
    });
  });

  it('refuses to edit a member’s post', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(makePost());
    await expect(updateOfficialPost(44, { title: 'Changed' })).rejects.toEqual(badRequest);
  });

  it('answers 404 for a missing post', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(null);
    await expect(updateOfficialPost(44, { title: 'Changed' })).rejects.toEqual(
      expect.objectContaining<Partial<AppError>>({ statusCode: 404 }),
    );
  });
});

describe('deleteOfficialPost', () => {
  it('soft-deletes an official event and its comments', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(official(CommunityPostType.EVENT));

    await deleteOfficialPost(44);

    expect(mockPrisma.communityPost.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { deletedAt: expect.any(Date) } }),
    );
    expect(mockPrisma.comment.updateMany).toHaveBeenCalled();
  });

  it('refuses to delete a member’s post', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(makePost());
    await expect(deleteOfficialPost(44)).rejects.toEqual(badRequest);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/backend && npx jest --selectProjects unit --runTestsByPath src/__tests__/admin-official-post.service.test.ts`
Expected: FAIL, because `createOfficialPost` isn't exported.

- [ ] **Step 3: Implement the service**

Replace the contents of `apps/backend/src/services/admin-official-post.service.ts` with:

```ts
import { CommunityPostType, PostModerationStatus, Prisma } from '@prisma/client';

import {
  normalizePhone,
  type AdminCommunityPost,
  type CreateOfficialPostInput,
  type UpdateOfficialPostInput,
} from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import { wallClockToUtc } from '@backend/lib/platform-time';
import {
  communityPostInclude,
  resolveAdminId,
  toAdminCommunityPost,
  type CommunityPostRow,
} from '@backend/services/admin-community.service';

// Official posts: events, Q&A and listings published as NannyNow. They skip
// review and can be edited or deleted only here. Moderating members' posts
// lives in admin-community.service.

/** Fields each type refuses on an edit; everything else is shared. */
const FOREIGN_FIELDS: Record<CommunityPostType, (keyof UpdateOfficialPostInput)[]> = {
  [CommunityPostType.MARKETPLACE]: ['eventStartsAt', 'location', 'maxAttendees'],
  [CommunityPostType.EVENT]: ['contactPhone'],
  [CommunityPostType.QA]: ['contactPhone', 'eventStartsAt', 'location', 'maxAttendees', 'price'],
};

async function loadPost(id: number): Promise<CommunityPostRow> {
  const post = await prisma.communityPost.findFirst({
    where: { id, deletedAt: null },
    include: communityPostInclude,
  });
  if (!post) throw errors.notFound('Post not found.');
  return post;
}

type TypedCreateFields = Pick<
  Prisma.CommunityPostUncheckedCreateInput,
  'type' | 'title' | 'price' | 'contactPhone' | 'eventStartsAt' | 'location' | 'maxAttendees'
>;

function typedCreateFields(input: CreateOfficialPostInput): TypedCreateFields {
  switch (input.type) {
    case 'marketplace':
      return {
        type: CommunityPostType.MARKETPLACE,
        title: input.title,
        price: new Prisma.Decimal(input.price),
        contactPhone: normalizePhone(input.contactPhone),
      };
    case 'event':
      return {
        type: CommunityPostType.EVENT,
        title: input.title,
        eventStartsAt: wallClockToUtc(input.eventStartsAt),
        location: input.location,
        price: input.price !== undefined ? new Prisma.Decimal(input.price) : null,
        maxAttendees: input.maxAttendees ?? null,
      };
    case 'qa':
      return { type: CommunityPostType.QA, title: input.title ?? null };
  }
}

/**
 * Publish an official post, authored by the acting admin and approved on
 * creation. A listing is pinned above seller listings in the marketplace feed;
 * an event or Q&A sits in its feed by date like any post, badged Official.
 */
export async function createOfficialPost(
  input: CreateOfficialPostInput,
  adminFirebaseUid: string,
): Promise<AdminCommunityPost> {
  const adminId = await resolveAdminId(adminFirebaseUid);

  const data: Prisma.CommunityPostUncheckedCreateInput = {
    ...typedCreateFields(input),
    authorId: adminId,
    body: input.body ?? null,
    imageUrls: input.imageUrls,
    tags: input.tags,
    isOfficial: true,
    moderationStatus: PostModerationStatus.APPROVED,
    reviewedAt: new Date(),
    reviewedById: adminId,
  };

  const created = await prisma.communityPost.create({ data, include: communityPostInclude });
  return toAdminCommunityPost(created);
}

/** The fields each type can't do without, checked against an edit. */
function assertStillComplete(type: CommunityPostType, input: UpdateOfficialPostInput): void {
  if (type === CommunityPostType.MARKETPLACE) {
    if (input.title === null) throw errors.badRequest('A listing needs a product name.');
    if (input.price !== undefined && (input.price === null || input.price <= 0)) {
      throw errors.badRequest('Price must be greater than 0.');
    }
    if (input.imageUrls !== undefined && input.imageUrls.length === 0) {
      throw errors.badRequest('At least one image is required.');
    }
  }
  if (type === CommunityPostType.EVENT && input.title === null) {
    throw errors.badRequest('An event needs a name.');
  }
  if (type === CommunityPostType.QA && input.body === null) {
    throw errors.badRequest('A question needs a body.');
  }
}

/** Edit an official post. Never re-enters review — an admin authored it. */
export async function updateOfficialPost(
  id: number,
  input: UpdateOfficialPostInput,
): Promise<AdminCommunityPost> {
  const post = await loadPost(id);
  if (!post.isOfficial) throw errors.badRequest('Only official posts can be edited here.');
  if (FOREIGN_FIELDS[post.type].some((field) => input[field] !== undefined)) {
    throw errors.badRequest("That field doesn't apply to this kind of post.");
  }
  assertStillComplete(post.type, input);

  const data: Prisma.CommunityPostUncheckedUpdateInput = {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.body !== undefined ? { body: input.body } : {}),
    ...(input.imageUrls !== undefined ? { imageUrls: input.imageUrls } : {}),
    ...(input.tags !== undefined ? { tags: input.tags } : {}),
    ...(input.price !== undefined
      ? { price: input.price === null ? null : new Prisma.Decimal(input.price) }
      : {}),
    ...(input.contactPhone !== undefined
      ? { contactPhone: normalizePhone(input.contactPhone) }
      : {}),
    ...(input.eventStartsAt !== undefined
      ? { eventStartsAt: wallClockToUtc(input.eventStartsAt) }
      : {}),
    ...(input.location !== undefined ? { location: input.location } : {}),
    ...(input.maxAttendees !== undefined ? { maxAttendees: input.maxAttendees } : {}),
  };

  const updated = await prisma.communityPost.update({
    where: { id },
    data,
    include: communityPostInclude,
  });
  return toAdminCommunityPost(updated);
}

/** Soft-delete an official post and its comments (members remove their own in the app). */
export async function deleteOfficialPost(id: number): Promise<void> {
  const post = await loadPost(id);
  if (!post.isOfficial) {
    throw errors.badRequest('Only official posts can be deleted here. Reject it instead.');
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

Note the test for "makes an event free…" expects `updatedData()` to **equal** exactly `{ price: null, maxAttendees: null, eventStartsAt: Date }`. That's why every key is spread conditionally rather than set to `undefined`.

- [ ] **Step 4: Run it and watch it pass**

Run: `cd apps/backend && npx jest --selectProjects unit --runTestsByPath src/__tests__/admin-official-post.service.test.ts`
Expected: all 11 tests PASS.

- [ ] **Step 5: Routes and the permission table**

In `apps/backend/src/routes/admin.routes.ts`:

- In the `@nanny-app/shared` import list, replace `CreateOfficialListingSchema,` with `CreateOfficialPostSchema,` and `UpdateOfficialListingSchema,` with `UpdateOfficialPostSchema,`, keeping alphabetical order.
- Replace the `admin-marketplace.service` import with:

```ts
import {
  createOfficialPost,
  deleteOfficialPost,
  updateOfficialPost,
} from '@backend/services/admin-official-post.service';
```

- Replace the whole `// ── Official marketplace listings ──` block (three handlers) with:

```ts
// ── Official posts (events, Q&A, listings) ─────────────────────

adminRouter.post(
  '/community/official-posts',
  validateBody(CreateOfficialPostSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const post = await createOfficialPost(req.body, req.firebaseUser.uid);
      res.status(201).json(ok(post));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.patch(
  '/community/official-posts/:id',
  validateBody(UpdateOfficialPostSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await updateOfficialPost(routeIdParam(req.params.id), req.body)));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.delete(
  '/community/official-posts/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await deleteOfficialPost(routeIdParam(req.params.id));
      res.json(ok({ deleted: true }));
    } catch (err) {
      next(err);
    }
  },
);
```

In `apps/backend/src/lib/admin-permissions.ts`, replace the three `/marketplace/listings` rows with:

```ts
  { method: 'POST', pattern: '/community/official-posts', requires: section('marketplace', 'MANAGE') },
  {
    method: 'PATCH',
    pattern: '/community/official-posts/:id',
    requires: section('marketplace', 'MANAGE'),
  },
  {
    method: 'DELETE',
    pattern: '/community/official-posts/:id',
    requires: section('marketplace', 'MANAGE'),
  },
```

In `apps/backend/src/__tests__/admin-permissions.test.ts:126`, change `'/marketplace/listings'` to `'/community/official-posts'`.

In `Docs/test-inventory.txt`, rename the `createOfficialListing` and `updateOfficialListing / deleteOfficialListing` entries to `createOfficialPost` and `updateOfficialPost / deleteOfficialPost`, and update the file name if the inventory lists it.

- [ ] **Step 6: Verify the whole backend unit project and types**

Run: `cd apps/backend && npx tsc --noEmit -p tsconfig.json && npx jest --selectProjects unit`
Expected:
- tsc prints nothing.
- Every unit suite passes, including `admin-permissions.test.ts`, whose router walk fails if a route and its row disagree.
- `grep -rn "admin-marketplace.service\|marketplace/listings" apps/backend/src` prints nothing.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/services/admin-official-post.service.ts apps/backend/src/__tests__/admin-official-post.service.test.ts apps/backend/src/routes/admin.routes.ts apps/backend/src/lib/admin-permissions.ts apps/backend/src/__tests__/admin-permissions.test.ts Docs/test-inventory.txt
git commit -m "Backend: official events, Q&A and listings under /admin/community/official-posts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`git mv` already staged the deletions of the old paths.)

---

### Task 3: Admin form, table and API

**Files:**
- Create: `apps/admin/src/features/community/official-post-form.tsx`
- Delete: `apps/admin/src/features/marketplace/official-listing-form.tsx` (`git rm`; delete the folder if it ends up empty)
- Modify: `apps/admin/src/lib/api.ts:689-712` (the official listing functions) and its shared type imports (`CreateOfficialListingInput`, `UpdateOfficialListingInput`)
- Modify: `apps/admin/src/lib/format.ts` (add `toPlatformDateTimeInput`)
- Modify: `apps/admin/src/features/community/post-table.tsx`
- Modify: `apps/admin/src/pages/community-page.tsx` (only the import and the `OfficialListingFormModal` usage, so it compiles; Task 4 redesigns the header)
- Modify: `packages/shared/src/admin.ts` (remove `CreateOfficialListingSchema`, `UpdateOfficialListingSchema` and their types)
- Test: `apps/admin/src/features/community/__tests__/post-table.test.tsx`
- Test: `apps/admin/src/lib/__tests__/format.test.ts` (create, or add to it if it exists)

**Interfaces:**
- Consumes: the Task 1 schemas and types, and the Task 2 HTTP routes.
- Produces:
  - `OfficialPostFormModal({ type, post?, onClose })`, where `type: AdminCommunityPost['type']`.
  - In `lib/api.ts`:
    - `createOfficialPost(input: CreateOfficialPostInput): Promise<AdminCommunityPost>`
    - `updateOfficialPost(id: number, input: UpdateOfficialPostInput): Promise<AdminCommunityPost>`
    - `deleteOfficialPost(id: number): Promise<void>`
  - `toPlatformDateTimeInput(iso: string): string`, which returns `"YYYY-MM-DDTHH:mm"`.

- [ ] **Step 1: Write the failing tests**

In `apps/admin/src/features/community/__tests__/post-table.test.tsx`:

1. In the existing test `'edits an official listing in the shared modal, never reviewing it'`, change the handler path from `'/api/admin/marketplace/listings/:id'` to `'/api/admin/community/official-posts/:id'`. Nothing else in that test changes: the PATCH body and the "Listing updated" toast stay the same.
2. Add a fixture after `OFFICIAL`, and add these two tests to the `PostTable` describe:

```ts
const OFFICIAL_EVENT: AdminCommunityPost = {
  ...BASE,
  id: 52,
  type: 'event',
  title: 'Mommy & me picnic',
  body: null,
  price: 100,
  imageUrls: [],
  location: 'Merryland Park',
  // 09:00 UTC is 11:00 in Cairo in January.
  eventStartsAt: '2026-01-15T09:00:00.000Z',
  maxAttendees: 20,
  moderationStatus: 'approved',
  isOfficial: true,
};

it('edits an official event, making it free and uncapped', async () => {
  let body: unknown = null;
  server.use(
    http.patch('/api/admin/community/official-posts/:id', async ({ request }) => {
      body = await request.json();
      return ok({ ...OFFICIAL_EVENT, price: null, maxAttendees: null });
    }),
  );
  renderTable([OFFICIAL_EVENT]);

  await userEvent.click(
    await screen.findByRole('button', { name: 'Actions for Mommy & me picnic' }),
  );
  await userEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));

  const dialog = screen.getByRole('dialog', { name: 'Edit official event' });
  expect(within(dialog).getByLabelText('Date and time')).toHaveValue('2026-01-15T11:00');
  await userEvent.clear(within(dialog).getByLabelText(/Price \(EGP\)/));
  await userEvent.clear(within(dialog).getByLabelText(/Max attendees/));
  await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));

  await waitFor(() =>
    expect(body).toEqual({
      title: 'Mommy & me picnic',
      body: null,
      eventStartsAt: '2026-01-15T11:00:00',
      location: 'Merryland Park',
      price: null,
      maxAttendees: null,
      imageUrls: [],
      tags: [],
    }),
  );
  expect(await screen.findByText('Event updated')).toBeInTheDocument();
});

it('deletes an official event by name', async () => {
  let deleted: string | null = null;
  server.use(
    http.delete('/api/admin/community/official-posts/:id', ({ params }) => {
      deleted = String(params['id']);
      return ok({ deleted: true });
    }),
  );
  renderTable([OFFICIAL_EVENT]);

  await userEvent.click(
    await screen.findByRole('button', { name: 'Actions for Mommy & me picnic' }),
  );
  await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
  await userEvent.click(screen.getByRole('button', { name: 'Delete event' }));

  await waitFor(() => expect(deleted).toBe('52'));
  expect(await screen.findByText('Official event deleted')).toBeInTheDocument();
});
```

(`BASE`, `OFFICIAL`, `ok`, `renderTable` and `server` already exist in this file. If `renderTable` doesn't wrap `ToastProvider` and `PermissionsProvider`, reuse whatever wrapper the listing-edit test relies on; it already asserts a toast.)

Create or extend `apps/admin/src/lib/__tests__/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { toPlatformDateTimeInput } from '@admin/lib/format';

describe('toPlatformDateTimeInput', () => {
  it('shows a stored UTC instant as Cairo wall-clock for a datetime-local input', () => {
    // Cairo is UTC+2 in January.
    expect(toPlatformDateTimeInput('2026-01-15T09:00:00.000Z')).toBe('2026-01-15T11:00');
    // Crossing midnight moves the date too.
    expect(toPlatformDateTimeInput('2026-01-15T23:30:00.000Z')).toBe('2026-01-16T01:30');
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd apps/admin && npx vitest run src/features/community/__tests__/post-table.test.tsx src/lib/__tests__/format.test.ts`
Expected: FAIL. `toPlatformDateTimeInput` isn't exported, and the listing edit posts to the old URL, which is an unhandled request.

- [ ] **Step 3: Add the format helper**

Append to `apps/admin/src/lib/format.ts` (`PLATFORM_TIMEZONE` is already imported there):

```ts
/**
 * A stored UTC instant → "YYYY-MM-DDTHH:mm" for <input type="datetime-local">,
 * read in the platform's timezone. The reverse trip is
 * `fromDateTimeLocalInput`, which adds seconds and leaves the zone to the
 * backend.
 */
export function toPlatformDateTimeInput(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PLATFORM_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '00';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}
```

- [ ] **Step 4: Replace the API functions**

In `apps/admin/src/lib/api.ts`:
- In the `@nanny-app/shared` type import, replace `CreateOfficialListingInput` and `UpdateOfficialListingInput` with `CreateOfficialPostInput` and `UpdateOfficialPostInput`, keeping alphabetical order.
- Replace the `// ── Official marketplace listings ──` section with:

```ts
// ── Official posts (events, Q&A, listings) ─────────────────────

export async function createOfficialPost(
  input: CreateOfficialPostInput,
): Promise<AdminCommunityPost> {
  const res = await apiClient.post<ApiEnvelope<AdminCommunityPost>>(
    '/admin/community/official-posts',
    input,
  );
  return res.data.data;
}

export async function updateOfficialPost(
  id: number,
  input: UpdateOfficialPostInput,
): Promise<AdminCommunityPost> {
  const res = await apiClient.patch<ApiEnvelope<AdminCommunityPost>>(
    `/admin/community/official-posts/${id}`,
    input,
  );
  return res.data.data;
}

export async function deleteOfficialPost(id: number): Promise<void> {
  await apiClient.delete(`/admin/community/official-posts/${id}`);
}
```

- [ ] **Step 5: Write the form**

`git rm apps/admin/src/features/marketplace/official-listing-form.tsx`, then create `apps/admin/src/features/community/official-post-form.tsx`:

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ChangeEvent } from 'react';

import {
  COMMUNITY_TAGS,
  CreateOfficialPostSchema,
  type AdminCommunityPost,
  type CommunityTag,
  type CreateOfficialPostInput,
  type UpdateOfficialPostInput,
} from '@nanny-app/shared';

import { Field, FormModal, useToast } from '@admin/components/ui';
import { createOfficialPost, updateOfficialPost } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { fromDateTimeLocalInput, toPlatformDateTimeInput } from '@admin/lib/format';
import { firstIssueMessage } from '@admin/lib/form-errors';
import { uploadImageToFirebase } from '@admin/lib/storage';

const MAX_IMAGES = 4;

export type OfficialPostType = AdminCommunityPost['type'];

/** What the type is called in titles, buttons and toasts. */
const NOUN: Record<OfficialPostType, { noun: string; Noun: string }> = {
  marketplace: { noun: 'listing', Noun: 'Listing' },
  event: { noun: 'event', Noun: 'Event' },
  qa: { noun: 'Q&A', Noun: 'Q&A' },
};

type DraftState = {
  title: string;
  body: string;
  price: string;
  imageUrls: string[];
  tags: CommunityTag[];
  contactPhone: string;
  /** <input type="datetime-local"> value, platform wall-clock. */
  eventStartsAt: string;
  location: string;
  maxAttendees: string;
};

function emptyDraft(): DraftState {
  return {
    title: '',
    body: '',
    price: '',
    imageUrls: [],
    tags: [],
    contactPhone: '',
    eventStartsAt: '',
    location: '',
    maxAttendees: '',
  };
}

function draftFromPost(post: AdminCommunityPost): DraftState {
  return {
    title: post.title ?? '',
    body: post.body ?? '',
    price: post.price !== null ? String(post.price) : '',
    imageUrls: post.imageUrls,
    tags: post.tags.filter((tag): tag is CommunityTag =>
      (COMMUNITY_TAGS as readonly string[]).includes(tag),
    ),
    contactPhone: post.contactPhone ?? '',
    eventStartsAt: post.eventStartsAt ? toPlatformDateTimeInput(post.eventStartsAt) : '',
    location: post.location ?? '',
    maxAttendees: post.maxAttendees !== null ? String(post.maxAttendees) : '',
  };
}

const optionalText = (value: string) => (value.trim() ? value.trim() : undefined);
const optionalNumber = (value: string) => (value.trim() ? Number(value) : undefined);

/** The draft as the create schema expects it; the schema decides what's missing. */
function candidate(type: OfficialPostType, draft: DraftState): unknown {
  const shared = { imageUrls: draft.imageUrls, tags: draft.tags };
  switch (type) {
    case 'marketplace':
      return {
        type,
        title: draft.title.trim(),
        body: optionalText(draft.body),
        price: Number(draft.price),
        contactPhone: draft.contactPhone,
        ...shared,
      };
    case 'event':
      return {
        type,
        title: draft.title.trim(),
        body: optionalText(draft.body),
        eventStartsAt: fromDateTimeLocalInput(draft.eventStartsAt),
        location: draft.location.trim(),
        price: optionalNumber(draft.price),
        maxAttendees: optionalNumber(draft.maxAttendees),
        ...shared,
      };
    case 'qa':
      return { type, title: optionalText(draft.title), body: draft.body.trim(), ...shared };
  }
}

/**
 * The same post as an edit. A blank optional field becomes null, so clearing it
 * in the form clears it on the post (an event made free again, say) rather
 * than leaving the old value in place.
 */
function toUpdateInput(input: CreateOfficialPostInput): UpdateOfficialPostInput {
  switch (input.type) {
    case 'marketplace':
      return {
        title: input.title,
        body: input.body ?? null,
        price: input.price,
        imageUrls: input.imageUrls,
        tags: input.tags,
        contactPhone: input.contactPhone,
      };
    case 'event':
      return {
        title: input.title,
        body: input.body ?? null,
        eventStartsAt: input.eventStartsAt,
        location: input.location,
        price: input.price ?? null,
        maxAttendees: input.maxAttendees ?? null,
        imageUrls: input.imageUrls,
        tags: input.tags,
      };
    case 'qa':
      return {
        title: input.title ?? null,
        body: input.body,
        imageUrls: input.imageUrls,
        tags: input.tags,
      };
  }
}

type OfficialPostFormModalProps = {
  type: OfficialPostType;
  /** The official post to edit; omit to publish a new one. */
  post?: AdminCommunityPost;
  onClose: () => void;
};

/**
 * Publish an official event, Q&A or listing as NannyNow, or edit one. A new post
 * goes live at once (an admin wrote it, so it never enters the review queue),
 * and an edit never re-enters review either. Listings are pinned in the
 * marketplace feed; events and Q&A sit by date, badged Official.
 */
export function OfficialPostFormModal({ type, post, onClose }: OfficialPostFormModalProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { noun, Noun } = NOUN[type];
  const [draft, setDraft] = useState<DraftState>(() => (post ? draftFromPost(post) : emptyDraft()));
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: (save: () => Promise<AdminCommunityPost>) => save(),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['community-posts'] });
      toast.success(
        post ? `${Noun} updated` : `Official ${noun} published`,
        saved.title ?? saved.body ?? '',
      );
      onClose();
    },
    onError: (err) => setFormError(apiErrorMessage(err)),
  });

  async function handleImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setFormError(null);
    try {
      const url = await uploadImageToFirebase(file, 'marketplace');
      setDraft((current) => ({
        ...current,
        imageUrls: [...current.imageUrls, url].slice(0, MAX_IMAGES),
      }));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  /**
   * Validated against the shared schema — the same one the API validates with,
   * so the console can't submit something the backend would reject.
   */
  function submit() {
    setFormError(null);
    if (type === 'event' && !draft.eventStartsAt) {
      return setFormError('Pick the event’s date and time.');
    }
    const parsed = CreateOfficialPostSchema.safeParse(candidate(type, draft));
    if (!parsed.success) return setFormError(firstIssueMessage(parsed.error));
    const input = parsed.data;
    saveMutation.mutate(() =>
      post ? updateOfficialPost(post.id, toUpdateInput(input)) : createOfficialPost(input),
    );
  }

  const set = (patch: Partial<DraftState>) => setDraft((current) => ({ ...current, ...patch }));

  const toggleTag = (tag: CommunityTag) =>
    setDraft((current) => ({
      ...current,
      tags: current.tags.includes(tag)
        ? current.tags.filter((t) => t !== tag)
        : current.tags.slice(0, 4).concat(tag),
    }));

  const idPrefix = post ? `official-${post.id}` : `new-${type}`;
  const photosRequired = type === 'marketplace';

  return (
    <FormModal
      title={post ? `Edit official ${noun}` : `New official ${noun}`}
      submitLabel={post ? 'Save changes' : `Publish ${noun}`}
      busy={saveMutation.isPending}
      submitDisabled={uploading}
      error={formError}
      onSubmit={submit}
      onClose={onClose}
    >
      <div className="form-grid">
        {type === 'marketplace' && (
          <>
            <Field label="Product name">
              <input
                value={draft.title}
                autoFocus
                onChange={(e) => set({ title: e.target.value })}
                placeholder="Convertible car seat"
                required
              />
            </Field>
            <Field label="Price (EGP)">
              <input
                type="number"
                min="1"
                step="0.01"
                value={draft.price}
                onChange={(e) => set({ price: e.target.value })}
                placeholder="3500"
                required
              />
            </Field>
            <Field
              label="Contact number"
              hint="Buyers call or WhatsApp this instead of messaging a seller."
            >
              <input
                value={draft.contactPhone}
                onChange={(e) => set({ contactPhone: e.target.value })}
                placeholder="+20 100 123 4567"
                required
              />
            </Field>
            <Field label="Description" hint="Optional — shown under the photos.">
              <input
                value={draft.body}
                onChange={(e) => set({ body: e.target.value })}
                placeholder="Brand new, sealed box"
              />
            </Field>
          </>
        )}

        {type === 'event' && (
          <>
            <Field label="Event name">
              <input
                value={draft.title}
                autoFocus
                onChange={(e) => set({ title: e.target.value })}
                placeholder="Mommy & me picnic"
                required
              />
            </Field>
            <Field label="Date and time">
              <input
                type="datetime-local"
                value={draft.eventStartsAt}
                onChange={(e) => set({ eventStartsAt: e.target.value })}
                required
              />
            </Field>
            <Field label="Location">
              <input
                value={draft.location}
                onChange={(e) => set({ location: e.target.value })}
                placeholder="Merryland Park, Heliopolis"
                required
              />
            </Field>
            <Field label="Price (EGP)" hint="Leave blank for a free event.">
              <input
                type="number"
                min="0"
                step="0.01"
                value={draft.price}
                onChange={(e) => set({ price: e.target.value })}
                placeholder="Free"
              />
            </Field>
            <Field label="Max attendees" hint="Optional — leave blank for no limit.">
              <input
                type="number"
                min="1"
                step="1"
                value={draft.maxAttendees}
                onChange={(e) => set({ maxAttendees: e.target.value })}
                placeholder="No limit"
              />
            </Field>
          </>
        )}

        {type === 'qa' && (
          <Field label="Title" hint="Optional — a headline above the post.">
            <input
              value={draft.title}
              autoFocus
              onChange={(e) => set({ title: e.target.value })}
              placeholder="Summer opening hours"
            />
          </Field>
        )}

        <Field
          label="Photos"
          hint={
            uploading
              ? 'Uploading…'
              : `${draft.imageUrls.length}/${MAX_IMAGES} uploaded.${photosRequired ? ' At least one is required.' : ' Optional.'}`
          }
        >
          <input
            type="file"
            accept="image/*"
            disabled={uploading || draft.imageUrls.length >= MAX_IMAGES}
            onChange={(e) => void handleImage(e)}
          />
        </Field>
      </div>

      {type !== 'marketplace' && (
        <Field
          label={type === 'qa' ? 'Body' : 'Description'}
          hint={type === 'qa' ? undefined : 'Optional — what to expect, what to bring.'}
        >
          <textarea
            className="input"
            rows={4}
            value={draft.body}
            onChange={(e) => set({ body: e.target.value })}
            placeholder={
              type === 'qa'
                ? 'What would you like to tell or ask the community?'
                : 'Blankets and snacks provided.'
            }
          />
        </Field>
      )}

      {draft.imageUrls.length > 0 && (
        <div className="field">
          <span className="field-label">Preview</span>
          <div className="listing-thumbs">
            {draft.imageUrls.map((url) => (
              <div className="listing-thumb" key={url}>
                <img src={url} alt="" />
                <button
                  type="button"
                  className="listing-thumb-remove"
                  aria-label="Remove photo"
                  onClick={() => set({ imageUrls: draft.imageUrls.filter((u) => u !== url) })}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="field">
        <span className="field-label">Tags</span>
        <div className="tag-toggle-row">
          {COMMUNITY_TAGS.map((tag) => (
            <button
              type="button"
              key={tag}
              id={`${idPrefix}-tag-${tag}`}
              className={draft.tags.includes(tag) ? 'tag-toggle tag-toggle--on' : 'tag-toggle'}
              aria-pressed={draft.tags.includes(tag)}
              onClick={() => toggleTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>
    </FormModal>
  );
}
```

Check that `Field` accepts `hint={undefined}`: `hint` is optional. If `Field`'s prop is typed `hint?: string` under `exactOptionalPropertyTypes`, spread it conditionally instead.

- [ ] **Step 6: Generalise the table**

In `apps/admin/src/features/community/post-table.tsx`:
- Replace the form import with `import { OfficialPostFormModal } from '@admin/features/community/official-post-form';`.
- Replace `deleteOfficialListing` in the api import with `deleteOfficialPost`.
- Replace `deleteMutation` with:

```tsx
  const deleteMutation = useMutation({
    mutationFn: (post: AdminCommunityPost) => deleteOfficialPost(post.id),
    onSuccess: (_result, post) => {
      invalidate();
      setDeleting(null);
      toast.success(`Official ${nounFor(post)} deleted`);
    },
    onError: (err, post) => toast.error(`Couldn’t delete ${nounFor(post)}`, apiErrorMessage(err)),
  });
```

- In `actionsColumn`, change the comment to `// Official posts are edited, never reviewed (approving or rejecting one is a 400 at the API); everything else is moderated, never edited here.`
- Replace the edit modal line with `{editing && (<OfficialPostFormModal type={editing.type} post={editing} onClose={() => setEditing(null)} />)}`.
- Replace the delete `ConfirmDialog` with:

```tsx
      {deleting && (
        <ConfirmDialog
          title={`Delete official ${nounFor(deleting)}`}
          message={`Delete “${displayTitle(deleting)}”? It disappears from the app immediately.`}
          confirmLabel={`Delete ${nounFor(deleting)}`}
          danger
          busy={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}
```

`nounFor` gives `listing`, `event` or `post`. That's why the dialogs read "Delete official post" for a Q&A, while the form title says "Q&A". The existing E2E still finds "Delete listing" and "Official listing deleted".

- [ ] **Step 7: Keep the page compiling**

In `apps/admin/src/pages/community-page.tsx`, replace the `OfficialListingFormModal` import with `import { OfficialPostFormModal } from '@admin/features/community/official-post-form';`, and replace its usage with `{adding && <OfficialPostFormModal type="marketplace" onClose={() => setAdding(false)} />}`. Task 4 replaces the header.

In the `CommunityPage` test `'adds an official listing from the header…'`, nothing changes yet: the button label and the "Publish listing" text are unchanged.

- [ ] **Step 8: Remove the old shared schemas**

In `packages/shared/src/admin.ts`, delete `CreateOfficialListingSchema`, `CreateOfficialListingInput`, `UpdateOfficialListingSchema` and `UpdateOfficialListingInput`. Then run:
`grep -rn "OfficialListing" apps packages --include=*.ts --include=*.tsx | grep -v node_modules`
Expected: only `seedOfficialListing` in `apps/admin/e2e` (Task 4), and nothing else.

- [ ] **Step 9: Run the tests, typecheck, and watch them pass**

Run: `cd apps/admin && npx vitest run && pnpm typecheck`
Expected:
- Every Vitest file passes, including the two new PostTable tests and the format test.
- The typecheck prints no `error TS`. The e2e helper still posts to the old URL, but that's a string, so it still typechecks.

Also run: `cd ../../packages/shared && npx tsc --noEmit -p tsconfig.json` (no output) and `cd ../../apps/backend && npx tsc --noEmit -p tsconfig.json` (no output).

- [ ] **Step 10: Commit**

```bash
git add apps/admin/src/features/community/official-post-form.tsx apps/admin/src/lib/api.ts apps/admin/src/lib/format.ts apps/admin/src/lib/__tests__/format.test.ts apps/admin/src/features/community/post-table.tsx apps/admin/src/features/community/__tests__/post-table.test.tsx apps/admin/src/pages/community-page.tsx packages/shared/src/admin.ts
git commit -m "Admin: one official post form for events, Q&A and listings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`git rm` already staged the old form's deletion.)

---

### Task 4: New post menu and E2E

**Files:**
- Modify: `apps/admin/src/pages/community-page.tsx`
- Modify: `apps/admin/src/features/community/__tests__/post-table.test.tsx` (the `CommunityPage` describe)
- Modify: `apps/admin/e2e/helpers/backend.ts` (`seedOfficialListing`, ~line 809)
- Modify: `apps/admin/e2e/b06-community-moderation.spec.ts`

**Interfaces:**
- Consumes:
  - `OfficialPostFormModal` and `OfficialPostType` (Task 3).
  - From `@admin/components/ui`: `Menu`, `MenuItem`, `CalendarClock`, `MessagesSquare`, `Store`, `ChevronDown`, `Plus` and `ICON_SIZE`.
- Produces: the header's "New post" menu. Its trigger's accessible name is `New post`, and its menu items are `Event`, `Q&A` and `Listing`.

- [ ] **Step 1: Write the failing page tests**

In the `CommunityPage` describe of `post-table.test.tsx`, replace the `'adds an official listing from the header…'` test with:

```ts
  it('opens the listing form from the New post menu, checking it before it posts', async () => {
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'New post' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Listing' }));
    const dialog = screen.getByRole('dialog', { name: 'New official listing' });
    await userEvent.type(within(dialog).getByLabelText('Product name'), 'Car seat');
    await userEvent.type(within(dialog).getByLabelText('Price (EGP)'), '3500');
    await userEvent.type(within(dialog).getByLabelText(/Contact number/), '+201001234567');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Publish listing' }));

    // No photo yet — caught by the shared schema before any request is made.
    expect(await within(dialog).findByText(/At least one image is required/)).toBeInTheDocument();
  });

  it('publishes an official event with no photo', async () => {
    let body: unknown = null;
    server.use(
      http.post('/api/admin/community/official-posts', async ({ request }) => {
        body = await request.json();
        return ok({ ...BASE, id: 60, type: 'event', title: 'Picnic', isOfficial: true });
      }),
    );
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'New post' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Event' }));
    const dialog = screen.getByRole('dialog', { name: 'New official event' });
    await userEvent.type(within(dialog).getByLabelText('Event name'), 'Picnic');
    await userEvent.type(within(dialog).getByLabelText('Date and time'), '2026-10-10T11:00');
    await userEvent.type(within(dialog).getByLabelText('Location'), 'Merryland Park');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Publish event' }));

    await waitFor(() =>
      expect(body).toEqual({
        type: 'event',
        title: 'Picnic',
        eventStartsAt: '2026-10-10T11:00:00',
        location: 'Merryland Park',
        imageUrls: [],
        tags: [],
      }),
    );
    expect(await screen.findByText('Official event published')).toBeInTheDocument();
  });

  it('publishes an official Q&A from just its body', async () => {
    let body: unknown = null;
    server.use(
      http.post('/api/admin/community/official-posts', async ({ request }) => {
        body = await request.json();
        return ok({ ...BASE, id: 61, type: 'qa', title: null, body: 'Hi', isOfficial: true });
      }),
    );
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'New post' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Q&A' }));
    const dialog = screen.getByRole('dialog', { name: 'New official Q&A' });
    await userEvent.type(within(dialog).getByLabelText('Body'), 'Summer hours start Sunday.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Publish Q&A' }));

    await waitFor(() =>
      expect(body).toEqual({
        type: 'qa',
        body: 'Summer hours start Sunday.',
        imageUrls: [],
        tags: [],
      }),
    );
  });
```

If jsdom's `userEvent.type` doesn't fill a `datetime-local` input, use `fireEvent.change(input, { target: { value: '2026-10-10T11:00' } })` (import `fireEvent` from `@testing-library/react`) for that one field.

- [ ] **Step 2: Run them and watch them fail**

Run: `cd apps/admin && npx vitest run src/features/community/__tests__/post-table.test.tsx`
Expected: FAIL, because there's no button named "New post".

- [ ] **Step 3: Build the header menu**

In `apps/admin/src/pages/community-page.tsx`:
- Change the ui import to include `CalendarClock`, `ChevronDown`, `Menu`, `MenuItem`, `MessagesSquare` and `Store`, and to drop `Button`.
- Import `type OfficialPostType` beside `OfficialPostFormModal`.
- Change the state to `const [adding, setAdding] = useState<OfficialPostType | null>(null);`.
- Replace the `PageHeader` with:

```tsx
      <PageHeader
        title="Community"
        subtitle="Review what mothers post before it reaches the feed, and post events, Q&A and listings as NannyNow."
        action={
          canManage && (
            <Menu
              triggerLabel="New post"
              triggerClassName="btn btn--primary"
              trigger={
                <>
                  <Plus size={ICON_SIZE.inline} aria-hidden />
                  New post
                  <ChevronDown size={ICON_SIZE.inline} aria-hidden />
                </>
              }
            >
              <MenuItem
                icon={<CalendarClock size={ICON_SIZE.menu} />}
                onSelect={() => setAdding('event')}
              >
                Event
              </MenuItem>
              <MenuItem
                icon={<MessagesSquare size={ICON_SIZE.menu} />}
                onSelect={() => setAdding('qa')}
              >
                Q&amp;A
              </MenuItem>
              <MenuItem icon={<Store size={ICON_SIZE.menu} />} onSelect={() => setAdding('marketplace')}>
                Listing
              </MenuItem>
            </Menu>
          )
        }
      />
```

- Replace the modal line with `{adding && <OfficialPostFormModal type={adding} onClose={() => setAdding(null)} />}`.
- Update the file's `panel-lead` paragraph to add one sentence at the end: "Posts you publish here go live at once as NannyNow."

- [ ] **Step 4: Run it and watch it pass**

Run: `cd apps/admin && npx vitest run && pnpm typecheck`
Expected: every Vitest file passes, and the typecheck prints no `error TS`.

- [ ] **Step 5: Check the header in the browser**

Start the `admin` preview (`.claude/launch.json` → `admin`). There's no backend locally, so make a temporary untracked harness, the way the booking redesign was checked:
- `apps/admin/community-preview.html` and `src/community-preview.tsx`.
- The harness renders `<CommunityPage />` with a pre-seeded `QueryClient`:
  - `['admin-me']`: a SUPERUSER.
  - `['community-posts', 'ALL', 'PENDING', { sortBy: 'submitted', sortDir: 'asc' }, 1, 20]`: a small page `{ data: [...], meta: {...} }`. Match the key to the `useQuery` key in the page.
  - `staleTime: Infinity` and `retry: false`.

Then check:
- At 1440×900, the New post button sits at the header's trailing edge, and the menu opens under it with its three items and icons.
- Each item opens its form with the right fields.
- At 400px wide, the header wraps without horizontal scroll (`document.documentElement.scrollWidth <= innerWidth`).

Delete the two harness files afterwards, and stop the preview.

- [ ] **Step 6: E2E**

In `apps/admin/e2e/helpers/backend.ts`, in `seedOfficialListing`, change the call to:

```ts
  const listing = (await call('POST', '/admin/community/official-posts', adminToken, {
    type: 'marketplace',
    title,
    body: 'Sold by NannyNow. Seeded by the admin E2E suite.',
    price: 2400,
    imageUrls: [LISTING_PHOTO],
    contactPhone: uniquePhone(),
    tags: [],
  })) as { id: number };
```

Also update its doc comment to say "through the console's New post → Listing form".

In `apps/admin/e2e/b06-community-moderation.spec.ts`:
- Update the comment in the official listing test, `"Add official listing" modal` → `New post → Listing form`.
- Add after that test:

```ts
test('an official event is published from the console and lands in the event feed', async ({
  page,
}) => {
  const mother = await seedMother();
  const title = `NannyNow picnic ${Date.now()}`;

  await gotoConsole(page, '/community');
  await page.getByRole('button', { name: 'New post' }).click();
  await page.getByRole('menuitem', { name: 'Event' }).click();

  // No photo: an event doesn't need one, so the whole form is drivable here
  // (the listing form is not — see the test above).
  const dialog = page.getByRole('dialog', { name: 'New official event' });
  await dialog.getByLabel('Event name').fill(title);
  await dialog.getByLabel('Date and time').fill('2027-03-14T11:00');
  await dialog.getByLabel('Location').fill('Merryland Park, Heliopolis');

  const published = page.waitForResponse(
    (response) =>
      response.url().endsWith('/admin/community/official-posts') &&
      response.request().method() === 'POST',
  );
  await dialog.getByRole('button', { name: 'Publish event' }).click();
  const { data } = (await (await published).json()) as { data: { id: number } };
  await expect(toast(page, 'Official event published')).toBeVisible();

  // Live immediately, in the feed the app renders for events.
  expect(await findInFeed(mother.token, 'event', data.id)).not.toBeNull();

  await openQueue(page, 'Live');
  const row = await findRow(page, title);
  await expect(row).toContainText('Official');
  await expect(row).toContainText('Event');
});
```

Run: `cd apps/admin && pnpm typecheck`
Expected: no `error TS`. The E2E itself needs the test stack (`pnpm test:env` plus the backend on :3001), so run it only if that stack is up; otherwise, report it as typechecked and not run.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/pages/community-page.tsx apps/admin/src/features/community/__tests__/post-table.test.tsx apps/admin/e2e/helpers/backend.ts apps/admin/e2e/b06-community-moderation.spec.ts
git commit -m "Admin: New post menu for official events, Q&A and listings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
