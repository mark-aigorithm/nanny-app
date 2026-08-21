/**
 * Provisions the accounts the mobile E2E lab signs in as.
 *
 * Sibling of `seed-roles.ts`, and here for the same reason: the Firebase Admin
 * SDK, the Prisma client and the test environment all live in the backend, and
 * neither the mobile package nor a Maestro flow has any of them.
 *
 * The one subtlety is the email. Mobile sign-up is phone-only, so the app
 * synthesizes a Firebase credential from the phone number
 * (`phoneToPlaceholderEmail` in apps/mobile/src/lib/validation.ts) and signs in
 * with *that*. The derivation is duplicated below rather than imported — the
 * backend cannot import from the mobile package — so a change to either side
 * shows up as a sign-in failure in the smoke flow, which is the cheapest place
 * to notice it.
 *
 * Usage:
 *   E2E_MOBILE_ACCOUNTS='[{"phone":"+201100000001","password":"…","role":"MOTHER"}]' \
 *     pnpm exec ts-node --transpile-only -r tsconfig-paths/register test/e2e/seed-mobile.ts
 *
 * Idempotent: a re-run resets the password and re-syncs the Firebase uid rather
 * than failing on the unique phone, so re-running the suite is always safe.
 */
import '../env';

import { Role } from '@prisma/client';

import { prisma } from '@backend/db/prisma';
import { firebaseAuth } from '@backend/lib/firebase';

type AccountSpec = {
  /** E.164, as the app builds it from the country code plus typed digits. */
  phone: string;
  password: string;
  role: Extract<Role, 'MOTHER' | 'NANNY'>;
  firstName?: string;
  lastName?: string;
};

/** Cairo city centre — matches the seed data's region, so distance ranking behaves. */
const LOCATION = { latitude: 30.0444, longitude: 31.2357 };

/**
 * Must stay in step with `phoneToPlaceholderEmail` on mobile: digits only, then
 * the fixed domain.
 */
function placeholderEmail(phoneE164: string): string {
  return `${phoneE164.replace(/\D/g, '')}@phone.nannyapp.local`;
}

async function ensureFirebaseUser(email: string, password: string): Promise<string> {
  try {
    const existing = await firebaseAuth.getUserByEmail(email);
    // Reset the password: a half-provisioned account from an earlier run would
    // otherwise fail sign-in with a stale credential.
    await firebaseAuth.updateUser(existing.uid, { password });
    return existing.uid;
  } catch {
    const created = await firebaseAuth.createUser({ email, password });
    return created.uid;
  }
}

async function seedAccount(spec: AccountSpec): Promise<void> {
  const email = placeholderEmail(spec.phone);
  const firebaseUid = await ensureFirebaseUser(email, spec.password);

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      firebaseUid,
      email,
      phone: spec.phone,
      firstName: spec.firstName ?? 'E2E',
      lastName: spec.lastName ?? (spec.role === Role.NANNY ? 'Nanny' : 'Mother'),
      role: spec.role,
      // Both roles are gated on an approved ID — a mother cannot book without
      // one and a nanny cannot reach her dashboard. Flows that exercise those
      // gates set the status themselves; the lab's baseline is "past the gate".
      idVerificationStatus: 'APPROVED',
      ...LOCATION,
      address: '1 Test Street, Cairo',
    },
    // The emulator is wiped between runs and issues a fresh uid each time; a
    // stale one would pass sign-in and then fail every authenticated request.
    update: {
      firebaseUid,
      phone: spec.phone,
      role: spec.role,
      idVerificationStatus: 'APPROVED',
      deletedAt: null,
    },
  });

  if (spec.role === Role.NANNY) {
    const existing = await prisma.nannyProfile.findFirst({ where: { userId: user.id } });
    const profile = {
      bio: 'Seeded for the mobile E2E lab.',
      yearsOfExperience: 3,
      // Required and has no schema default — omitting it fails at the DB.
      ageRanges: ['0-1', '2-5'],
      isProfileComplete: true,
      // APPROVED: a PENDING_REVIEW nanny is invisible to search and cannot be
      // booked. Flows testing the vetting gate downgrade it themselves.
      approvalStatus: 'APPROVED' as const,
      availabilityType: 'FULL_TIME' as const,
    };

    if (existing) {
      await prisma.nannyProfile.update({ where: { id: existing.id }, data: profile });
    } else {
      await prisma.nannyProfile.create({
        data: { user: { connect: { id: user.id } }, ...profile },
      });
    }
  }

  // eslint-disable-next-line no-console
  console.log(`[seed-mobile] ${spec.role.padEnd(6)} ${spec.phone}  (${email})`);
}

async function main(): Promise<void> {
  const raw = process.env['E2E_MOBILE_ACCOUNTS'];
  if (!raw) throw new Error('E2E_MOBILE_ACCOUNTS is required (a JSON array of account specs).');

  for (const spec of JSON.parse(raw) as AccountSpec[]) {
    await seedAccount(spec);
  }
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('[seed-mobile]', error);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
