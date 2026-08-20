/**
 * Provisions the console accounts the admin E2E suite signs in as.
 *
 * It lives in the backend because that is where the Firebase Admin SDK, the
 * Prisma client and the test environment already are — the admin package has
 * none of them. The admin's Playwright global-setup shells out to this script
 * and passes the role definitions as JSON, so `apps/admin/e2e/roles.ts` stays
 * the single source of truth for who exists and what they may do.
 *
 * Usage:
 *   E2E_ROLES='[{"email":"…","password":"…","role":"SUPERUSER"}]' \
 *     pnpm exec ts-node --transpile-only -r tsconfig-paths/register test/e2e/seed-roles.ts
 *
 * Idempotent: re-running promotes and re-syncs the existing accounts rather
 * than failing on the unique email, so a re-run of the suite is safe.
 */
import '../env';

import type { OperatorPermissions } from '@nanny-app/shared';
// Prisma is a value import, not just a type: `Prisma.DbNull` is needed to
// clear a JSON column (a plain `null` would be rejected as ambiguous).
import { Prisma, type Role } from '@prisma/client';

import { prisma } from '@backend/db/prisma';
import { firebaseAuth } from '@backend/lib/firebase';

type RoleSpec = {
  email: string;
  password: string;
  role: Extract<Role, 'SUPERUSER' | 'ADMIN' | 'OPERATOR'>;
  permissions?: OperatorPermissions;
};

async function ensureFirebaseUser(email: string, password: string): Promise<string> {
  try {
    const existing = await firebaseAuth.getUserByEmail(email);
    // Reset the password so a half-provisioned account from an earlier run
    // cannot fail sign-in with a stale credential.
    await firebaseAuth.updateUser(existing.uid, { password });
    return existing.uid;
  } catch {
    const created = await firebaseAuth.createUser({ email, password });
    return created.uid;
  }
}

async function seed(specs: RoleSpec[]): Promise<void> {
  for (const spec of specs) {
    const firebaseUid = await ensureFirebaseUser(spec.email, spec.password);

    const adminPermissions = (spec.permissions ?? null) as Prisma.InputJsonValue | null;

    await prisma.user.upsert({
      where: { email: spec.email },
      create: {
        firebaseUid,
        email: spec.email,
        firstName: 'E2E',
        lastName: spec.role,
        role: spec.role,
        ...(adminPermissions === null ? {} : { adminPermissions }),
      },
      // firebaseUid is re-synced because the emulator is wiped between runs and
      // issues a fresh uid each time; a stale one would pass sign-in and then
      // fail every authenticated request.
      update: {
        firebaseUid,
        role: spec.role,
        adminPermissions: adminPermissions === null ? Prisma.DbNull : adminPermissions,
      },
    });

    // eslint-disable-next-line no-console
    console.log(`[seed-roles] ${spec.role.padEnd(9)} ${spec.email}`);
  }
}

async function main(): Promise<void> {
  const raw = process.env['E2E_ROLES'];
  if (!raw) throw new Error('E2E_ROLES is required (a JSON array of role specs).');

  await seed(JSON.parse(raw) as RoleSpec[]);
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('[seed-roles]', error);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
