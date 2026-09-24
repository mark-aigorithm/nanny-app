import { prisma } from '@backend/db/prisma';
import { config } from '@backend/lib/config';
import { errors } from '@backend/lib/errors';
import { firebaseAuth } from '@backend/lib/firebase';
import { isUserNotFound } from '@backend/lib/firebase-errors';

/**
 * The live-Firebase E2E harness.
 *
 * These operations run against the project that also serves production, so the
 * allowlist below is the whole safety story: exactly the two console test
 * numbers that carry neither a Firebase account nor a `users` row. Everything
 * else — a real customer, the manual-test accounts, the emulator fixtures — is
 * refused before a single Firebase call is made. There is deliberately no
 * "list and clean up" operation: a bug in one would be indistinguishable from
 * the incident this feature exists to prevent.
 *
 * A second layer sits in front of deletion: `beginRun()` must prove, at the
 * start of a run, that both reserved numbers currently have no Firebase
 * account at all. Only once that baseline is recorded (in this process — see
 * `runBeganAtMs` below) will `purgeAccount`/`completeReset` touch anything,
 * and even then only an account whose Firebase-reported creation time is at or
 * after that baseline (see `assertCreatedDuringRun`) — because a uid existing
 * on a reserved number is not by itself proof this run created it.
 *
 * Residual risk that cannot be closed server-side: if some *other* process
 * registers a reserved number in the window between a clean `beginRun()` and
 * a later `purgeAccount`/`completeReset` call, its creation time is
 * indistinguishable from "created by this run" and it would still be purged
 * (or have its reset spent). The creation-time check defends against a
 * *pre-existing* account being mistaken for one this run made; it cannot
 * defend against a race with a concurrent registration on the same number,
 * which is why the reserved numbers must stay reserved — nothing else should
 * ever be registering them.
 */
export const TEST_PHONES = ['+201234567891', '+201234567892'] as const;

/** Generic, PII-free refusal for `completeReset` — see the comment above its use. */
const NOT_RESERVED_ACCOUNT_MESSAGE = 'That account is not on a reserved test number.';

/**
 * How far a Firebase-reported creation time may fall *before* this run's
 * recorded baseline and still be trusted as "created by this run". Not zero:
 * the local process clock (`Date.now()` in `beginRun`) and Google's own
 * account-creation timestamp are not the same clock, so a uid legitimately
 * created a moment after `beginRun` returned can still report a
 * `creationTime` a little earlier due to skew. Five minutes is generous
 * enough to absorb that without opening a window wide enough to matter for
 * the actual threat this guards against — an account that is hours, days, or
 * months old.
 */
const RUN_AGE_SKEW_MS = 5 * 60 * 1000;

function assertReserved(phone: string): void {
  if (!(TEST_PHONES as readonly string[]).includes(phone)) {
    throw errors.forbidden(`${phone} is not a reserved test number.`);
  }
}

/**
 * Refuse to run at all outside a deliberately-flagged, non-production
 * environment pointed at the throwaway test database. The database check
 * matters because `purgeAccount`/`beginRun` write rows — the same guard
 * `test/env.ts` applies before a TRUNCATE.
 */
function assertEnabled(): void {
  if (!config.e2eLiveAuthEnabled || config.nodeEnv === 'production') {
    throw errors.forbidden('The live-auth harness is disabled.');
  }

  const databaseName = new URL(config.databaseUrl).pathname.replace(/^\//, '');
  if (databaseName !== 'nannyapp_test') {
    throw errors.forbidden(
      `The live-auth harness refuses to run against database "${databaseName}"; it must be "nannyapp_test".`,
    );
  }
}

/**
 * When the current run's baseline was recorded (epoch ms), or `null` if no
 * run has begun (including: never begun yet, or a later `beginRun()` call
 * failed and reset it — see `beginRun`). Doubles as the "has a run begun"
 * flag, so there is exactly one piece of state to keep consistent rather than
 * a boolean and a timestamp that could disagree.
 */
let runBeganAtMs: number | null = null;

function assertRunBegun(): void {
  if (runBeganAtMs === null) {
    throw errors.forbidden(
      'No live-auth run has begun. Call POST /e2e-auth/begin first — it proves both reserved ' +
        'numbers were clean before this run created or touched anything.',
    );
  }
}

/**
 * Refuse to act on a Firebase account unless its own reported creation time
 * is at or after this run's baseline (within `RUN_AGE_SKEW_MS`). This is what
 * turns "has a uid" into "this run created that uid" — see the module
 * doc comment for the race this still cannot close.
 */
function assertCreatedDuringRun(creationTime: string, context: string): void {
  if (runBeganAtMs === null) {
    // Should be unreachable — every caller checks assertRunBegun() first —
    // but fail closed rather than compare against a missing baseline.
    throw errors.forbidden('No live-auth run has begun.');
  }

  const createdAtMs = new Date(creationTime).getTime();
  if (Number.isNaN(createdAtMs) || createdAtMs < runBeganAtMs - RUN_AGE_SKEW_MS) {
    throw errors.forbidden(
      `Refusing to act on ${context}: its Firebase account predates this run's baseline, so it ` +
        'was not created by this run.',
    );
  }
}

/**
 * Test-only: clears the begin-run baseline recorded by `beginRun()`, so tests
 * can exercise the before/after transition without depending on file-level
 * test order or a fresh module instance.
 */
export function __resetRunStateForTests(): void {
  runBeganAtMs = null;
}

/**
 * Returns a reserved number's local `users` row to "never registered": soft
 * deleted, with its unique columns tagged so the phone/email/uid can be
 * reused by a later signup. Purely local data — the test database, never the
 * live project.
 */
async function softDeleteLocalRow(phone: string): Promise<void> {
  const row = await prisma.user.findUnique({ where: { phone } });
  if (row && !row.deletedAt) {
    const tag = `wiped-${row.id}-`;
    await prisma.user.update({
      where: { id: row.id },
      data: {
        deletedAt: new Date(),
        phone: `${tag}${row.phone}`,
        email: `${tag}${row.email}`,
        firebaseUid: `${tag}${row.firebaseUid}`,
        referralCode: null,
      },
    });
  }
}

export interface AccountState {
  phone: string;
  firebaseExists: boolean;
  firebaseUid: string | null;
  firebaseEmail: string | null;
  firebaseCreationTime: string | null;
  providers: string[];
  dbRowExists: boolean;
}

/** What Firebase and the database currently hold for a reserved number. */
export async function describeAccount(phone: string): Promise<AccountState> {
  assertEnabled();
  assertReserved(phone);

  const row = await prisma.user.findUnique({ where: { phone }, select: { id: true, deletedAt: true } });

  try {
    const fb = await firebaseAuth.getUserByPhoneNumber(phone);
    return {
      phone,
      firebaseExists: true,
      firebaseUid: fb.uid,
      firebaseEmail: fb.email ?? null,
      firebaseCreationTime: fb.metadata.creationTime,
      providers: fb.providerData.map((p) => p.providerId),
      dbRowExists: row !== null && row.deletedAt === null,
    };
  } catch (err) {
    if (isUserNotFound(err)) {
      return {
        phone,
        firebaseExists: false,
        firebaseUid: null,
        firebaseEmail: null,
        firebaseCreationTime: null,
        providers: [],
        dbRowExists: row !== null && row.deletedAt === null,
      };
    }
    throw err;
  }
}

/**
 * Establishes the baseline a run needs before anything may be deleted: both
 * reserved numbers must currently carry no Firebase account, checked one at a
 * time with `getUserByPhoneNumber` — never a list. If either does, that
 * account pre-dates this run: it is named in the error, left completely
 * untouched, and must be inspected and removed by hand.
 *
 * The baseline is reset to "not begun" *before* those lookups run, so a
 * failed `beginRun()` (a conflict) leaves the process locked even if an
 * earlier call had already succeeded — "begun" means "begun, and nothing has
 * looked stale since", not just "begun at some point in the past".
 *
 * Once the baseline holds, any leftover local `users` row for the reserved
 * numbers is soft-deleted the same way `purgeAccount` does — that's local
 * test data, not the live project, so it's safe to clear on every begin.
 */
export async function beginRun(): Promise<{ phones: readonly string[]; beganAt: string }> {
  assertEnabled();

  runBeganAtMs = null;

  const conflicts: string[] = [];
  for (const phone of TEST_PHONES) {
    try {
      await firebaseAuth.getUserByPhoneNumber(phone);
      conflicts.push(phone);
    } catch (err) {
      if (!isUserNotFound(err)) throw err;
    }
  }

  if (conflicts.length > 0) {
    throw errors.conflict(
      `${conflicts.join(' and ')} already ${conflicts.length > 1 ? 'have' : 'has'} a Firebase ` +
        'account. That account pre-dates this run and must be inspected and removed by hand — ' +
        'nothing was deleted.',
    );
  }

  for (const phone of TEST_PHONES) {
    await softDeleteLocalRow(phone);
  }

  const beganAtMs = Date.now();
  runBeganAtMs = beganAtMs;
  return { phones: TEST_PHONES, beganAt: new Date(beganAtMs).toISOString() };
}

/**
 * Returns a reserved number to "never registered": the Firebase account goes,
 * and the row is soft-deleted with its unique columns tagged so the next run
 * can register the same number again.
 *
 * Requires a begun run, and requires the account's own Firebase creation time
 * to be at or after that run's baseline (`assertCreatedDuringRun`) — a uid
 * merely *existing* on a reserved number is not proof this run created it.
 */
export async function purgeAccount(phone: string): Promise<AccountState> {
  assertEnabled();
  assertReserved(phone);
  assertRunBegun();

  const before = await describeAccount(phone);
  if (before.firebaseUid) {
    assertCreatedDuringRun(before.firebaseCreationTime ?? '', `the account on ${phone}`);
    await firebaseAuth.deleteUser(before.firebaseUid);
  }

  await softDeleteLocalRow(phone);

  return describeAccount(phone);
}

/**
 * Completes a password reset the way the hosted page would: mint the oobCode
 * with the Admin SDK, then spend it over the Identity Toolkit REST API. This
 * is the half of the email flow that happens outside the app.
 *
 * The allowlist check is against the LIVE Firebase account for the email, not
 * the local test database — the local database cannot vouch for who owns
 * that address in the live project. Both "no such account" and "that
 * account's phone isn't reserved" refuse with the exact same status and
 * message (`NOT_RESERVED_ACCOUNT_MESSAGE`): this endpoint is unauthenticated,
 * so a caller supplying an arbitrary customer's email must never learn that
 * customer's phone number (via a distinguishing error message) or even
 * whether an account exists for that email (via a distinguishing status
 * code). Requires a begun run and a fresh-enough creation time, same as
 * purge — see `assertCreatedDuringRun`.
 */
export async function completeReset(email: string, newPassword: string): Promise<void> {
  assertEnabled();
  assertRunBegun();

  if (!config.firebase.webApiKey) {
    // This is really server misconfiguration (5xx), but `@backend/lib/errors`
    // has no 5xx-shaped helper today (only `referral.service.ts` constructs
    // `new AppError(msg, 500)` directly, as a one-off) — left as `badRequest`
    // rather than inventing a new convention here.
    throw errors.badRequest(
      'FIREBASE_WEB_API_KEY is not configured; the harness cannot spend a password-reset oobCode.',
    );
  }

  let account: Awaited<ReturnType<typeof firebaseAuth.getUserByEmail>>;
  try {
    account = await firebaseAuth.getUserByEmail(email);
  } catch (err) {
    if (isUserNotFound(err)) {
      // Same status + message as "not a reserved number" below — see the
      // doc comment above: this must not reveal whether the email exists.
      throw errors.forbidden(NOT_RESERVED_ACCOUNT_MESSAGE);
    }
    throw err;
  }

  if (!(TEST_PHONES as readonly string[]).includes(account.phoneNumber ?? '')) {
    throw errors.forbidden(NOT_RESERVED_ACCOUNT_MESSAGE);
  }

  assertCreatedDuringRun(account.metadata.creationTime, 'this account');

  const link = await firebaseAuth.generatePasswordResetLink(email);
  const oobCode = new URL(link).searchParams.get('oobCode');
  if (!oobCode) throw errors.badRequest('Firebase returned a link with no oobCode.');

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=${config.firebase.webApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oobCode, newPassword }),
    },
  );
  if (!res.ok) {
    throw errors.badRequest(`resetPassword → ${res.status} ${await res.text()}`);
  }
}
