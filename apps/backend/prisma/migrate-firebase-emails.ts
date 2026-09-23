/**
 * One-off: move every live account's Firebase address to the real one.
 *
 * Accounts created before registration proved an address carry a phone-derived
 * placeholder as their Firebase credential, which is undeliverable — so
 * Firebase's password-reset mail goes nowhere. `setVerifiedEmail` converts an
 * account the first time its owner passes the verify screen; this converts the
 * ones that already hold a proven address.
 *
 * Dry-run unless --apply is passed. Never deletes, never creates.
 *
 *   pnpm db:migrate-firebase-emails
 *   pnpm db:migrate-firebase-emails --apply
 */
import { config } from '../src/lib/config';
import { prisma } from '../src/db/prisma';
import { firebaseAuth } from '../src/lib/firebase';

const apply = process.argv.includes('--apply');

type Outcome = 'would-update' | 'updated' | 'already-correct' | 'no-firebase-account' | 'unverified' | 'failed';

/**
 * Never print a real address in full — this script's whole point is to be
 * safe to run (and paste the output of) against production. A placeholder
 * carries only a phone number, so it is called out rather than masked.
 */
function maskEmail(email: string | undefined): string {
  if (!email) return '(none)';
  if (email.endsWith('@phone.nannyapp.local')) return '<placeholder>';

  const atIndex = email.indexOf('@');
  if (atIndex <= 0) return '***';

  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  const maskedLocal = local.length <= 1 ? '*' : `${local[0]}***`;
  return `${maskedLocal}@${domain}`;
}

/**
 * Where this run is pointed, so an operator can see it before any write
 * happens. `config` doesn't expose `FIREBASE_AUTH_EMULATOR_HOST` (it's read
 * directly by lib/firebase.ts, not part of the validated env schema), so this
 * is the one spot that reads `process.env` instead of `config`.
 */
function describeTarget(): { firebaseProject: string; database: string } {
  const emulatorHost = process.env['FIREBASE_AUTH_EMULATOR_HOST'];
  const firebaseProject = emulatorHost ? `emulator (${emulatorHost})` : config.firebase.projectId;

  const dbUrl = new URL(config.databaseUrl);
  const database = `${dbUrl.hostname}${dbUrl.port ? `:${dbUrl.port}` : ''}${dbUrl.pathname}`;

  return { firebaseProject, database };
}

async function main(): Promise<void> {
  const target = describeTarget();
  // eslint-disable-next-line no-console
  console.log(
    `${apply ? 'APPLY' : 'DRY RUN'} — firebase project: ${target.firebaseProject} — database: ${target.database}`,
  );

  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true, firebaseUid: true, email: true, isEmailVerified: true },
    orderBy: { id: 'asc' },
  });

  const tally: Record<Outcome, number> = {
    'would-update': 0,
    updated: 0,
    'already-correct': 0,
    'no-firebase-account': 0,
    unverified: 0,
    failed: 0,
  };

  for (const user of users) {
    const log = (outcome: Outcome, detail = ''): void => {
      tally[outcome] += 1;
      // eslint-disable-next-line no-console
      console.log(`user ${user.id}\t${outcome}\t${detail}`);
    };

    if (!user.isEmailVerified) {
      log('unverified', 'converts itself via the verify screen');
      continue;
    }

    let current: string | undefined;
    try {
      current = (await firebaseAuth.getUser(user.firebaseUid)).email;
    } catch (err) {
      if ((err as { code?: string }).code === 'auth/user-not-found') {
        log('no-firebase-account', user.firebaseUid);
        continue;
      }
      log('failed', (err as { code?: string }).code ?? String(err));
      continue;
    }

    if (current === user.email) {
      log('already-correct');
      continue;
    }

    if (!apply) {
      log('would-update', `${maskEmail(current)} → ${maskEmail(user.email)}`);
      continue;
    }

    try {
      await firebaseAuth.updateUser(user.firebaseUid, {
        email: user.email,
        emailVerified: true,
      });
      log('updated', `${maskEmail(current)} → ${maskEmail(user.email)}`);
    } catch (err) {
      log('failed', (err as { code?: string }).code ?? String(err));
    }
  }

  // eslint-disable-next-line no-console
  console.log(`\n${apply ? 'APPLIED' : 'DRY RUN'} — ${JSON.stringify(tally)}`);
  if (tally.failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
