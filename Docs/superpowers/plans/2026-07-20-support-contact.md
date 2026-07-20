# Support Contact Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin configure a support WhatsApp number, phone number, and email, and surface each configured channel as a tappable card on the parent support screen.

**Architecture:** Support contact is its own concern, sharing only the existing `app_settings` key-value table with `PlatformConfig`. A new shared Zod domain file defines the schema and a `whatsappLink` helper; a new backend service reads/writes the three keys as raw strings; admin edits through `GET/PUT /admin/support-contact`; mobile reads a separate `requireAuth`-only `GET /support/contact`. `PlatformConfig` and its numeric `parseFloat` loop — which prices bookings — are not touched.

**Tech Stack:** Zod 3, Prisma, Express, TanStack Query v5, React 19 + Vite (admin), Expo React Native (mobile), Jest.

## Global Constraints

- **No `any`.** Use `unknown` + a type guard, or fix the real type.
- **Types are inferred from Zod schemas** in `packages/shared`. Never duplicate a type definition.
- **Use `import type`** for type-only imports.
- **Zod version is 3.x** — write `z.string().email()`, not `z.email()`.
- **Empty string means "not configured"** for all three fields. Defaults are empty. Never seed a placeholder number.
- **Backend:** no business logic in routes; services are the only layer touching Prisma; all responses use the `ok()` envelope from `@backend/lib/api-response`.
- **Soft deletes:** every `app_settings` read filters `deletedAt: null`; every write sets `deletedAt: null`.
- **Mobile theme:** never hardcode hex colors, font family strings, or shadows. Use `colors.*`, `fontFamily.*`, `spacing.*`, `borderRadius.*` from `@mobile/theme`. Do not invent new color tokens — reuse existing ones.
- **Mobile styles** live in `screens/parent/styles/customer-support-screen.styles.ts`, never inline in the screen file.
- **`packages/shared` and `apps/admin` have no test runner.** Shared schema/helper behavior is tested from the backend Jest suite (the backend imports `@nanny-app/shared`). Admin changes are verified by `typecheck` + `lint` only.
- **Coverage threshold is 80%** in backend and mobile, enforced in CI.

---

### Task 1: Shared schema and `whatsappLink` helper

**Files:**
- Create: `packages/shared/src/support.ts`
- Modify: `packages/shared/src/index.ts` (append one export line)
- Test: `apps/backend/src/__tests__/support-contact.schema.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `SupportContactSchema`, `type SupportContact = { whatsappNumber: string; phoneNumber: string; email: string }`
  - `UpdateSupportContactSchema`, `type UpdateSupportContactInput = Partial<SupportContact>`
  - `normalizePhone(value: string): string`
  - `whatsappLink(number: string): string`

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/__tests__/support-contact.schema.test.ts`:

```ts
import {
  SupportContactSchema,
  UpdateSupportContactSchema,
  normalizePhone,
  whatsappLink,
} from '@nanny-app/shared';

describe('normalizePhone', () => {
  it('strips spaces and dashes but keeps a leading +', () => {
    expect(normalizePhone('+20 100 123-4567')).toBe('+201001234567');
  });

  it('leaves an already-normalized number alone', () => {
    expect(normalizePhone('+201001234567')).toBe('+201001234567');
  });

  it('trims surrounding whitespace and returns empty for a blank value', () => {
    expect(normalizePhone('   ')).toBe('');
  });
});

describe('whatsappLink', () => {
  it('builds a wa.me URL from digits only, dropping the + and separators', () => {
    expect(whatsappLink('+20 100 123-4567')).toBe('https://wa.me/201001234567');
  });
});

describe('SupportContactSchema', () => {
  it('accepts a fully configured contact', () => {
    const parsed = SupportContactSchema.safeParse({
      whatsappNumber: '+201001234567',
      phoneNumber: '+20 100 123-4567',
      email: 'support@nannynow.com',
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts empty strings so an admin can retire a channel', () => {
    const parsed = SupportContactSchema.safeParse({
      whatsappNumber: '',
      phoneNumber: '',
      email: '',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a number with too few digits', () => {
    expect(SupportContactSchema.safeParse({
      whatsappNumber: '12345',
      phoneNumber: '',
      email: '',
    }).success).toBe(false);
  });

  it('rejects a number with letters in it', () => {
    expect(SupportContactSchema.safeParse({
      whatsappNumber: '+2010012345ab',
      phoneNumber: '',
      email: '',
    }).success).toBe(false);
  });

  it('rejects a malformed email', () => {
    expect(SupportContactSchema.safeParse({
      whatsappNumber: '',
      phoneNumber: '',
      email: 'not-an-email',
    }).success).toBe(false);
  });
});

describe('UpdateSupportContactSchema', () => {
  it('accepts a partial payload touching one channel', () => {
    const parsed = UpdateSupportContactSchema.safeParse({ phoneNumber: '+201001234567' });
    expect(parsed.success).toBe(true);
  });

  it('still validates the fields that are present', () => {
    expect(UpdateSupportContactSchema.safeParse({ email: 'nope' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/backend && pnpm test support-contact.schema
```

Expected: FAIL — `Module '"@nanny-app/shared"' has no exported member 'SupportContactSchema'`.

- [ ] **Step 3: Write the implementation**

Create `packages/shared/src/support.ts`:

```ts
import { z } from 'zod';

// ──────────────────────────────────────────────────────────────
// Support contact — the WhatsApp number, phone number, and email
// address parents use to reach support. Stored in app_settings and
// edited by admins, so operations can change a line without a
// mobile release. An empty string means "not configured": the app
// hides that channel rather than showing a dead button.
// ──────────────────────────────────────────────────────────────

/** Optional leading '+', then 7–15 digits, once spaces and dashes are stripped. */
const PHONE_PATTERN = /^\+?\d{7,15}$/;

/**
 * Canonical storage form for a phone number: whitespace and dashes removed,
 * a leading '+' preserved. Admins can paste a number in any readable format;
 * this is what lands in the DB, so readers never have to normalize.
 */
export function normalizePhone(value: string): string {
  return value.replace(/[\s-]/g, '').trim();
}

/**
 * WhatsApp click-to-chat URL. wa.me wants bare digits — no '+', no
 * separators. The https form (rather than the whatsapp:// scheme) degrades
 * to the browser or app store when WhatsApp is not installed, instead of
 * failing silently.
 */
export function whatsappLink(number: string): string {
  return `https://wa.me/${number.replace(/\D/g, '')}`;
}

/** Accepts a valid phone number or an empty string (channel disabled). */
const supportPhone = z
  .string()
  .refine((v) => v === '' || PHONE_PATTERN.test(normalizePhone(v)), {
    message: 'Enter a valid phone number, or leave blank to hide this channel.',
  });

export const SupportContactSchema = z.object({
  /** WhatsApp line, in any readable format. '' hides the WhatsApp card. */
  whatsappNumber: supportPhone,
  /** Voice line for the "Call support" card. '' hides it. */
  phoneNumber: supportPhone,
  /** Support inbox for the "Email support" card. '' hides it. */
  email: z.union([z.literal(''), z.string().email()]),
});
export type SupportContact = z.infer<typeof SupportContactSchema>;

/** Partial update payload — an admin may edit one channel at a time. */
export const UpdateSupportContactSchema = SupportContactSchema.partial();
export type UpdateSupportContactInput = z.infer<typeof UpdateSupportContactSchema>;
```

Then append to `packages/shared/src/index.ts` (after the final `export * from './referrals';` line):

```ts
export * from './support';
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/backend && pnpm test support-contact.schema
```

Expected: PASS, 11 tests.

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter @nanny-app/shared typecheck && pnpm --filter @nanny-app/shared lint
```

Expected: exit 0, no output.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/support.ts packages/shared/src/index.ts apps/backend/src/__tests__/support-contact.schema.test.ts
git commit -m "Add shared support contact schema"
```

---

### Task 2: Backend support contact service

**Files:**
- Create: `apps/backend/src/services/support-contact.service.ts`
- Test: `apps/backend/src/__tests__/support-contact.service.test.ts`

**Interfaces:**
- Consumes: `SupportContact`, `UpdateSupportContactInput`, `normalizePhone` from Task 1.
- Produces:
  - `getSupportContact(): Promise<SupportContact>`
  - `updateSupportContact(input: UpdateSupportContactInput): Promise<SupportContact>`

Storage keys: `support_whatsapp_number`, `support_phone_number`, `support_email`. No migration — these are rows in the existing `app_settings` table.

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/__tests__/support-contact.service.test.ts`:

```ts
jest.mock('@backend/db/prisma', () => {
  const appSettings = {
    findMany: jest.fn(),
    upsert: jest.fn(),
  };
  return {
    prisma: {
      appSettings,
      $transaction: jest.fn(async (arg: unknown) =>
        Array.isArray(arg) ? Promise.all(arg) : (arg as () => unknown)(),
      ),
    },
  };
});

import { prisma } from '@backend/db/prisma';
import {
  getSupportContact,
  updateSupportContact,
} from '@backend/services/support-contact.service';

const mockPrisma = prisma as unknown as {
  appSettings: { findMany: jest.Mock; upsert: jest.Mock };
  $transaction: jest.Mock;
};

/** app_settings rows as the DB would return them. */
const rows = (values: Record<string, string>) =>
  Object.entries(values).map(([key, value]) => ({ key, value }));

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.appSettings.findMany.mockResolvedValue([]);
});

describe('getSupportContact', () => {
  it('returns empty strings when nothing is seeded, so no card renders', async () => {
    await expect(getSupportContact()).resolves.toEqual({
      whatsappNumber: '',
      phoneNumber: '',
      email: '',
    });
  });

  it('returns seeded values', async () => {
    mockPrisma.appSettings.findMany.mockResolvedValue(
      rows({
        support_whatsapp_number: '+201001234567',
        support_phone_number: '+201009999999',
        support_email: 'support@nannynow.com',
      }),
    );
    await expect(getSupportContact()).resolves.toEqual({
      whatsappNumber: '+201001234567',
      phoneNumber: '+201009999999',
      email: 'support@nannynow.com',
    });
  });

  it('filters out soft-deleted rows', async () => {
    await getSupportContact();
    expect(mockPrisma.appSettings.findMany).toHaveBeenCalledWith({
      where: {
        key: { in: ['support_whatsapp_number', 'support_phone_number', 'support_email'] },
        deletedAt: null,
      },
    });
  });
});

describe('updateSupportContact', () => {
  it('writes only the fields provided', async () => {
    await updateSupportContact({ phoneNumber: '+201001234567' });
    expect(mockPrisma.appSettings.upsert).toHaveBeenCalledTimes(1);
    expect(mockPrisma.appSettings.upsert).toHaveBeenCalledWith({
      where: { key: 'support_phone_number' },
      create: { key: 'support_phone_number', value: '+201001234567' },
      update: { value: '+201001234567', deletedAt: null },
    });
  });

  it('normalizes a number before storing it', async () => {
    await updateSupportContact({ whatsappNumber: '+20 100 123-4567' });
    expect(mockPrisma.appSettings.upsert).toHaveBeenCalledWith({
      where: { key: 'support_whatsapp_number' },
      create: { key: 'support_whatsapp_number', value: '+201001234567' },
      update: { value: '+201001234567', deletedAt: null },
    });
  });

  it('trims but does not strip dashes from an email', async () => {
    await updateSupportContact({ email: '  help-desk@nannynow.com ' });
    expect(mockPrisma.appSettings.upsert).toHaveBeenCalledWith({
      where: { key: 'support_email' },
      create: { key: 'support_email', value: 'help-desk@nannynow.com' },
      update: { value: 'help-desk@nannynow.com', deletedAt: null },
    });
  });

  it('accepts an empty string, blanking a channel', async () => {
    await updateSupportContact({ whatsappNumber: '' });
    expect(mockPrisma.appSettings.upsert).toHaveBeenCalledWith({
      where: { key: 'support_whatsapp_number' },
      create: { key: 'support_whatsapp_number', value: '' },
      update: { value: '', deletedAt: null },
    });
  });

  it('ignores undefined fields rather than blanking them', async () => {
    await updateSupportContact({ phoneNumber: '+201001234567', email: undefined });
    expect(mockPrisma.appSettings.upsert).toHaveBeenCalledTimes(1);
  });

  it('writes atomically and returns the full resulting contact', async () => {
    mockPrisma.appSettings.findMany.mockResolvedValue(
      rows({ support_phone_number: '+201001234567' }),
    );
    await expect(updateSupportContact({ phoneNumber: '+201001234567' })).resolves.toEqual({
      whatsappNumber: '',
      phoneNumber: '+201001234567',
      email: '',
    });
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/backend && pnpm test support-contact.service
```

Expected: FAIL — `Cannot find module '@backend/services/support-contact.service'`.

- [ ] **Step 3: Write the implementation**

Create `apps/backend/src/services/support-contact.service.ts`:

```ts
import { normalizePhone } from '@nanny-app/shared';
import type { SupportContact, UpdateSupportContactInput } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';

const KEYS = {
  WHATSAPP_NUMBER: 'support_whatsapp_number',
  PHONE_NUMBER: 'support_phone_number',
  EMAIL: 'support_email',
} as const;

/**
 * Empty means "not configured" — the app hides that channel. Defaults are
 * blank on purpose: a placeholder number would render a card that dials a
 * line nobody answers, which is worse than no card at all.
 */
const DEFAULTS: SupportContact = {
  whatsappNumber: '',
  phoneNumber: '',
  email: '',
};

/** Maps each SupportContact field to its app_settings key. */
const FIELD_TO_KEY: Record<keyof SupportContact, string> = {
  whatsappNumber: KEYS.WHATSAPP_NUMBER,
  phoneNumber: KEYS.PHONE_NUMBER,
  email: KEYS.EMAIL,
};

/**
 * Values are read as raw strings. Unlike getPlatformConfig, there is no
 * numeric parsing here — that loop is what keeps PlatformConfig numeric, and
 * it is why support contact lives in its own service.
 */
export async function getSupportContact(): Promise<SupportContact> {
  const rows = await prisma.appSettings.findMany({
    where: { key: { in: Object.values(FIELD_TO_KEY) }, deletedAt: null },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));

  const contact = { ...DEFAULTS };
  for (const field of Object.keys(FIELD_TO_KEY) as (keyof SupportContact)[]) {
    const raw = byKey.get(FIELD_TO_KEY[field]);
    if (raw !== undefined) contact[field] = raw;
  }
  return contact;
}

/**
 * Upserts the provided channels and returns the resulting full contact.
 * Numbers are normalized on the way in so one stored value serves both the
 * `tel:` and `wa.me` forms. There are no cross-field rules, so unlike
 * updatePlatformConfig there is no coherence guard.
 */
export async function updateSupportContact(
  input: UpdateSupportContactInput,
): Promise<SupportContact> {
  const writes = (Object.keys(input) as (keyof SupportContact)[])
    .filter((field) => input[field] !== undefined)
    .map((field) => {
      const key = FIELD_TO_KEY[field];
      const raw = input[field] as string;
      const value = field === 'email' ? raw.trim() : normalizePhone(raw);
      return prisma.appSettings.upsert({
        where: { key },
        create: { key, value },
        update: { value, deletedAt: null },
      });
    });

  await prisma.$transaction(writes);
  return getSupportContact();
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/backend && pnpm test support-contact
```

Expected: PASS — both the schema and service suites, 20 tests total.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/support-contact.service.ts apps/backend/src/__tests__/support-contact.service.test.ts
git commit -m "Add support contact service"
```

---

### Task 3: Backend routes

**Files:**
- Create: `apps/backend/src/routes/support.routes.ts`
- Modify: `apps/backend/src/routes/index.ts` (import + mount)
- Modify: `apps/backend/src/routes/admin.routes.ts` (two routes, next to the existing `/config` handlers)

**Interfaces:**
- Consumes: `getSupportContact`, `updateSupportContact` from Task 2; `UpdateSupportContactSchema` from Task 1.
- Produces:
  - `GET /support/contact` (`requireAuth`) → `ok(SupportContact)`
  - `GET /admin/support-contact` (`requireAuth, requireAdmin`) → `ok(SupportContact)`
  - `PUT /admin/support-contact` (`requireAuth, requireAdmin`) → `ok(SupportContact)`
  - exports `supportRouter`

There is no route-level test suite in this codebase — routes are thin and the service is covered in Task 2. Verification here is typecheck plus a manual curl.

- [ ] **Step 1: Create the mobile-facing router**

Create `apps/backend/src/routes/support.routes.ts`:

```ts
import { Router, type NextFunction, type Request, type Response } from 'express';

import { ok } from '@backend/lib/api-response';
import { requireAuth } from '@backend/middleware/auth.middleware';
import { getSupportContact } from '@backend/services/support-contact.service';

export const supportRouter = Router();

supportRouter.use(requireAuth);

// A narrow, non-admin projection of the support contact settings, following
// the GET /bookings/options precedent — the app never reads an /admin route.
supportRouter.get('/contact', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(ok(await getSupportContact()));
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 2: Mount it**

In `apps/backend/src/routes/index.ts`, add the import alongside the others (keep alphabetical-ish grouping — put it after `rewardRouter`):

```ts
import { supportRouter } from './support.routes';
```

and add the mount after the `apiRouter.use('/rewards', rewardRouter);` line:

```ts
apiRouter.use('/support', supportRouter);
```

- [ ] **Step 3: Add the admin routes**

In `apps/backend/src/routes/admin.routes.ts`, add to the existing service import block:

```ts
import {
  getSupportContact,
  updateSupportContact,
} from '@backend/services/support-contact.service';
```

and add `UpdateSupportContactSchema` to the existing `@nanny-app/shared` import.

Then add these two routes immediately after the existing `adminRouter.put('/config', …)` handler:

```ts
adminRouter.get('/support-contact', async (_req, res, next) => {
  try {
    res.json(ok(await getSupportContact()));
  } catch (err) {
    next(err);
  }
});

adminRouter.put(
  '/support-contact',
  validateBody(UpdateSupportContactSchema),
  async (req, res, next) => {
    try {
      res.json(ok(await updateSupportContact(req.body)));
    } catch (err) {
      next(err);
    }
  },
);
```

- [ ] **Step 4: Verify it compiles and the suite still passes**

```bash
cd apps/backend && pnpm typecheck && pnpm lint && pnpm test
```

Expected: exit 0 on all three; the full backend suite green.

- [ ] **Step 5: Smoke test the endpoint**

Start the backend (`cd apps/backend && pnpm dev`), then with a valid Firebase ID token:

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/support/contact
```

Expected: `{"data":{"whatsappNumber":"","phoneNumber":"","email":""},"error":null}` on a fresh DB.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/routes/support.routes.ts apps/backend/src/routes/index.ts apps/backend/src/routes/admin.routes.ts
git commit -m "Add support contact routes"
```

---

### Task 4: Admin settings section

**Files:**
- Modify: `apps/admin/src/lib/api.ts` (two functions + two type imports)
- Modify: `apps/admin/src/pages/settings-page.tsx` (new Card with its own query/state/mutation)

**Interfaces:**
- Consumes: `SupportContact`, `UpdateSupportContactInput`, `UpdateSupportContactSchema` from Task 1; the endpoints from Task 3.
- Produces: `fetchSupportContact()`, `updateSupportContact(input)` in `@admin/lib/api`.

`apps/admin` has no test runner. Verification is typecheck + lint + a manual browser check.

Note the naming collision: `@admin/lib/api` already exports `updatePlatformConfig`, and the new function is `updateSupportContact` — no clash. But `settings-page.tsx` will now hold two mutations; keep the existing one named `saveMutation` and name the new one `saveSupportMutation` so they stay distinguishable.

- [ ] **Step 1: Add the API functions**

In `apps/admin/src/lib/api.ts`, add to the existing `import type { … } from '@nanny-app/shared';` block (alphabetical position):

```ts
  SupportContact,
  UpdateSupportContactInput,
```

Then add, immediately after the existing `updatePlatformConfig` function:

```ts
export async function fetchSupportContact(): Promise<SupportContact> {
  const res = await apiClient.get<ApiEnvelope<SupportContact>>('/admin/support-contact');
  return res.data.data;
}

export async function updateSupportContact(
  input: UpdateSupportContactInput,
): Promise<SupportContact> {
  const res = await apiClient.put<ApiEnvelope<SupportContact>>('/admin/support-contact', input);
  return res.data.data;
}
```

- [ ] **Step 2: Extend the settings page imports**

In `apps/admin/src/pages/settings-page.tsx`, change the shared import to:

```tsx
import {
  bookingWindowLengthHours,
  UpdatePlatformConfigSchema,
  UpdateSupportContactSchema,
} from '@nanny-app/shared';
```

and the api import to:

```tsx
import {
  fetchPlatformConfig,
  fetchSupportContact,
  updatePlatformConfig,
  updateSupportContact,
} from '@admin/lib/api';
```

- [ ] **Step 3: Add the support contact field definitions**

In the same file, add after the `MATCHING_FIELDS` array:

```tsx
type SupportKey = 'whatsappNumber' | 'phoneNumber' | 'email';

type SupportField = {
  key: SupportKey;
  label: string;
  hint: string;
  type: 'tel' | 'email';
  placeholder: string;
};

const SUPPORT_FIELDS: SupportField[] = [
  {
    key: 'whatsappNumber',
    label: 'Support WhatsApp number',
    hint: 'Opens a WhatsApp chat from the app’s help screen. Include the country code. Leave blank to hide the WhatsApp option.',
    type: 'tel',
    placeholder: '+20 100 123 4567',
  },
  {
    key: 'phoneNumber',
    label: 'Support phone number',
    hint: 'Dialled when a parent taps “Call support”. Include the country code. Leave blank to hide the call option.',
    type: 'tel',
    placeholder: '+20 100 123 4567',
  },
  {
    key: 'email',
    label: 'Support email',
    hint: 'Opens a pre-addressed email from the app’s help screen. Leave blank to hide the email option.',
    type: 'email',
    placeholder: 'support@nannynow.com',
  },
];
```

- [ ] **Step 4: Add the query, form state, and mutation**

Inside `SettingsPage`, after the existing `saveMutation` declaration:

```tsx
  const {
    data: support,
    isLoading: supportLoading,
    error: supportError,
    refetch: refetchSupport,
    isFetching: supportFetching,
  } = useQuery({
    queryKey: ['support-contact'],
    queryFn: fetchSupportContact,
  });

  const [supportForm, setSupportForm] = useState<Record<SupportKey, string> | null>(null);
  const [supportFormError, setSupportFormError] = useState<string | null>(null);

  useEffect(() => {
    if (support && supportForm === null) {
      setSupportForm({
        whatsappNumber: support.whatsappNumber,
        phoneNumber: support.phoneNumber,
        email: support.email,
      });
    }
  }, [support, supportForm]);

  const saveSupportMutation = useMutation({
    mutationFn: updateSupportContact,
    onSuccess: (updated) => {
      queryClient.setQueryData(['support-contact'], updated);
      setSupportFormError(null);
      toast.success('Support contact saved', 'Parents see the change the next time they open help.');
    },
    onError: (err) => toast.error('Couldn’t save support contact', apiErrorMessage(err)),
  });

  function handleSupportSubmit(event: FormEvent) {
    event.preventDefault();
    if (!supportForm) return;
    const parsed = UpdateSupportContactSchema.safeParse(supportForm);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setSupportFormError(issue ? `${issue.path.join('.')}: ${issue.message}` : 'Invalid input');
      return;
    }
    setSupportFormError(null);
    saveSupportMutation.mutate(parsed.data);
  }
```

- [ ] **Step 5: Render the card**

In the same file's returned JSX, add immediately before the closing `</section>`:

```tsx
      {supportLoading && (
        <Card>
          <LoadingState label="Loading support contact…" />
        </Card>
      )}
      {supportError != null && (
        <ErrorState
          message={apiErrorMessage(supportError)}
          onRetry={() => void refetchSupport()}
          retrying={supportFetching}
        />
      )}
      {supportForm && (
        <Card>
          <form onSubmit={handleSupportSubmit}>
            <h2 className="form-section-title">Support contact</h2>
            <div className="form-grid">
              {SUPPORT_FIELDS.map((field) => (
                <Field key={field.key} label={field.label} hint={field.hint}>
                  <input
                    type={field.type}
                    placeholder={field.placeholder}
                    value={supportForm[field.key]}
                    onChange={(e) =>
                      setSupportForm({ ...supportForm, [field.key]: e.target.value })
                    }
                  />
                </Field>
              ))}
            </div>
            {supportFormError && <Feedback tone="error">{supportFormError}</Feedback>}
            <Button type="submit" disabled={saveSupportMutation.isPending}>
              {saveSupportMutation.isPending ? 'Saving…' : 'Save support contact'}
            </Button>
          </form>
        </Card>
      )}
```

Note: these inputs are deliberately **not** `required` — blank is a valid value meaning "hide this channel".

- [ ] **Step 6: Verify**

```bash
pnpm --filter admin typecheck && pnpm --filter admin lint
```

Expected: exit 0 on both.

Then run `pnpm --filter admin dev`, open `/settings`, and confirm: the Support contact card renders below Matching & SLA; saving a number shows the success toast; entering `not-an-email` in the email field shows an inline error and does not submit; clearing a field and saving persists the blank.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/lib/api.ts apps/admin/src/pages/settings-page.tsx
git commit -m "Add support contact section to admin settings"
```

---

### Task 5: Mobile hook and support screen wiring

**Files:**
- Create: `apps/mobile/src/hooks/useSupport.ts`
- Modify: `apps/mobile/src/screens/parent/CustomerSupportScreen.tsx`
- Modify: `apps/mobile/src/screens/parent/styles/customer-support-screen.styles.ts` (allow the grid to wrap to 4 cards)
- Test: `apps/mobile/src/screens/parent/__tests__/CustomerSupportScreen.test.tsx`

**Interfaces:**
- Consumes: `SupportContact` and `whatsappLink` from Task 1; `GET /support/contact` from Task 3.
- Produces: `useSupportContact()` returning a TanStack `UseQueryResult<SupportContact>`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/screens/parent/__tests__/CustomerSupportScreen.test.tsx`:

```tsx
import React from 'react';
import { Linking } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SupportContact } from '@nanny-app/shared';

// `@mobile/lib/api` imports firebase, which eagerly initializes the real SDK
// at module-load time and crashes jest-expo's transform. Stub the API layer;
// `unwrap` keeps its real envelope-unwrapping shape.
jest.mock('@mobile/lib/api', () => ({
  api: { get: jest.fn() },
  unwrap: jest.fn((promise: Promise<{ data: { data: unknown; error: string | null } }>) =>
    promise.then((res) => res.data.data),
  ),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

import { api } from '@mobile/lib/api';
import CustomerSupportScreen from '@mobile/screens/parent/CustomerSupportScreen';

const mockGet = api.get as jest.Mock;

function mockContact(contact: SupportContact) {
  mockGet.mockResolvedValue({ data: { data: contact, error: null } });
}

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CustomerSupportScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});

describe('CustomerSupportScreen contact channels', () => {
  it('opens a wa.me link for the configured WhatsApp number', async () => {
    mockContact({ whatsappNumber: '+201001234567', phoneNumber: '', email: '' });
    const { getByText } = renderScreen();

    await waitFor(() => expect(getByText('WhatsApp')).toBeTruthy());
    fireEvent.press(getByText('WhatsApp'));

    expect(Linking.openURL).toHaveBeenCalledWith('https://wa.me/201001234567');
  });

  it('dials the configured support number', async () => {
    mockContact({ whatsappNumber: '', phoneNumber: '+201009999999', email: '' });
    const { getByText } = renderScreen();

    await waitFor(() => expect(getByText('Call support')).toBeTruthy());
    fireEvent.press(getByText('Call support'));

    expect(Linking.openURL).toHaveBeenCalledWith('tel:+201009999999');
  });

  it('opens a mailto link for the configured support email', async () => {
    mockContact({ whatsappNumber: '', phoneNumber: '', email: 'support@nannynow.com' });
    const { getByText } = renderScreen();

    await waitFor(() => expect(getByText('Email support')).toBeTruthy());
    fireEvent.press(getByText('Email support'));

    expect(Linking.openURL).toHaveBeenCalledWith('mailto:support@nannynow.com');
  });

  it('hides a channel the admin has not configured', async () => {
    mockContact({ whatsappNumber: '', phoneNumber: '+201009999999', email: '' });
    const { queryByText, getByText } = renderScreen();

    await waitFor(() => expect(getByText('Call support')).toBeTruthy());
    expect(queryByText('WhatsApp')).toBeNull();
    expect(queryByText('Email support')).toBeNull();
  });

  it('shows only the community card when nothing is configured', async () => {
    mockContact({ whatsappNumber: '', phoneNumber: '', email: '' });
    const { queryByText, getByText } = renderScreen();

    await waitFor(() => expect(getByText('Ask the community')).toBeTruthy());
    expect(queryByText('WhatsApp')).toBeNull();
    expect(queryByText('Call support')).toBeNull();
    expect(queryByText('Email support')).toBeNull();
  });

  it('keeps the community card when the request fails', async () => {
    mockGet.mockRejectedValue(new Error('offline'));
    const { getByText, queryByText } = renderScreen();

    await waitFor(() => expect(getByText('Ask the community')).toBeTruthy());
    expect(queryByText('WhatsApp')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/mobile && pnpm test CustomerSupportScreen
```

Expected: FAIL — `Unable to find an element with text: WhatsApp`.

- [ ] **Step 3: Add the hook**

Create `apps/mobile/src/hooks/useSupport.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import type { SupportContact } from '@nanny-app/shared';

import { api, unwrap } from '@mobile/lib/api';

const SUPPORT_KEY = 'support';

/**
 * Admin-configured support channels. Any field may be an empty string,
 * meaning that channel is switched off and its card should not render.
 */
export function useSupportContact() {
  return useQuery({
    queryKey: [SUPPORT_KEY, 'contact'],
    queryFn: () => unwrap<SupportContact>(api.get('/support/contact')),
    staleTime: 5 * 60_000,
  });
}
```

- [ ] **Step 4: Let the contact grid wrap**

In `apps/mobile/src/screens/parent/styles/customer-support-screen.styles.ts`, replace the `contactGrid` and `contactCard` blocks with:

```ts
  contactGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
  },
  contactCard: {
    // flexBasis 0 + grow keeps two cards per row at any width; minWidth forces
    // the third and fourth onto a new row rather than squeezing four across.
    flexBasis: 0,
    flexGrow: 1,
    minWidth: 140,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    gap: spacing.sm,
  },
```

Leave `contactIconWrapGreen`, `contactIconWrapBeige`, `contactTitle`, and `contactSubtitle` unchanged — the new cards reuse them.

- [ ] **Step 5: Wire up the screen**

In `apps/mobile/src/screens/parent/CustomerSupportScreen.tsx`, add `Alert` to the `react-native` import:

```tsx
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Linking,
  Alert,
} from 'react-native';
```

Add these imports below the existing ones:

```tsx
import { whatsappLink } from '@nanny-app/shared';
import { useSupportContact } from '@mobile/hooks/useSupport';
```

Add inside the component, after the `searchQuery` state:

```tsx
  const { data: support } = useSupportContact();
```

Add above the `return`, next to `handleBack`:

```tsx
  /**
   * Deep links can fail — no dialer on the device, no mail client configured.
   * Surface that instead of letting the promise reject silently and leaving
   * the parent tapping a card that appears to do nothing.
   */
  const openExternal = (url: string) => {
    Linking.openURL(url).catch(() => {
      Alert.alert('Couldn’t open that', 'Please try another way to reach us.');
    });
  };
```

Replace the whole `otherWaysSection` block (the `<View style={styles.otherWaysSection}>` element and its contents) with:

```tsx
        <View style={styles.otherWaysSection}>
          <Text style={styles.otherWaysHeader}>OTHER WAYS TO REACH US</Text>
          <View style={styles.contactGrid}>
            {support?.whatsappNumber ? (
              <Pressable
                style={styles.contactCard}
                onPress={() => openExternal(whatsappLink(support.whatsappNumber))}
              >
                <View style={styles.contactIconWrapGreen}>
                  <Ionicons name="logo-whatsapp" size={20} color={colors.primaryDark} />
                </View>
                <Text style={styles.contactTitle}>WhatsApp</Text>
                <Text style={styles.contactSubtitle}>Chat with our team</Text>
              </Pressable>
            ) : null}

            {support?.phoneNumber ? (
              <Pressable
                style={styles.contactCard}
                onPress={() => openExternal(`tel:${support.phoneNumber}`)}
              >
                <View style={styles.contactIconWrapBeige}>
                  <Ionicons name="call-outline" size={20} color={colors.textTertiary} />
                </View>
                <Text style={styles.contactTitle}>Call support</Text>
                <Text style={styles.contactSubtitle}>Speak to us directly</Text>
              </Pressable>
            ) : null}

            {support?.email ? (
              <Pressable
                style={styles.contactCard}
                onPress={() => openExternal(`mailto:${support.email}`)}
              >
                <View style={styles.contactIconWrapGreen}>
                  <Ionicons name="mail-outline" size={20} color={colors.primaryDark} />
                </View>
                <Text style={styles.contactTitle}>Email support</Text>
                <Text style={styles.contactSubtitle}>Reply within 24 hours</Text>
              </Pressable>
            ) : null}

            <Pressable
              style={styles.contactCard}
              onPress={() => router.push('/(parent)/community')}
            >
              <View style={styles.contactIconWrapBeige}>
                <Ionicons name="chatbubbles-outline" size={20} color={colors.textTertiary} />
              </View>
              <Text style={styles.contactTitle}>Ask the community</Text>
              <Text style={styles.contactSubtitle}>Moms helping moms</Text>
            </Pressable>
          </View>
        </View>
```

Leave the `emergencyCard` block below it exactly as it is.

- [ ] **Step 6: Run test to verify it passes**

```bash
cd apps/mobile && pnpm test CustomerSupportScreen
```

Expected: PASS, 6 tests.

- [ ] **Step 7: Verify the whole workspace**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: exit 0 on all three.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/hooks/useSupport.ts apps/mobile/src/screens/parent/CustomerSupportScreen.tsx apps/mobile/src/screens/parent/styles/customer-support-screen.styles.ts apps/mobile/src/screens/parent/__tests__/CustomerSupportScreen.test.tsx
git commit -m "Surface admin-configured support channels in the app"
```

---

## Manual End-to-End Verification

After Task 5, with backend and admin running and the app on a device or simulator:

1. In the admin `/settings` page, set all three support fields and save.
2. Open the app as a parent → profile → Help & support.
3. Confirm four cards render: WhatsApp, Call support, Email support, Ask the community.
4. Tap WhatsApp → WhatsApp opens a chat with the configured number (or the browser falls back to the wa.me page if WhatsApp is not installed).
5. Tap Call support → the dialer opens pre-filled.
6. Tap Email support → the mail client opens addressed to the support inbox.
7. Back in admin, clear the WhatsApp field and save. Reopen help in the app (pull to refresh or wait out the 5-minute `staleTime`) → the WhatsApp card is gone, the other three remain.
