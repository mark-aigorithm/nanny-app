# Branded Password-Reset Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Firebase's default password-reset email with our branded HTML, kept in the repo and pushed to the Firebase project by a script.

**Architecture:** The reset template is one more body file rendered through the existing Handlebars layout, with Firebase's `%LINK%` / `%EMAIL%` placeholders written literally. A small Identity Toolkit admin-API client (`firebase-templates.ts`) reads and patches `notification.sendEmail.resetPasswordTemplate`; a ts-node CLI wires it to the backend's service-account credential. No mobile change.

**Tech Stack:** Express backend (TypeScript), Handlebars, firebase-admin 13, Node 20 global `fetch`, Jest (ts-jest, `unit` project).

Spec: `Docs/superpowers/specs/2026-09-25-branded-reset-email-design.md`

## Global Constraints

- Brand in email is **Nanny Now** (never "NannyApp") — header, `<title>`, footer ©, every subject.
- Reset subject: `Reset your Nanny Now password`. Sender display name: `Nanny Now`. `bodyFormat: 'HTML'`.
- Only these fields of `resetPasswordTemplate` are written: `senderDisplayName`, `subject`, `body`, `bodyFormat`. Sender address and reply-to are untouched.
- Colours only from the existing palette: primary `#97a591`, primaryDark `#556251`, text `#1b1c1b` / `#444842` / `#7a7a7a`, surfaceMuted `#f0edeb`, warmBorder `#ebddd2`, background `#fdfaf8`, white.
- No migration: `EmailTemplate` (shared enum + Prisma enum) is **not** extended.
- The CLI is dry-run unless `--apply` is passed, and refuses to run with `FIREBASE_AUTH_EMULATOR_HOST` set.
- Run unit tests from `apps/backend`: `pnpm test:unit -- <pattern>`. Typecheck: `pnpm typecheck`. (ESLint is broken repo-wide; don't rely on it.)

---

### Task 1: Rebrand the email layout and give each template its own footer

**Files:**
- Modify: `apps/backend/src/lib/email/templates/layout.html`
- Modify: `apps/backend/src/lib/email/render.ts`
- Test: `apps/backend/src/__tests__/email-render.test.ts`, `apps/backend/src/__tests__/email-verification.service.test.ts:90` (subject assertion — check it still passes)

**Interfaces:**
- Produces: `TEMPLATES[k].footerNote: string`; private helper `renderInLayout(bodyFile: string, footerNote: string, vars: object): string` in `render.ts` (Task 2 reuses it).

- [ ] **Step 1: Update the failing tests**

In `email-render.test.ts`:
- RECEIPT "builds the subject…" test: replace `expect(html).toContain('NannyApp');` with
  ```ts
  expect(html).toContain('Nanny Now');
  expect(html).not.toContain('NannyApp');
  ```
- EMAIL_VERIFICATION first test: `expect(subject).toBe('Confirm your email for Nanny Now');` and replace its `toContain('NannyApp')` with `toContain('Nanny Now')`.
- Add at the end of the file:
  ```ts
  describe('layout footer', () => {
    it('calls a receipt a receipt', () => {
      expect(renderEmail('RECEIPT', baseVars).html).toContain('automated receipt from Nanny Now');
    });

    it('does not call the verification email a receipt', () => {
      const { html } = renderEmail('EMAIL_VERIFICATION', verificationVars);

      expect(html).not.toContain('receipt');
      expect(html).toContain('this address was entered in the Nanny Now app');
    });
  });
  ```
- RECEIPT subject is also rebranded; add to the first RECEIPT test: `expect(subject).toBe('Your Nanny Now receipt — booking #42');`

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test:unit -- email-render`
Expected: FAIL — subjects still say NannyApp; footer says "receipt" on the verification email.

- [ ] **Step 3: Implement**

`layout.html`: change `<title>NannyApp</title>` → `<title>Nanny Now</title>`; header span text `NannyApp` → `Nanny Now`; replace the first footer paragraph's text with `{{footerNote}}`; `© NannyApp` → `© Nanny Now`. Leave all styles as they are.

`render.ts`:
```ts
type TemplateDefs = {
  [K in EmailTemplate]: {
    subject: (vars: TemplateVars[K]) => string;
    bodyFile: string;
    /** The layout's footer line — each email says why it was sent. */
    footerNote: string;
  };
};

const TEMPLATES: TemplateDefs = {
  RECEIPT: {
    subject: (v) => `Your Nanny Now receipt — booking #${v.bookingId}`,
    bodyFile: 'receipt.html',
    footerNote: 'This is an automated receipt from Nanny Now. Please keep it for your records.',
  },
  EMAIL_VERIFICATION: {
    // (keep the existing comment about the code not being in the subject)
    subject: () => 'Confirm your email for Nanny Now',
    bodyFile: 'email-verification.html',
    footerNote: "You're receiving this because this address was entered in the Nanny Now app.",
  },
};

/** A body file wrapped in the shared layout. */
function renderInLayout(bodyFile: string, footerNote: string, vars: object): string {
  registerHelpers();
  const body = loadTemplate(bodyFile)(vars);
  return loadTemplate('layout.html')({ ...vars, body, footerNote });
}

export function renderEmail<T extends EmailTemplate>(
  template: T,
  vars: TemplateVars[T],
): RenderedEmail {
  const def = TEMPLATES[template];
  return { subject: def.subject(vars), html: renderInLayout(def.bodyFile, def.footerNote, vars) };
}
```
Also update the file's top doc comment: "header + footer" → "header + a per-template footer line".

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm test:unit -- email-render email-verification.service email.service`
Expected: PASS (the verification-service test matches `stringContaining('Confirm your email')`, which still holds).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/lib/email/templates/layout.html apps/backend/src/lib/email/render.ts apps/backend/src/__tests__/email-render.test.ts
git commit -m "feat(email): Nanny Now branding and a footer line per template"
```

---

### Task 2: The password-reset body and `renderFirebaseTemplate`

**Files:**
- Create: `apps/backend/src/lib/email/templates/password-reset.html`
- Modify: `apps/backend/src/lib/email/render.ts`
- Test: `apps/backend/src/__tests__/email-render.test.ts`

**Interfaces:**
- Consumes: `renderInLayout` (Task 1).
- Produces: `export type FirebaseEmailTemplate = 'PASSWORD_RESET'` and `export function renderFirebaseTemplate(template: FirebaseEmailTemplate): RenderedEmail` from `@backend/lib/email/render`.

- [ ] **Step 1: Write the failing tests**

Add `renderFirebaseTemplate` to the import in `email-render.test.ts`, then:
```ts
describe('renderFirebaseTemplate PASSWORD_RESET', () => {
  const { subject, html } = renderFirebaseTemplate('PASSWORD_RESET');

  it('uses the Nanny Now subject', () => {
    expect(subject).toBe('Reset your Nanny Now password');
  });

  it("keeps Firebase's placeholders intact for Firebase to fill in", () => {
    // Button + fallback href + fallback text.
    expect(html.match(/%LINK%/g)).toHaveLength(3);
    expect(html).toContain('%EMAIL%');
    expect(html).toContain('href="%LINK%"');
  });

  it('sits in the shared layout with its own footer', () => {
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Nanny Now');
    expect(html).toContain('a password reset was requested for this address');
    expect(html).not.toContain('receipt');
  });

  it('leaves no unreplaced handlebars tokens', () => {
    expect(html).not.toMatch(/\{\{/);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test:unit -- email-render`
Expected: FAIL — `renderFirebaseTemplate` is not exported.

- [ ] **Step 3: Create `password-reset.html`**

```html
<h1 style="margin:0 0 8px; font-family:'Manrope',-apple-system,'Segoe UI',Arial,sans-serif; font-size:20px; font-weight:700; color:#1b1c1b;">
  Reset your password
</h1>
<p style="margin:0 0 24px; font-size:14px; line-height:22px; color:#444842;">
  We got a request to reset the password for your Nanny Now account,
  <strong style="color:#1b1c1b;">%EMAIL%</strong>.
</p>

<!-- The button. The colour sits on the cell as well as the link so clients
     that ignore padding on <a> (Outlook) still show a filled button. -->
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
  <tr>
    <td align="center" bgcolor="#97a591" style="background-color:#97a591; border-radius:12px;">
      <a
        href="%LINK%"
        target="_blank"
        style="display:inline-block; padding:14px 32px; font-family:'Manrope',-apple-system,'Segoe UI',Arial,sans-serif; font-size:15px; font-weight:700; color:#ffffff; text-decoration:none; border-radius:12px;"
        >Reset password</a
      >
    </td>
  </tr>
</table>

<p style="margin:0 0 16px; font-size:14px; line-height:22px; color:#444842;">
  The link works once and expires in 1 hour.
</p>

<p style="margin:0 0 4px; font-size:12px; line-height:18px; color:#7a7a7a;">
  Button not working? Paste this link into your browser:
</p>
<p style="margin:0 0 24px; font-size:12px; line-height:18px; word-break:break-all;">
  <a href="%LINK%" style="color:#556251;">%LINK%</a>
</p>

<p style="margin:0; font-size:12px; line-height:18px; color:#7a7a7a;">
  If you didn't ask for this, you can ignore this email — your password stays the same.
</p>
```

- [ ] **Step 4: Add `renderFirebaseTemplate` to `render.ts`** (below `renderEmail`)

```ts
/**
 * Templates Firebase sends from its own mailer, not us. Kept apart from
 * `EmailTemplate` because that enum is also the Prisma enum on `email_logs`,
 * and these sends never reach our log. Firebase fills `%LINK%` / `%EMAIL%`
 * itself; they are written literally in the body files and pass through
 * Handlebars untouched. Pushed to the project by
 * prisma/sync-firebase-email-templates.ts.
 */
export type FirebaseEmailTemplate = 'PASSWORD_RESET';

const FIREBASE_TEMPLATES: Record<
  FirebaseEmailTemplate,
  { subject: string; bodyFile: string; footerNote: string }
> = {
  PASSWORD_RESET: {
    subject: 'Reset your Nanny Now password',
    bodyFile: 'password-reset.html',
    footerNote: "You're receiving this because a password reset was requested for this address.",
  },
};

export function renderFirebaseTemplate(template: FirebaseEmailTemplate): RenderedEmail {
  const def = FIREBASE_TEMPLATES[template];
  return { subject: def.subject, html: renderInLayout(def.bodyFile, def.footerNote, {}) };
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `pnpm test:unit -- email-render`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/lib/email/templates/password-reset.html apps/backend/src/lib/email/render.ts apps/backend/src/__tests__/email-render.test.ts
git commit -m "feat(email): branded password-reset template for Firebase's mailer"
```

---

### Task 3: Identity Toolkit client for the reset template

**Files:**
- Create: `apps/backend/src/lib/email/firebase-templates.ts`
- Test: `apps/backend/src/__tests__/firebase-templates.test.ts`

**Interfaces:**
- Consumes: `renderFirebaseTemplate('PASSWORD_RESET')` (Task 2).
- Produces (all exported from `@backend/lib/email/firebase-templates`):
  - `interface FirebaseEmailTemplateConfig { senderLocalPart?: string; senderDisplayName?: string; subject?: string; body?: string; bodyFormat?: 'BODY_FORMAT_UNSPECIFIED' | 'PLAIN_TEXT' | 'HTML'; replyTo?: string; customized?: boolean }`
  - `type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>`
  - `interface ConfigClientOptions { projectId: string; accessToken: string; fetch?: FetchLike }`
  - `function buildResetPasswordTemplate(): Required<Pick<FirebaseEmailTemplateConfig, 'senderDisplayName' | 'subject' | 'body' | 'bodyFormat'>>`
  - `async function getResetPasswordTemplate(opts: ConfigClientOptions): Promise<FirebaseEmailTemplateConfig | undefined>`
  - `async function pushResetPasswordTemplate(opts: ConfigClientOptions): Promise<FirebaseEmailTemplateConfig | undefined>`

- [ ] **Step 1: Write the failing tests** — `apps/backend/src/__tests__/firebase-templates.test.ts`

```ts
import {
  buildResetPasswordTemplate,
  getResetPasswordTemplate,
  pushResetPasswordTemplate,
  type FetchLike,
} from '@backend/lib/email/firebase-templates';

const PROJECT = 'nanny-now-d8518';
const CONFIG_URL = `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config`;

function respond(status: number, payload: unknown): ReturnType<FetchLike> {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => payload });
}

describe('buildResetPasswordTemplate', () => {
  it('is the branded HTML template, sent as Nanny Now', () => {
    const t = buildResetPasswordTemplate();

    expect(t.senderDisplayName).toBe('Nanny Now');
    expect(t.subject).toBe('Reset your Nanny Now password');
    expect(t.bodyFormat).toBe('HTML');
    expect(t.body).toContain('href="%LINK%"');
  });
});

describe('getResetPasswordTemplate', () => {
  it('reads the project config with the bearer token', async () => {
    const fetch = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>(() =>
      respond(200, { notification: { sendEmail: { resetPasswordTemplate: { subject: 'Old' } } } }),
    );

    const current = await getResetPasswordTemplate({ projectId: PROJECT, accessToken: 'tok', fetch });

    expect(current).toEqual({ subject: 'Old' });
    expect(fetch).toHaveBeenCalledWith(CONFIG_URL, {
      method: 'GET',
      headers: { Authorization: 'Bearer tok' },
    });
  });
});

describe('pushResetPasswordTemplate', () => {
  it('patches only the four fields it owns', async () => {
    const fetch = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>(() =>
      respond(200, { notification: { sendEmail: { resetPasswordTemplate: { subject: 'Reset your Nanny Now password' } } } }),
    );

    await pushResetPasswordTemplate({ projectId: PROJECT, accessToken: 'tok', fetch });

    const [url, init] = fetch.mock.calls[0]!;
    const mask = new URL(url).searchParams.get('updateMask');
    expect(url.startsWith(`${CONFIG_URL}?`)).toBe(true);
    expect(mask?.split(',')).toEqual([
      'notification.sendEmail.resetPasswordTemplate.senderDisplayName',
      'notification.sendEmail.resetPasswordTemplate.subject',
      'notification.sendEmail.resetPasswordTemplate.body',
      'notification.sendEmail.resetPasswordTemplate.bodyFormat',
    ]);
    expect(init?.method).toBe('PATCH');
    expect(init?.headers).toEqual({ Authorization: 'Bearer tok', 'Content-Type': 'application/json' });

    const sent = JSON.parse(init?.body ?? '{}') as {
      notification: { sendEmail: { resetPasswordTemplate: Record<string, unknown> } };
    };
    expect(sent.notification.sendEmail.resetPasswordTemplate).toEqual(buildResetPasswordTemplate());
  });

  it("throws with the API's message on a non-2xx", async () => {
    const fetch = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>(() =>
      respond(403, { error: { message: 'The caller does not have permission' } }),
    );

    await expect(
      pushResetPasswordTemplate({ projectId: PROJECT, accessToken: 'tok', fetch }),
    ).rejects.toThrow('403: The caller does not have permission');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test:unit -- firebase-templates`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `firebase-templates.ts`**

```ts
import { renderFirebaseTemplate } from '@backend/lib/email/render';

/**
 * Reads and writes the password-reset email template on the Firebase project
 * through the Identity Toolkit admin API — the same setting the console's
 * Authentication → Templates page edits. Firebase takes no template per
 * request, so this is how the in-repo template reaches its mailer.
 *
 * Only the fields we own are written (see RESET_FIELDS): the sender address
 * and reply-to stay whatever the console has.
 */

export interface FirebaseEmailTemplateConfig {
  senderLocalPart?: string;
  senderDisplayName?: string;
  subject?: string;
  body?: string;
  bodyFormat?: 'BODY_FORMAT_UNSPECIFIED' | 'PLAIN_TEXT' | 'HTML';
  replyTo?: string;
  customized?: boolean;
}

/** The slice of `fetch` this module uses, so tests can stub it. */
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface ConfigClientOptions {
  projectId: string;
  accessToken: string;
  fetch?: FetchLike;
}

interface ProjectConfig {
  notification?: { sendEmail?: { resetPasswordTemplate?: FirebaseEmailTemplateConfig } };
}

const RESET_FIELDS = ['senderDisplayName', 'subject', 'body', 'bodyFormat'] as const;
const RESET_PATH = 'notification.sendEmail.resetPasswordTemplate';

export function buildResetPasswordTemplate(): Required<
  Pick<FirebaseEmailTemplateConfig, (typeof RESET_FIELDS)[number]>
> {
  const { subject, html } = renderFirebaseTemplate('PASSWORD_RESET');
  return { senderDisplayName: 'Nanny Now', subject, body: html, bodyFormat: 'HTML' };
}

function configUrl(projectId: string): string {
  return `https://identitytoolkit.googleapis.com/admin/v2/projects/${encodeURIComponent(projectId)}/config`;
}

async function readConfig(
  res: Awaited<ReturnType<FetchLike>>,
): Promise<FirebaseEmailTemplateConfig | undefined> {
  const payload = (await res.json()) as ProjectConfig & { error?: { message?: string } };
  if (!res.ok) {
    throw new Error(`Identity Toolkit ${res.status}: ${payload.error?.message ?? 'no message'}`);
  }
  return payload.notification?.sendEmail?.resetPasswordTemplate;
}

export async function getResetPasswordTemplate({
  projectId,
  accessToken,
  fetch: doFetch = fetch,
}: ConfigClientOptions): Promise<FirebaseEmailTemplateConfig | undefined> {
  const res = await doFetch(configUrl(projectId), {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return readConfig(res);
}

export async function pushResetPasswordTemplate({
  projectId,
  accessToken,
  fetch: doFetch = fetch,
}: ConfigClientOptions): Promise<FirebaseEmailTemplateConfig | undefined> {
  const updateMask = RESET_FIELDS.map((f) => `${RESET_PATH}.${f}`).join(',');
  const res = await doFetch(`${configUrl(projectId)}?${new URLSearchParams({ updateMask })}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      notification: { sendEmail: { resetPasswordTemplate: buildResetPasswordTemplate() } },
    }),
  });
  return readConfig(res);
}
```
Note: `fetch: doFetch = fetch` — Node 20's global `fetch` is assignable to `FetchLike` structurally; if `tsc` complains, wrap it: `fetch: doFetch = (url, init) => fetch(url, init)`.

- [ ] **Step 4: Run to verify they pass, then typecheck**

Run: `pnpm test:unit -- firebase-templates` → PASS
Run: `pnpm typecheck` → no errors

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/lib/email/firebase-templates.ts apps/backend/src/__tests__/firebase-templates.test.ts
git commit -m "feat(email): Identity Toolkit client for the reset-password template"
```

---

### Task 4: The sync CLI, dry-run against the live project, and docs

**Files:**
- Create: `apps/backend/prisma/sync-firebase-email-templates.ts` (lives beside `migrate-firebase-emails.ts`, the existing Firebase CLI, so `tsconfig` typechecks it)
- Modify: `apps/backend/package.json` (scripts)
- Modify: `apps/backend/CLAUDE.md` (Known Gotchas)

**Interfaces:**
- Consumes: `buildResetPasswordTemplate`, `getResetPasswordTemplate`, `pushResetPasswordTemplate`, `FirebaseEmailTemplateConfig` (Task 3); `config.firebase.projectId`; the initialised default app from `src/lib/firebase.ts`.

- [ ] **Step 1: Write the CLI**

```ts
/**
 * Pushes the in-repo password-reset email (src/lib/email/templates/
 * password-reset.html) to the Firebase project's Authentication → Templates.
 * Firebase takes no template per request, so this is how a template change
 * reaches users — run it after merging one. No app build is needed.
 *
 * Dry-run unless --apply is passed: it always writes a browser preview and
 * reads the live template, and writes only with --apply.
 *
 *   pnpm email:sync-firebase
 *   pnpm email:sync-firebase --apply
 */
import fs from 'node:fs';
import path from 'node:path';

import admin from 'firebase-admin';

import { config } from '../src/lib/config';
import '../src/lib/firebase';
import {
  buildResetPasswordTemplate,
  getResetPasswordTemplate,
  pushResetPasswordTemplate,
  type FirebaseEmailTemplateConfig,
} from '../src/lib/email/firebase-templates';

const apply = process.argv.includes('--apply');

function summarise(t: FirebaseEmailTemplateConfig | undefined): Record<string, unknown> {
  return {
    senderDisplayName: t?.senderDisplayName ?? '(none)',
    subject: t?.subject ?? '(default)',
    bodyFormat: t?.bodyFormat ?? '(default)',
    bodyLength: t?.body?.length ?? 0,
    customized: t?.customized ?? false,
  };
}

async function main(): Promise<void> {
  // The one process.env read: lib/firebase.ts reads it directly too, and it
  // isn't part of the validated config.
  if (process.env['FIREBASE_AUTH_EMULATOR_HOST']) {
    throw new Error(
      'FIREBASE_AUTH_EMULATOR_HOST is set — the emulator ignores email templates and runs without real credentials. Unset it to target a real project.',
    );
  }

  const projectId = config.firebase.projectId;
  const next = buildResetPasswordTemplate();

  const previewPath = path.join(__dirname, '..', 'dist', 'firebase-templates', 'password-reset.html');
  fs.mkdirSync(path.dirname(previewPath), { recursive: true });
  fs.writeFileSync(previewPath, next.body);

  // eslint-disable-next-line no-console
  console.log(`Firebase project: ${projectId}\nPreview: ${previewPath}`);

  const credential = admin.app().options.credential;
  if (!credential) throw new Error('Firebase Admin initialised without a credential.');
  const { access_token: accessToken } = await credential.getAccessToken();

  const current = await getResetPasswordTemplate({ projectId, accessToken });
  // eslint-disable-next-line no-console
  console.log('Current:', summarise(current), '\nNew:    ', summarise(next));

  if (!apply) {
    // eslint-disable-next-line no-console
    console.log('\nDRY RUN — nothing written. Pass --apply to push.');
    return;
  }

  const saved = await pushResetPasswordTemplate({ projectId, accessToken });
  // eslint-disable-next-line no-console
  console.log('\nAPPLIED:', summarise(saved));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
```

- [ ] **Step 2: Add the script** to `apps/backend/package.json`, after `db:migrate-firebase-emails`:

```json
"email:sync-firebase": "ts-node --transpile-only -r tsconfig-paths/register prisma/sync-firebase-email-templates.ts"
```

- [ ] **Step 3: Typecheck and the full unit suite**

Run (from `apps/backend`): `pnpm typecheck` → no errors
Run: `pnpm test:unit` → all PASS

- [ ] **Step 4: Dry run against the live project (reads only)**

Run (from `apps/backend`, uses `.env` → `nanny-now-d8518`): `pnpm email:sync-firebase`
Expected: prints `Firebase project: nanny-now-d8518`, the preview path, a `Current:` summary (subject `(default)` or the console's text, `customized: false`) and `DRY RUN`.
- A 403 means the service account lacks `firebaseauth.configs.get/update` — stop and report; don't widen IAM without the user.
- Open `dist/firebase-templates/password-reset.html` in the browser pane and screenshot it at desktop and 400px width; `%LINK%`/`%EMAIL%` show literally, which is expected.

- [ ] **Step 5: Document** — add to `apps/backend/CLAUDE.md` under Known Gotchas:

```markdown
**The password-reset email is Firebase's, with our template pushed to it**
The app's "Forgot password" calls Firebase's `sendPasswordResetEmail`, so Firebase's mailer sends
it — not our SMTP, and nothing lands in `email_logs`. Its HTML is ours
(`src/lib/email/templates/password-reset.html`, rendered by `renderFirebaseTemplate`), but
Firebase takes no template per request: a change reaches users only after
`pnpm email:sync-firebase --apply` pushes it to the project. The Auth emulator ignores templates.
```

- [ ] **Step 6: Commit**

```bash
git add apps/backend/prisma/sync-firebase-email-templates.ts apps/backend/package.json apps/backend/CLAUDE.md
git commit -m "feat(email): pnpm email:sync-firebase pushes the reset template to Firebase"
```

---

### Task 5: Apply to the live project (needs the user's go-ahead)

- [ ] **Step 1:** Show the user the dry-run summary and preview screenshot; ask to apply. Do not run `--apply` without an explicit yes — it changes the live project's email for every user.
- [ ] **Step 2:** `pnpm email:sync-firebase --apply` → expect `APPLIED:` with `subject: 'Reset your Nanny Now password'`, `bodyFormat: 'HTML'`, `customized: true`.
- [ ] **Step 3:** Ask the user to tap "Forgot password" in the app with their own address and check the email in Gmail (web and phone). If Firebase rejects or strips the full-document HTML (`<!DOCTYPE>`, `<head>`), fall back to pushing only the layout's `<body>` content and note it in `render.ts`.
