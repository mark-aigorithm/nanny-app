import { prisma } from '@backend/db/prisma';
import { config } from '@backend/lib/config';
import { errors } from '@backend/lib/errors';
import { firebaseAuth } from '@backend/lib/firebase';

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
 * `runBegun` below) will `purgeAccount`/`completeReset` touch anything, because
 * only then can a uid later found on a reserved number be guaranteed to be one
 * this run created, rather than a real account that happens to reuse the
 * number.
 */
export const TEST_PHONES = ['+201234567891', '+201234567892'] as const;

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
 * Whether `beginRun()` has proved, in this process, that both reserved
 * numbers were clean (no Firebase account) at the start of the run. Nothing
 * that deletes or spends a reset link on a live account may run before this
 * is true.
 */
let runBegun = false;

function assertRunBegun(): void {
  if (!runBegun) {
    throw errors.forbidden(
      'No live-auth run has begun. Call POST /e2e-auth/begin first — it proves both reserved ' +
        'numbers were clean before this run created or touched anything.',
    );
  }
}

/**
 * Test-only: clears the begin-run baseline recorded by `beginRun()`, so tests
 * can exercise the before/after transition without depending on file-level
 * test order or a fresh module instance.
 */
export function __resetRunStateForTests(): void {
  runBegun = false;
}

function isUserNotFound(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === 'auth/user-not-found';
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
 * Once the baseline holds, any leftover local `users` row for the reserved
 * numbers is soft-deleted the same way `purgeAccount` does — that's local
 * test data, not the live project, so it's safe to clear on every begin.
 */
export async function beginRun(): Promise<{ phones: readonly string[]; beganAt: string }> {
  assertEnabled();

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

  runBegun = true;
  return { phones: TEST_PHONES, beganAt: new Date().toISOString() };
}

/**
 * Returns a reserved number to "never registered": the Firebase account goes,
 * and the row is soft-deleted with its unique columns tagged so the next run
 * can register the same number again.
 *
 * Requires a begun run: `beginRun()` proved the number had no account at the
 * start of this run, so any uid on it now was created during this run.
 */
export async function purgeAccount(phone: string): Promise<AccountState> {
  assertEnabled();
  assertReserved(phone);
  assertRunBegun();

  const before = await describeAccount(phone);
  if (before.firebaseUid) {
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
 * that address in the live project. Requires a begun run, same as purge.
 */
export async function completeReset(email: string, newPassword: string): Promise<void> {
  assertEnabled();
  assertRunBegun();

  if (!config.firebase.webApiKey) {
    throw errors.badRequest(
      'FIREBASE_WEB_API_KEY is not configured; the harness cannot spend a password-reset oobCode.',
    );
  }

  let account: Awaited<ReturnType<typeof firebaseAuth.getUserByEmail>>;
  try {
    account = await firebaseAuth.getUserByEmail(email);
  } catch (err) {
    if (isUserNotFound(err)) {
      throw errors.notFound(`No Firebase account for ${email}.`);
    }
    throw err;
  }

  assertReserved(account.phoneNumber ?? '');

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
