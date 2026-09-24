/**
 * Provisions everything the mobile E2E lab spends: the accounts it signs in as,
 * the catalogue rows its flows redeem, and the platform configuration those
 * flows assume.
 *
 * Sibling of `seed-roles.ts`, and here for the same reason: the Firebase Admin
 * SDK, the Prisma client and the test environment all live in the backend, and
 * neither the mobile package nor a Maestro flow has any of them.
 *
 * Each account carries its own real email address (`apps/mobile/e2e/accounts.mjs`),
 * matching what registration now links as the Firebase credential — there is no
 * placeholder to derive, so the address is used as-is for both the Firebase
 * user and the `users` row.
 *
 * Usage:
 *   E2E_MOBILE_ACCOUNTS='[{"phone":"+201100000001","email":"e2e-mother@nannyapp.test","password":"…","role":"MOTHER"}]' \
 *   E2E_LAB_FIXTURES='{"platformSettings":{…},"promoCodes":[…],…}' \
 *     pnpm exec ts-node --transpile-only -r tsconfig-paths/register test/e2e/seed-mobile.ts
 *
 * Idempotent, and deliberately more than idempotent: unlike the integration
 * suite, the lab's database is never truncated between runs, so this also
 * *undoes* the previous run. Without that, the second run books a nanny who is
 * already busy at that hour, and re-spends a code she has already used.
 */
import '../env';

import { Role } from '@prisma/client';

import { prisma } from '@backend/db/prisma';
import { firebaseAuth } from '@backend/lib/firebase';

type AccountSpec = {
  /** E.164, as the app builds it from the country code plus typed digits. */
  phone: string;
  /** The real address registration links as the Firebase credential. */
  email: string;
  password: string;
  role: Extract<Role, 'MOTHER' | 'NANNY'>;
  firstName?: string;
  lastName?: string;
  /** Defaults to APPROVED; A10 seeds a nanny still awaiting vetting, A11 a mother who has never uploaded an ID. */
  approvalStatus?: 'PENDING_ID' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
};

/** The console account the lab approves with; a superuser, so nothing is out of reach. */
type AdminSpec = { email: string; password: string };

type PromoSpec = {
  code: string;
  discountType: 'FLAT' | 'PERCENTAGE';
  value: number;
  maxUsage?: number;
  /** Seeds a code that is already spent, so a flow can assert the refusal. */
  usageCount?: number;
};

/** Mirrors `apps/mobile/e2e/fixtures.mjs`, which is where these values live. */
type LabFixtures = {
  platformSettings: Record<string, string>;
  promoCodes: PromoSpec[];
  package: { name: string; hours: number; price: number; validityDays: number };
  carePoints: number;
  admin: AdminSpec;
};

/** Cairo city centre — matches the seed data's region, so distance ranking behaves. */
const LOCATION = { latitude: 30.0444, longitude: 31.2357 };

/**
 * Provisions the Firebase account behind one row.
 *
 * `phoneNumber` matters for more than realism: recovery is phone-based
 * (ForgotPasswordScreen texts a code, confirming it signs in as the phone uid,
 * then updatePassword rewrites the credential SignInScreen checks). For that to
 * reset the *same* account she signs in with, the phone number has to hang off
 * her email/password uid — which is exactly what real registration does
 * (`useConfirmPhoneAndLink` links the password onto the phone-verified uid).
 * Without it the emulator's phone sign-in would mint a second user and the
 * reset would land on nobody. The admin has no phone and passes none.
 */
async function ensureFirebaseUser(
  email: string,
  password: string,
  phoneNumber?: string,
): Promise<string> {
  const fields = phoneNumber ? { password, phoneNumber } : { password };
  try {
    const existing = await firebaseAuth.getUserByEmail(email);
    // Reset the password (and re-link the phone): a half-provisioned account
    // from an earlier run would otherwise fail sign-in with a stale credential.
    // And drop a Google identity C12 linked last run — left on, it would sign
    // straight into this account instead of reaching the collision it tests.
    const hasGoogle = existing.providerData.some((p) => p.providerId === 'google.com');
    await firebaseAuth.updateUser(
      existing.uid,
      hasGoogle ? { ...fields, providersToUnlink: ['google.com'] } : fields,
    );
    return existing.uid;
  } catch {
    const created = await firebaseAuth.createUser({ email, ...fields });
    return created.uid;
  }
}

async function seedAccount(spec: AccountSpec): Promise<number> {
  const email = spec.email;
  const firebaseUid = await ensureFirebaseUser(email, spec.password, spec.phone);

  // Both roles are gated on their approval status, but not the same way: a
  // mother must have an ID on file (not PENDING_ID/REJECTED) before she can
  // book, while a nanny must be APPROVED before she can reach her dashboard.
  // The lab's baseline is "past the gate"; the flows that exercise a gate ask
  // for an account on the wrong side of it, and are re-seeded before every run
  // because they approve it.
  const approvalStatus = spec.approvalStatus ?? 'APPROVED';

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      firebaseUid,
      email,
      phone: spec.phone,
      firstName: spec.firstName ?? 'E2E',
      lastName: spec.lastName ?? (spec.role === Role.NANNY ? 'Nanny' : 'Mother'),
      role: spec.role,
      approvalStatus,
      // Booking is gated on a proven address, and the root router blocks an
      // account without one at launch. These stand in for accounts registered
      // the normal way, which prove an address mid-wizard — C2 and A10 drive
      // that step, and a14-mother-email-gate.test.ts covers the endpoints.
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
    },
    // The emulator is wiped between runs and issues a fresh uid each time; a
    // stale one would pass sign-in and then fail every authenticated request.
    update: {
      firebaseUid,
      phone: spec.phone,
      role: spec.role,
      approvalStatus,
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
      // Cleared so a flow that rejected this account last run does not leave a
      // stale reason on the gate's copy.
      rejectionReason: null,
      deletedAt: null,
    },
  });

  // Where the account lives: one default "Home" row, which the booking picker
  // preselects for a mother and proximity matching reads for a nanny. Kept in
  // step across runs — a flow that added or moved addresses last time must
  // not leave the baseline account with a different default.
  const home = await prisma.address.findFirst({
    where: { userId: user.id, deletedAt: null, isDefault: true },
  });
  const homeFields = { label: 'Home', formattedAddress: '1 Test Street, Cairo', ...LOCATION };
  if (home) {
    await prisma.address.update({ where: { id: home.id }, data: homeFields });
  } else {
    await prisma.address.create({ data: { userId: user.id, isDefault: true, ...homeFields } });
  }

  if (spec.role === Role.NANNY) {
    const existing = await prisma.nannyProfile.findFirst({ where: { userId: user.id } });
    const profile = {
      bio: 'Seeded for the mobile E2E lab.',
      yearsOfExperience: 3,
      // Required and has no schema default — omitting it fails at the DB.
      ageRanges: ['0-1', '1-3'],
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
  return user.id;
}

/**
 * The console account the flows approve with.
 *
 * A superuser, because what these flows care about is the approval landing —
 * which sections an operator may reach is A12's subject and is driven far more
 * thoroughly by the admin suite. Its email is deliberately unlike the admin
 * suite's, so the two labs never share an account.
 */
async function seedAdmin(spec: AdminSpec): Promise<void> {
  const firebaseUid = await ensureFirebaseUser(spec.email, spec.password);

  await prisma.user.upsert({
    where: { email: spec.email },
    create: {
      firebaseUid,
      email: spec.email,
      firstName: 'E2E',
      lastName: 'Lab',
      role: Role.SUPERUSER,
    },
    update: { firebaseUid, role: Role.SUPERUSER, deletedAt: null },
  });

  // eslint-disable-next-line no-console
  console.log(`[seed-mobile] ADMIN  ${spec.email}`);
}

/**
 * Puts the platform into the configuration the flows were written against.
 *
 * Written straight to `app_settings` rather than through `PUT /admin/config`:
 * seeding already owns a Prisma client, and going out over HTTP would make the
 * lab's setup depend on the backend being up before it could configure it. The
 * keys are the service's own, so a rename shows up as a flow failing on a slot
 * it can no longer pick — see `apps/mobile/e2e/fixtures.mjs` for why each value
 * is what it is.
 */
async function configurePlatform(settings: Record<string, string>): Promise<void> {
  for (const [key, value] of Object.entries(settings)) {
    await prisma.appSettings.upsert({
      where: { key },
      create: { key, value },
      update: { value, deletedAt: null },
    });
  }
  // eslint-disable-next-line no-console
  console.log(`[seed-mobile] platform  ${Object.keys(settings).length} settings`);
}

/**
 * Undoes the previous run for these accounts.
 *
 * Soft deletes throughout, which is enough because every read that matters
 * filters on `deletedAt` — the nanny's double-booking guard, the promo code's
 * per-user cap and the parent's live-booking card all do. The one exception is
 * `package_purchases`, whose "at most one active package" rule is a partial
 * unique index on (user_id, is_active_slot) that ignores `deleted_at`
 * entirely — so the slot has to be released explicitly or the next purchase
 * collides at the database.
 */
async function resetPreviousRun(userIds: number[]): Promise<void> {
  const deletedAt = new Date();

  const bookings = await prisma.booking.findMany({
    where: {
      deletedAt: null,
      OR: [{ motherId: { in: userIds } }, { nannyProfile: { userId: { in: userIds } } }],
    },
    select: { id: true },
  });
  const bookingIds = bookings.map((b) => b.id);

  if (bookingIds.length > 0) {
    // Children first: a booking's dependants outlive it otherwise, and the
    // care-log and extension lists are read by booking id, not by status.
    await prisma.bookingExtension.updateMany({
      where: { bookingId: { in: bookingIds }, deletedAt: null },
      data: { deletedAt },
    });
    await prisma.booking.updateMany({ where: { id: { in: bookingIds } }, data: { deletedAt } });
  }

  await prisma.promoCodeRedemption.updateMany({
    where: { userId: { in: userIds }, deletedAt: null },
    data: { deletedAt },
  });

  await prisma.packagePurchase.updateMany({
    where: { userId: { in: userIds }, deletedAt: null },
    data: { deletedAt, isActiveSlot: null, status: 'EXPIRED' },
  });

  // eslint-disable-next-line no-console
  console.log(`[seed-mobile] reset     ${bookingIds.length} bookings`);
}

/**
 * Frees a throwaway registration account, so a flow that signs up from scratch
 * can run again.
 *
 * The account every other flow uses is upserted and kept; this one is *created*
 * by the flow itself, so a completed run leaves a User row whose unique phone /
 * email / firebaseUid would collide on the next run's `/auth/register`. A hard
 * delete is fragile — by the time the flow reaches home the account has grown a
 * push-token, a referral row, reward ledger entries and notifications, and any
 * FK missed here fails the delete. So instead of chasing dependents this frees
 * only what actually collides: it mangles the four unique columns and
 * soft-deletes the row. `/auth/register`'s "phone already exists" check then
 * finds nothing, and the leftover row is inert (every read filters
 * `deleted_at`). The Firebase user is removed so phone sign-in mints a fresh
 * uid and the number/email are free there too.
 */
async function wipeAccount(spec: { phone?: string; role?: string; email: string }): Promise<void> {
  const email = spec.email;

  // Look the DB row up by phone, not email: a run that crashed before the
  // email-verification step never linked one, and phone is the one identifier
  // guaranteed to be on the row from registration's first step. An email-only
  // spec (C12's Google identity) never has a row.
  const user = spec.phone ? await prisma.user.findUnique({ where: { phone: spec.phone } }) : null;
  if (user) {
    const tag = `wiped-${user.id}-`;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        deletedAt: new Date(),
        phone: `${tag}${user.phone}`,
        email: `${tag}${user.email}`,
        firebaseUid: `${tag}${user.firebaseUid}`,
        // The referral code is unique too, and is generated lazily the first
        // time she opens her own referral screen — null it so it cannot clash.
        referralCode: null,
      },
    });
  }

  // Remove the Firebase account under either handle — a fully-linked user is
  // found by email; a run that died between phone-verify and link leaves a
  // phone-only user found only by number.
  const lookups = [() => firebaseAuth.getUserByEmail(email)];
  if (spec.phone) {
    const phone = spec.phone;
    lookups.push(() => firebaseAuth.getUserByPhoneNumber(phone));
  }
  for (const lookup of lookups) {
    try {
      const fb = await lookup();
      await firebaseAuth.deleteUser(fb.uid);
    } catch {
      // Not present under this lookup — nothing to remove.
    }
  }

  // The wizard mails a code to a fixed address, and abuse control on that
  // address is per-row (a 60s resend cooldown, 5 sends an hour). Left behind,
  // those rows make the second run of the day fail on a 429 rather than on
  // anything the flow is testing.
  await prisma.emailVerification.deleteMany({ where: { email: spec.email } });

  // eslint-disable-next-line no-console
  console.log(`[seed-mobile] wipe      ${spec.phone ?? '(no phone)'}  (${email})`);
}

/** Upserts the codes A4 spends, resetting the counters a previous run moved. */
async function seedPromoCodes(specs: PromoSpec[]): Promise<void> {
  for (const spec of specs) {
    const shape = {
      discountType: spec.discountType,
      value: spec.value,
      maxUsage: spec.maxUsage ?? null,
      maxUsagePerUser: null,
      usageCount: spec.usageCount ?? 0,
      isActive: true,
      expiresAt: null,
      deletedAt: null,
    };
    await prisma.promoCode.upsert({
      where: { code: spec.code },
      create: { code: spec.code, ...shape },
      update: shape,
    });
  }
  // eslint-disable-next-line no-console
  console.log(`[seed-mobile] promo     ${specs.map((s) => s.code).join(', ')}`);
}

async function seedPackage(spec: LabFixtures['package']): Promise<void> {
  const shape = {
    hours: spec.hours,
    price: spec.price,
    validityDays: spec.validityDays,
    description: 'Seeded for the mobile E2E lab.',
    isActive: true,
    expiresAt: null,
    deletedAt: null,
  };
  await prisma.package.upsert({
    where: { name: spec.name },
    create: { name: spec.name, ...shape },
    update: shape,
  });
  // eslint-disable-next-line no-console
  console.log(`[seed-mobile] package   ${spec.name}`);
}

/**
 * Sets the mother's Care Points balance to a known number.
 *
 * A grant, with a matching ledger entry, rather than a bare balance write: the
 * wallet screen renders the ledger, and a balance with no history behind it
 * would make A5's "the ledger balances" assertion vacuous.
 */
async function seedCarePoints(userId: number, points: number): Promise<void> {
  const wallet = await prisma.rewardWallet.upsert({
    where: { userId },
    create: { userId, pointsBalance: points, lifetimeEarned: points },
    update: { pointsBalance: points, deletedAt: null },
  });

  await prisma.rewardLedgerEntry.create({
    data: {
      walletId: wallet.id,
      userId,
      type: 'ADMIN_GRANT',
      points,
      balanceAfter: points,
      reason: 'Seeded for the mobile E2E lab.',
    },
  });

  // eslint-disable-next-line no-console
  console.log(`[seed-mobile] points    ${points} to user ${userId}`);
}

async function main(): Promise<void> {
  const rawAccounts = process.env['E2E_MOBILE_ACCOUNTS'];
  if (!rawAccounts) {
    throw new Error('E2E_MOBILE_ACCOUNTS is required (a JSON array of account specs).');
  }
  const rawFixtures = process.env['E2E_LAB_FIXTURES'];
  if (!rawFixtures) {
    throw new Error('E2E_LAB_FIXTURES is required (see apps/mobile/e2e/fixtures.mjs).');
  }
  const fixtures = JSON.parse(rawFixtures) as LabFixtures;

  // Registration flows create their account from scratch, so it is wiped rather
  // than upserted — before anything else, so a half-written row from a crashed
  // run cannot trip the seeding that follows.
  const rawWipe = process.env['E2E_MOBILE_WIPE'];
  if (rawWipe) {
    const toWipe = JSON.parse(rawWipe) as { phone?: string; role?: string; email: string }[];
    for (const spec of toWipe) await wipeAccount(spec);
  }

  await configurePlatform(fixtures.platformSettings);

  const specs = JSON.parse(rawAccounts) as AccountSpec[];
  const userIds: number[] = [];
  let motherId: number | null = null;
  for (const spec of specs) {
    const id = await seedAccount(spec);
    userIds.push(id);
    if (spec.role === Role.MOTHER && motherId === null) motherId = id;
  }

  // After the accounts exist (their ids are what it cleans up), before the
  // fixtures — the reset soft-deletes purchases, so a package seeded first
  // would still be fine, but the order reads as "undo, then set up".
  await resetPreviousRun(userIds);

  await seedAdmin(fixtures.admin);
  await seedPromoCodes(fixtures.promoCodes);
  await seedPackage(fixtures.package);
  if (motherId !== null) await seedCarePoints(motherId, fixtures.carePoints);
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('[seed-mobile]', error);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
