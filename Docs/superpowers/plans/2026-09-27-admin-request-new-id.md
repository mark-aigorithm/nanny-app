# Admin "Request new ID" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin can invalidate a nanny's or a mother's ID. The user is sent back to "Awaiting ID", has to upload a new one, and is suspended until it is re-approved.

**Architecture:** One backend helper (`invalidateIdDocument`) does the write, the Storage cleanup and the notification. Thin role services (`invalidateNannyId`, `invalidateMotherId`) resolve the user and call it, behind two new admin routes. The admin console gets one reusable `RequestNewIdButton` used on both detail pages. On mobile, the nanny redirect mapping moves into a shared `nannyStatusRoute`, and a new `useNannyAccessGuard` in the `(nanny)` layout sends a nanny out as soon as her status stops being APPROVED. Status-changing pushes and returning to the foreground both refetch `/auth/me`.

**Tech Stack:** Express + Prisma + Zod (backend, Jest). React 19 + TanStack Query + MSW (admin, Vitest, Playwright). Expo Router + React Query + zustand (mobile, jest-expo).

**Spec:** `Docs/superpowers/specs/2026-09-27-admin-request-new-id-design.md`

## Global Constraints

- The status after invalidation is `PENDING_ID`. It is never `REJECTED`.
- No Prisma migration. The in-app notification reuses type `NANNY_REJECTED`, and the push `data.type` is `id_reupload_requested`.
- The request body reuses `RejectNannySchema` (`{ reason?: string }`, trimmed, 1–500). It already backs both reject routes, so there is no new schema. This corrects the spec, which named a new `InvalidateIdSchema`.
- The notification title is exactly `Please upload your ID again`.
- Admin query keys use the **string** route id: `['nanny', id]` and `['mother', id]`.
- Every new admin route needs a row in `ADMIN_ROUTE_PERMISSIONS` with `section('users', 'MANAGE')`.
- File naming: backend and admin files are kebab-case, mobile files are camelCase (e.g. `useRootGate.ts`), matching each package.
- On Windows, edit files at their exact on-disk casing.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Backend: invalidate a user's ID

**Files:**
- Create: `apps/backend/src/services/id-document.service.ts`
- Create: `apps/backend/src/__tests__/id-document.service.test.ts`
- Modify: `apps/backend/src/services/admin-nanny.service.ts` (add `invalidateNannyId` after `rejectNanny`)
- Modify: `apps/backend/src/services/admin-user.service.ts` (add `invalidateMotherId` after `rejectMother`)
- Modify: `apps/backend/src/routes/admin.routes.ts` (two routes, after each `/reject` route)
- Modify: `apps/backend/src/lib/admin-permissions.ts` (two rows, after each `/reject` row)

**Interfaces:**
- Produces:
  - `invalidateIdDocument(user: IdDocumentHolder, input: RejectNannyInput, role: 'NANNY' | 'MOTHER'): Promise<void>`
  - `invalidateNannyId(id: number, input: RejectNannyInput): Promise<AdminNanny>`
  - `invalidateMotherId(id: number, input: RejectNannyInput): Promise<AdminMother>`
  - `POST /admin/nannies/:id/invalidate-id` (`:id` is the NannyProfile id) returns `AdminNanny`
  - `POST /admin/mothers/:id/invalidate-id` (`:id` is the users id) returns `AdminMother`

- [ ] **Step 1: Write the failing test**

`apps/backend/src/__tests__/id-document.service.test.ts`:

```ts
jest.mock('@backend/db/prisma', () => ({
  prisma: { user: { update: jest.fn() } },
}));
jest.mock('@backend/services/notification.service', () => ({
  createInAppNotification: jest.fn().mockResolvedValue({}),
  dispatchPush: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@backend/lib/storage', () => ({
  deleteStorageObjectByUrl: jest.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@backend/db/prisma';
import { deleteStorageObjectByUrl } from '@backend/lib/storage';
import { createInAppNotification, dispatchPush } from '@backend/services/notification.service';
import { invalidateIdDocument } from '@backend/services/id-document.service';

const mockUpdate = prisma.user.update as jest.Mock;
const FRONT = 'https://storage.example/nanny-ids/u1/front.jpg';
const BACK = 'https://storage.example/nanny-ids/u1/back.jpg';
const holder = { id: 7, idDocumentFrontUrl: FRONT, idDocumentBackUrl: BACK };

beforeEach(() => jest.clearAllMocks());

describe('invalidateIdDocument', () => {
  it('sends the user back to PENDING_ID with the ID cleared and the reason kept', async () => {
    await invalidateIdDocument(holder, { reason: 'Photo is blurry' }, 'NANNY');

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 7 },
      data: {
        approvalStatus: 'PENDING_ID',
        reviewedAt: expect.any(Date),
        rejectionReason: 'Photo is blurry',
        idDocumentType: null,
        idDocumentFrontUrl: null,
        idDocumentBackUrl: null,
      },
    });
    expect(deleteStorageObjectByUrl).toHaveBeenCalledWith(FRONT);
    expect(deleteStorageObjectByUrl).toHaveBeenCalledWith(BACK);
  });

  it('tells a nanny why, and what she needs to do', async () => {
    await invalidateIdDocument(holder, { reason: 'Photo is blurry' }, 'NANNY');

    const body =
      "Your ID couldn't be verified: Photo is blurry. Please upload a new one to keep receiving bookings.";
    expect(createInAppNotification).toHaveBeenCalledWith({
      userId: 7,
      type: 'NANNY_REJECTED',
      title: 'Please upload your ID again',
      body,
    });
    expect(dispatchPush).toHaveBeenCalledWith(7, {
      title: 'Please upload your ID again',
      body,
      data: { type: 'id_reupload_requested', title: 'Please upload your ID again' },
    });
  });

  it('words a mother notice without a reason around her next booking', async () => {
    await invalidateIdDocument(holder, {}, 'MOTHER');

    expect(createInAppNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "Your ID couldn't be verified. Please upload a new one before your next booking.",
      }),
    );
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ rejectionReason: null }) }),
    );
  });

  it('refuses when there is no ID on file', async () => {
    await expect(
      invalidateIdDocument({ id: 7, idDocumentFrontUrl: null, idDocumentBackUrl: null }, {}, 'NANNY'),
    ).rejects.toMatchObject({ statusCode: 400, message: 'There is no ID on file to invalidate.' });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(createInAppNotification).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `apps/backend`: `npx jest --selectProjects unit --runTestsByPath src/__tests__/id-document.service.test.ts`
Expected: FAIL with `Cannot find module '@backend/services/id-document.service'`.

- [ ] **Step 3: Write the helper**

`apps/backend/src/services/id-document.service.ts`:

```ts
import { ApprovalStatus } from '@prisma/client';

import type { RejectNannyInput } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import { deleteStorageObjectByUrl } from '@backend/lib/storage';
import {
  createInAppNotification,
  dispatchPush,
} from '@backend/services/notification.service';

export type IdDocumentHolder = {
  id: number;
  idDocumentFrontUrl: string | null;
  idDocumentBackUrl: string | null;
};

const TITLE = 'Please upload your ID again';

/**
 * Sends a user's ID back: the document is refused, not the application. The
 * account returns to PENDING_ID — which already suspends it (a nanny leaves
 * search and new bookings, a mother can't book) and already sends each app to
 * its upload prompt — with the reason kept to show her there. The old files
 * are deleted, as a reject does, so a stale photo can't be approved later.
 *
 * Reuses the NANNY_REJECTED in-app type rather than adding an enum value,
 * which would need a migration nothing applies on deploy.
 */
export async function invalidateIdDocument(
  user: IdDocumentHolder,
  input: RejectNannyInput,
  role: 'NANNY' | 'MOTHER',
): Promise<void> {
  if (!user.idDocumentFrontUrl && !user.idDocumentBackUrl) {
    throw errors.badRequest('There is no ID on file to invalidate.');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      approvalStatus: ApprovalStatus.PENDING_ID,
      reviewedAt: new Date(),
      rejectionReason: input.reason ?? null,
      idDocumentType: null,
      idDocumentFrontUrl: null,
      idDocumentBackUrl: null,
    },
  });
  await deleteStorageObjectByUrl(user.idDocumentFrontUrl);
  await deleteStorageObjectByUrl(user.idDocumentBackUrl);

  const until = role === 'NANNY' ? 'to keep receiving bookings' : 'before your next booking';
  const body = input.reason
    ? `Your ID couldn't be verified: ${input.reason}. Please upload a new one ${until}.`
    : `Your ID couldn't be verified. Please upload a new one ${until}.`;
  await createInAppNotification({ userId: user.id, type: 'NANNY_REJECTED', title: TITLE, body });
  await dispatchPush(user.id, {
    title: TITLE,
    body,
    data: { type: 'id_reupload_requested', title: TITLE },
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest --selectProjects unit --runTestsByPath src/__tests__/id-document.service.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Add the role services**

In `admin-nanny.service.ts`, add `RejectNannyInput` to the existing type import if it isn't there, import the helper, and add this after `rejectNanny`:

```ts
import { invalidateIdDocument } from '@backend/services/id-document.service';

/** Admin sends a nanny's ID back for a new upload (any status with an ID on file). */
export async function invalidateNannyId(id: number, input: RejectNannyInput): Promise<AdminNanny> {
  const profile = await findReviewableNanny(id);
  await invalidateIdDocument(profile.user, input, 'NANNY');
  return toDto(await findReviewableNanny(id));
}
```

In `admin-user.service.ts`, add this after `rejectMother`:

```ts
import { invalidateIdDocument } from '@backend/services/id-document.service';

/** Admin sends a mother's ID back for a new upload (any status with an ID on file). */
export async function invalidateMotherId(id: number, input: RejectNannyInput): Promise<AdminMother> {
  const mother = await findReviewableMother(id);
  await invalidateIdDocument(mother, input, 'MOTHER');
  return toMotherDto(await findReviewableMother(id));
}
```

Add service tests to `apps/backend/src/__tests__/admin-nanny.service.test.ts`. That file already mocks `@backend/services/notification.service` and `@backend/lib/storage`. Add this mock at the top, next to the others:

```ts
jest.mock('@backend/services/id-document.service', () => ({
  invalidateIdDocument: jest.fn().mockResolvedValue(undefined),
}));
```

Add `invalidateNannyId` to the existing import from `@backend/services/admin-nanny.service`, then append:

```ts
import { invalidateIdDocument } from '@backend/services/id-document.service';

describe('invalidateNannyId', () => {
  it('invalidates the ID of the nanny behind the profile id', async () => {
    mockPrisma.nannyProfile.findFirst.mockResolvedValue(makeRow());

    const result = await invalidateNannyId(1, { reason: 'Blurry' });

    expect(invalidateIdDocument).toHaveBeenCalledWith(
      expect.objectContaining({ id: 10, idDocumentFrontUrl: 'https://storage.example/nanny-ids/front.jpg' }),
      { reason: 'Blurry' },
      'NANNY',
    );
    expect(result.id).toBe(1);
  });

  it('404s for an unknown nanny', async () => {
    mockPrisma.nannyProfile.findFirst.mockResolvedValue(null);
    await expect(invalidateNannyId(99, {})).rejects.toMatchObject({ statusCode: 404 });
  });
});
```

- [ ] **Step 6: Add the routes and permission rows**

In `admin.routes.ts`, add `invalidateNannyId` and `invalidateMotherId` to the imports next to `rejectNanny` and `rejectMother`. Put this right after the `'/nannies/:id/reject'` route:

```ts
adminRouter.post(
  '/nannies/:id/invalidate-id',
  validateBody(RejectNannySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await invalidateNannyId(routeIdParam(req.params.id), req.body)));
    } catch (err) {
      next(err);
    }
  },
);
```

Put this right after the `'/mothers/:id/reject'` route:

```ts
adminRouter.post(
  '/mothers/:id/invalidate-id',
  validateBody(RejectNannySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await invalidateMotherId(routeIdParam(req.params.id), req.body)));
    } catch (err) {
      next(err);
    }
  },
);
```

In `admin-permissions.ts`, add after the matching reject rows:

```ts
  { method: 'POST', pattern: '/nannies/:id/invalidate-id', requires: section('users', 'MANAGE') },
  { method: 'POST', pattern: '/mothers/:id/invalidate-id', requires: section('users', 'MANAGE') },
```

- [ ] **Step 7: Run the backend checks**

Run from `apps/backend`: `npx tsc --noEmit -p tsconfig.json` and then `npx jest --selectProjects unit`
Expected: tsc prints nothing. All suites pass, including `admin-permissions.test.ts`, which walks the router and fails if a route has no row.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/services/id-document.service.ts apps/backend/src/__tests__/id-document.service.test.ts apps/backend/src/services/admin-nanny.service.ts apps/backend/src/services/admin-user.service.ts apps/backend/src/__tests__/admin-nanny.service.test.ts apps/backend/src/routes/admin.routes.ts apps/backend/src/lib/admin-permissions.ts
git commit -m "Let an admin send a user's ID back for a new upload"
```

---

### Task 2: Admin: "Request new ID" on both detail pages

**Files:**
- Modify: `apps/admin/src/lib/api.ts` (two functions after `rejectMother`)
- Create: `apps/admin/src/features/users/request-new-id-button.tsx`
- Create: `apps/admin/src/features/users/__tests__/request-new-id-button.test.tsx`
- Modify: `apps/admin/src/pages/nanny-detail-page.tsx` (Application card `action`)
- Modify: `apps/admin/src/pages/mother-detail-page.tsx` (header actions)

**Interfaces:**
- Consumes: `POST /admin/nannies/:id/invalidate-id` and `POST /admin/mothers/:id/invalidate-id` from Task 1.
- Produces:
  - `invalidateNannyId(id: string, reason?: string): Promise<AdminNanny>`
  - `invalidateMotherId(id: string, reason?: string): Promise<AdminMother>`
  - `<RequestNewIdButton name consequence request onDone />`

- [ ] **Step 1: Add the API functions**

In `apps/admin/src/lib/api.ts`, after `rejectMother`:

```ts
export async function invalidateNannyId(id: string, reason?: string): Promise<AdminNanny> {
  const res = await apiClient.post<ApiEnvelope<AdminNanny>>(
    `/admin/nannies/${id}/invalidate-id`,
    reason ? { reason } : {},
  );
  return res.data.data;
}

export async function invalidateMotherId(id: string, reason?: string): Promise<AdminMother> {
  const res = await apiClient.post<ApiEnvelope<AdminMother>>(
    `/admin/mothers/${id}/invalidate-id`,
    reason ? { reason } : {},
  );
  return res.data.data;
}
```

- [ ] **Step 2: Write the failing component test**

`apps/admin/src/features/users/__tests__/request-new-id-button.test.tsx`:

```tsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { RequestNewIdButton } from '@admin/features/users/request-new-id-button';
import { invalidateNannyId } from '@admin/lib/api';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

function renderButton(onDone = vi.fn()) {
  renderWithProviders(
    <ToastProvider>
      <RequestNewIdButton
        name="Nanny Test"
        consequence="Until it's approved she won't get new bookings."
        request={(reason) => invalidateNannyId('21', reason)}
        onDone={onDone}
      />
    </ToastProvider>,
  );
  return onDone;
}

describe('RequestNewIdButton', () => {
  it('sends the reason and reports success', async () => {
    let body: unknown = null;
    server.use(
      http.post('/api/admin/nannies/:id/invalidate-id', async ({ request, params }) => {
        expect(params['id']).toBe('21');
        body = await request.json();
        return HttpResponse.json({ data: {}, error: null });
      }),
    );
    const onDone = renderButton();

    await userEvent.click(screen.getByRole('button', { name: 'Request new ID' }));
    expect(screen.getByText(/ID photos will be deleted/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/^Reason/), 'Photo is blurry');
    await userEvent.click(screen.getByRole('button', { name: 'Delete ID and ask again' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(body).toEqual({ reason: 'Photo is blurry' });
    expect(await screen.findByText('New ID requested')).toBeInTheDocument();
  });

  it('sends no reason when left blank', async () => {
    let body: unknown = null;
    server.use(
      http.post('/api/admin/nannies/:id/invalidate-id', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: {}, error: null });
      }),
    );
    const onDone = renderButton();

    await userEvent.click(screen.getByRole('button', { name: 'Request new ID' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete ID and ask again' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(body).toEqual({});
  });

  it('keeps the dialog open and shows the error when the request fails', async () => {
    server.use(
      http.post('/api/admin/nannies/:id/invalidate-id', () =>
        HttpResponse.json(
          { data: null, error: 'There is no ID on file to invalidate.' },
          { status: 400 },
        ),
      ),
    );
    const onDone = renderButton();

    await userEvent.click(screen.getByRole('button', { name: 'Request new ID' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete ID and ask again' }));

    expect(await screen.findByText('Couldn’t request a new ID')).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Delete ID and ask again' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run from `apps/admin`: `npx vitest run src/features/users/__tests__/request-new-id-button.test.tsx`
Expected: FAIL, because `request-new-id-button` can't be resolved.

- [ ] **Step 4: Write the component**

`apps/admin/src/features/users/request-new-id-button.tsx`:

```tsx
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { Button, PromptDialog, useToast } from '@admin/components/ui';
import { apiErrorMessage } from '@admin/lib/api-error';

type RequestNewIdButtonProps = {
  /** Whose ID it is, for the dialog and the toast. */
  name: string;
  /** What the suspension means for this role, appended to the warning. */
  consequence: string;
  request: (reason?: string) => Promise<unknown>;
  onDone: () => void;
};

/**
 * Sends a user's ID back for a new upload. The document is refused, not the
 * account: they return to "Awaiting ID" and the app asks them for a new one.
 */
export function RequestNewIdButton({ name, consequence, request, onDone }: RequestNewIdButtonProps) {
  const [open, setOpen] = useState(false);
  const toast = useToast();

  const mutation = useMutation({
    mutationFn: (reason?: string) => request(reason),
    onSuccess: () => {
      setOpen(false);
      toast.success('New ID requested', `${name} will be asked to upload a new ID.`);
      onDone();
    },
    onError: (err) => toast.error('Couldn’t request a new ID', apiErrorMessage(err)),
  });

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Request new ID
      </Button>
      {open && (
        <PromptDialog
          title="Request a new ID"
          message={`${name}'s ID photos will be deleted and they'll be asked to upload a new one. ${consequence}`}
          label="Reason (optional — shown to them)"
          placeholder="e.g. The photo is too blurry to read"
          confirmLabel="Delete ID and ask again"
          danger
          multiline
          busy={mutation.isPending}
          onSubmit={(reason) => mutation.mutate(reason || undefined)}
          onCancel={() => setOpen(false)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/features/users/__tests__/request-new-id-button.test.tsx`
Expected: 3 passed. If the failure test can't find `Couldn’t request a new ID`, check how `ToastProvider` renders titles in `src/components/ui/toast*.tsx` and query that text.

- [ ] **Step 6: Wire it into the nanny page**

In `apps/admin/src/pages/nanny-detail-page.tsx`, import `RequestNewIdButton` from `@admin/features/users/request-new-id-button` and add `invalidateNannyId` to the `@admin/lib/api` import. Change `<Card title="Application">` to:

```tsx
<Card
  title="Application"
  action={
    canManage && (nanny.idDocumentFrontUrl || nanny.idDocumentBackUrl) ? (
      <RequestNewIdButton
        name={nanny.name}
        consequence="Until it's approved she won't appear to parents or get new bookings."
        request={(reason) => invalidateNannyId(id, reason)}
        onDone={invalidate}
      />
    ) : undefined
  }
>
```

- [ ] **Step 7: Wire it into the mother page**

In `apps/admin/src/pages/mother-detail-page.tsx`, import `RequestNewIdButton` and add `invalidateMotherId` to the api import. In `actions`, right after the `View ID` button block:

```tsx
{canManage && hasId && (
  <RequestNewIdButton
    name={mother.name}
    consequence="Until it's approved she can't book care."
    request={(reason) => invalidateMotherId(id, reason)}
    onDone={invalidate}
  />
)}
```

- [ ] **Step 8: Run the admin checks**

Run from `apps/admin`: `pnpm typecheck` and then `npx vitest run`
Expected: typecheck prints no `error TS`, and all test files pass.

- [ ] **Step 9: Add the E2E case**

Append this to `apps/admin/e2e/b05-users-and-id-review.spec.ts`:

```ts
test('requesting a new ID sends an approved nanny back to Awaiting ID', async ({ page }) => {
  const admin = await superuserToken();
  const nanny = await seedPendingNanny();

  await openTab(page, 'Nannies');
  await rowFor(page, nanny.surname).click();
  await page.getByRole('button', { name: 'Approve nanny' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Nanny approved' })).toBeVisible();
  const nannyProfileId = Number(page.url().split('/').pop());

  await page.getByRole('button', { name: 'Request new ID' }).click();
  await page.getByLabel(/^Reason/).fill('Photo is blurry.');
  await page.getByRole('button', { name: 'Delete ID and ask again' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'New ID requested' })).toBeVisible();

  // The page re-renders without a reload: no photos, no button to repeat it.
  await expect(page.getByText('No ID uploaded yet.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Request new ID' })).toHaveCount(0);

  const approval = await getNannyApproval(admin, nannyProfileId);
  expect(approval.approvalStatus).toBe('PENDING_ID');
  expect(approval.rejectionReason).toBe('Photo is blurry.');
});
```

Run `pnpm typecheck` again; it also covers `tsconfig.e2e.json`. Running the spec itself needs the test stack (`pnpm test:env` plus `pnpm --filter=@nanny-app/backend start:test`). If the stack isn't available, record that the spec was typechecked but not run.

- [ ] **Step 10: Commit**

```bash
git add apps/admin/src/lib/api.ts apps/admin/src/features/users/request-new-id-button.tsx apps/admin/src/features/users/__tests__/request-new-id-button.test.tsx apps/admin/src/pages/nanny-detail-page.tsx apps/admin/src/pages/mother-detail-page.tsx apps/admin/e2e/b05-users-and-id-review.spec.ts
git commit -m "Add Request new ID to the nanny and mother pages"
```

---

### Task 3: Mobile: move a nanny out as soon as her ID is sent back

**Files:**
- Create: `apps/mobile/src/lib/nannyStatusRoute.ts`
- Create: `apps/mobile/src/lib/__tests__/nannyStatusRoute.test.ts`
- Modify: `apps/mobile/src/hooks/useRootGate.ts:77-91` (use the shared mapping)
- Create: `apps/mobile/src/hooks/useNannyAccessGuard.ts`
- Create: `apps/mobile/src/hooks/__tests__/useNannyAccessGuard.test.tsx`
- Modify: `apps/mobile/app/(nanny)/_layout.tsx` (call the guard)
- Modify: `apps/mobile/src/hooks/usePushNotifications.ts` (`isAccountStatusPush` plus refetch)
- Modify: `apps/mobile/src/hooks/__tests__/usePushNotifications.routing.test.ts`
- Modify: `apps/mobile/src/lib/notificationUtils.ts` (`nanny_rejected` icon case)

**Interfaces:**
- Consumes: the push `data.type` values `id_reupload_requested`, `nanny_rejected`, `nanny_approved`, `id_rejected` and `id_approved`, produced by the backend.
- Produces:
  - `nannyStatusRoute(status: ApprovalStatus | null | undefined): Href`
  - `useNannyAccessGuard(): void`
  - `isAccountStatusPush(data?: Record<string, string>): boolean`

- [ ] **Step 1: Write the failing mapping test**

`apps/mobile/src/lib/__tests__/nannyStatusRoute.test.ts`:

```ts
import { nannyStatusRoute } from '@mobile/lib/nannyStatusRoute';

describe('nannyStatusRoute', () => {
  it.each([
    ['APPROVED', '/(nanny)/dashboard'],
    ['PENDING_ID', '/(auth)/upload-id'],
    ['REJECTED', '/(auth)/upload-id'],
    ['PENDING_REVIEW', '/(auth)/pending-review'],
    [null, '/(auth)/pending-review'],
  ] as const)('%s → %s', (status, href) => {
    expect(nannyStatusRoute(status)).toBe(href);
  });
});
```

Run from `apps/mobile`: `npx jest src/lib/__tests__/nannyStatusRoute.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 2: Extract the mapping and use it in the root gate**

`apps/mobile/src/lib/nannyStatusRoute.ts`:

```ts
import type { Href } from 'expo-router';

import { ApprovalStatus } from '@shared/auth';

/**
 * Where a nanny belongs for her approval status. Nannies are approved by an
 * admin before they can use the app: a missing ID (PENDING_ID) or a rejected
 * application (REJECTED) forces a re-upload, an uploaded one (PENDING_REVIEW)
 * waits, and APPROVED lets her in. Shared by the launch gate and the in-app
 * guard so the two can't disagree.
 */
export function nannyStatusRoute(status: ApprovalStatus | null | undefined): Href {
  switch (status) {
    case ApprovalStatus.APPROVED:
      return '/(nanny)/dashboard';
    case ApprovalStatus.PENDING_ID:
    case ApprovalStatus.REJECTED:
      return '/(auth)/upload-id';
    default:
      return '/(auth)/pending-review';
  }
}
```

In `useRootGate.ts`, replace the whole `if (profile.role === Role.NANNY) { switch … }` block with:

```ts
    if (profile.role === Role.NANNY) {
      return { kind: 'redirect', href: nannyStatusRoute(profile.approvalStatus) };
    }
```

Then add `import { nannyStatusRoute } from '@mobile/lib/nannyStatusRoute';`. Remove `ApprovalStatus` from the `@shared/auth` import if nothing else in the file uses it.

Run: `npx jest src/lib/__tests__/nannyStatusRoute.test.ts src/hooks/__tests__/useRootGate.test.tsx`
Expected: all pass. The root gate's existing nanny cases pin the unchanged behaviour.

- [ ] **Step 3: Write the failing guard test**

`apps/mobile/src/hooks/__tests__/useNannyAccessGuard.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';
import type { UserResponse } from '@nanny-app/shared';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));

import { useNannyAccessGuard } from '@mobile/hooks/useNannyAccessGuard';
import { useUserProfileStore } from '@mobile/store/userProfileStore';

function nanny(approvalStatus: string): UserResponse {
  return { role: 'NANNY', approvalStatus } as unknown as UserResponse;
}

function setup() {
  const client = new QueryClient();
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  renderHook(() => useNannyAccessGuard(), { wrapper });
  return { invalidate };
}

beforeEach(() => {
  jest.clearAllMocks();
  useUserProfileStore.getState().setProfile(nanny('APPROVED'));
});

describe('useNannyAccessGuard', () => {
  it('leaves an approved nanny where she is', () => {
    setup();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('sends her to Upload ID as soon as her ID is sent back', () => {
    setup();
    act(() => useUserProfileStore.getState().setProfile(nanny('PENDING_ID')));
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/upload-id');
  });

  it('does nothing while signed out', () => {
    useUserProfileStore.getState().setProfile(null);
    setup();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('re-checks her status when the app returns to the foreground', () => {
    const listeners: ((state: string) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, cb) => {
      listeners.push(cb as (state: string) => void);
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    const { invalidate } = setup();

    act(() => listeners.forEach((cb) => cb('active')));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['auth', 'me'] });
  });
});
```

Run: `npx jest src/hooks/__tests__/useNannyAccessGuard.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 4: Write the guard and mount it**

`apps/mobile/src/hooks/useNannyAccessGuard.ts`:

```ts
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { nannyStatusRoute } from '@mobile/lib/nannyStatusRoute';
import { useUserProfileStore } from '@mobile/store/userProfileStore';
import { ApprovalStatus, Role } from '@shared/auth';

/**
 * Keeps a nanny inside the nanny screens only while she is APPROVED. The
 * launch gate decides once; an admin can send her ID back while she's in the
 * app, so this watches the profile and moves her the moment it changes. It
 * also re-reads `/auth/me` when the app comes back to the foreground — the
 * push that announces the change may have been missed.
 */
export function useNannyAccessGuard(): void {
  const router = useRouter();
  const queryClient = useQueryClient();
  const profile = useUserProfileStore((s) => s.profile);
  const status = profile?.role === Role.NANNY ? profile.approvalStatus : null;

  useEffect(() => {
    if (status && status !== ApprovalStatus.APPROVED) {
      router.replace(nannyStatusRoute(status));
    }
  }, [status, router]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    });
    return () => subscription.remove();
  }, [queryClient]);
}
```

In `apps/mobile/app/(nanny)/_layout.tsx`, add `import { useNannyAccessGuard } from '@mobile/hooks/useNannyAccessGuard';` and call `useNannyAccessGuard();` as the first line of `NannyLayout`.

Run: `npx jest src/hooks/__tests__/useNannyAccessGuard.test.tsx`
Expected: 4 passed.

- [ ] **Step 5: Refetch the profile on status pushes (test first)**

Append to `apps/mobile/src/hooks/__tests__/usePushNotifications.routing.test.ts` (and add `isAccountStatusPush` to its import):

```ts
describe('isAccountStatusPush', () => {
  it.each(['id_reupload_requested', 'nanny_rejected', 'nanny_approved', 'id_rejected', 'id_approved'])(
    'matches %s',
    (type) => {
      expect(isAccountStatusPush({ type })).toBe(true);
    },
  );

  it('matches the enum-cased type defensively', () => {
    expect(isAccountStatusPush({ type: 'NANNY_REJECTED' })).toBe(true);
  });

  it('is false for other types and missing data', () => {
    expect(isAccountStatusPush({ type: 'booking_completed' })).toBe(false);
    expect(isAccountStatusPush(undefined)).toBe(false);
  });
});
```

Run: `npx jest src/hooks/__tests__/usePushNotifications.routing.test.ts`
Expected: FAIL, `isAccountStatusPush` is not exported.

In `usePushNotifications.ts`, add next to `isBookingCompletedPush`:

```ts
const ACCOUNT_STATUS_PUSHES = new Set([
  'id_reupload_requested',
  'nanny_rejected',
  'nanny_approved',
  'id_rejected',
  'id_approved',
]);

/** A push that changed her approval status — the profile must be re-read. */
export function isAccountStatusPush(data?: Record<string, string>): boolean {
  const type = data?.['type']?.toLowerCase();
  return type !== undefined && ACCOUNT_STATUS_PUSHES.has(type);
}
```

Then refetch on it in two places:
- In `navigateFromNotification`, as its first statement, before any early return.
- In the `messaging.onMessage` callback, next to the `isBookingCompletedPush` check.

```ts
  if (isAccountStatusPush(data)) {
    void queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
  }
```

In `onMessage` the variable is `message.data`, not `data`. `useMe` is mounted in `app/_layout.tsx`, so the invalidation refetches, and the guard from Step 4 then moves a nanny out.

Run: `npx jest src/hooks/__tests__/usePushNotifications.routing.test.ts`
Expected: all pass.

- [ ] **Step 6: Give the in-app notification an icon**

In `apps/mobile/src/lib/notificationUtils.ts`, before `default:` in `getNotificationIcon`:

```ts
    case 'nanny_rejected':
      return {
        name: 'id-card',
        backgroundColor: colors.errorLight,
        iconColor: colors.error,
      };
```

This covers both "Request new ID" and reject, since both use the `nanny_rejected` in-app type. This corrects the spec, which keyed the icon on the push type. `id-card` is an Ionicons glyph; typecheck in Step 7 confirms it against `Ionicons.glyphMap`.

- [ ] **Step 7: Run the mobile checks**

Run from `apps/mobile`: `npx tsc --noEmit` and then `npx jest`
Expected: tsc shows at most the one pre-existing error in `src/preview-entry-generated.tsx` (missing `AccountActionsPreview`), which also fails on clean `main`. All jest suites pass.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/lib/nannyStatusRoute.ts apps/mobile/src/lib/__tests__/nannyStatusRoute.test.ts apps/mobile/src/hooks/useRootGate.ts apps/mobile/src/hooks/useNannyAccessGuard.ts apps/mobile/src/hooks/__tests__/useNannyAccessGuard.test.tsx "apps/mobile/app/(nanny)/_layout.tsx" apps/mobile/src/hooks/usePushNotifications.ts apps/mobile/src/hooks/__tests__/usePushNotifications.routing.test.ts apps/mobile/src/lib/notificationUtils.ts
git commit -m "Move a nanny to Upload ID as soon as her ID is sent back"
```

---

### Task 4: Ship

- [ ] **Step 1:** From the repo root, run `pnpm --filter @nanny-app/shared exec tsc --noEmit` and all three unit suites (backend `npx jest --selectProjects unit`, admin `npx vitest run`, mobile `npx jest`). All must pass.
- [ ] **Step 2:** Run `git branch --show-current`. The work belongs on a `feat/admin-request-new-id` branch, merged with `--no-ff` into `main`. Before pushing, run `gh auth switch -u mark-aigorithm`, then `git push origin main`.
- [ ] **Step 3:** Tell the user:
  - Backend and admin go live on the Vercel deploy.
  - The mobile guard needs a new app build (no EAS Update). Until then a nanny is redirected on her next launch.
  - Whether the b05 E2E case was run or only typechecked.
