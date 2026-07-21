/**
 * Full-app demo seed for video walkthroughs — inserts real rows in PostgreSQL.
 *
 * Usage (from apps/backend):
 *   pnpm db:seed:demo
 *
 * Optional — attach all journeys to YOUR signed-in account:
 *   DEMO_MOTHER_FIREBASE_UID=<firebase-uid> pnpm db:seed:demo
 *   (Sign in to the app once first so /auth/register creates the user row.)
 *
 * Re-runs remove prior demo rows (ids / firebase_uids prefixed seed-demo-).
 */
import { PrismaPg } from '@prisma/adapter-pg';
import {
  AvailabilityType,
  BookingStatus,
  CommunityPostType,
  ConversationType,
  MessageType,
  NotificationReferenceType,
  NotificationType,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  PrismaClient,
  Role,
} from '@prisma/client';

import { config } from '../src/lib/config';
import { firebaseAuth } from '../src/lib/firebase';

const PREFIX = 'seed-demo-';
/** Password for every seeded Firebase Auth account. */
const SEED_PASSWORD = 'Test1234!';

/** Available every day 07:00–22:00 so any reasonable booking slot works. */
const FULL_WEEK_SCHEDULE = Object.fromEntries(
  Array.from({ length: 7 }, (_, day) => [
    String(day),
    { available: true, startTime: '07:00', endTime: '22:00' },
  ]),
);

/**
 * Create (or update) a real Firebase Auth user and return its uid.
 * Idempotent: looks the account up by email first.
 */
async function ensureAuthUser(email: string, displayName: string): Promise<string> {
  try {
    const existing = await firebaseAuth.getUserByEmail(email);
    await firebaseAuth.updateUser(existing.uid, {
      password: SEED_PASSWORD,
      displayName,
      emailVerified: true,
    });
    return existing.uid;
  } catch (error) {
    if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
    const created = await firebaseAuth.createUser({
      email,
      password: SEED_PASSWORD,
      displayName,
      emailVerified: true,
    });
    return created.uid;
  }
}
const LINKED_MOTHER_UID = process.env['DEMO_MOTHER_FIREBASE_UID']?.trim();

const adapter = new PrismaPg({ connectionString: config.databaseUrl });
const prisma = new PrismaClient({ adapter });

const now = Date.now();
const minutesAgo = (m: number) => new Date(now - m * 60_000);
const hoursAgo = (h: number) => new Date(now - h * 3_600_000);
const daysAgo = (d: number) => new Date(now - d * 86_400_000);
const daysFromNow = (d: number) => new Date(now + d * 86_400_000);

function bookingWindow(
  dayOffset: number,
  startHour: number,
  endHour: number,
): { date: Date; startTime: Date; endTime: Date } {
  const date = daysFromNow(dayOffset);
  date.setHours(0, 0, 0, 0);
  const startTime = new Date(date);
  startTime.setHours(startHour, 0, 0, 0);
  const endTime = new Date(date);
  endTime.setHours(endHour, 0, 0, 0);
  return { date, startTime, endTime };
}

/**
 * Mirror of the mobile app's `phoneToPlaceholderEmail` (apps/mobile/src/lib/validation.ts):
 * sign-in is phone-number-only, backed by email/password with an email
 * derived from the E.164 digits. Keep the two in sync.
 */
function phoneToPlaceholderEmail(phoneE164: string): string {
  const digits = phoneE164.replace(/\D/g, '');
  return `${digits}@phone.nannyapp.local`;
}

const SEED_MOTHERS = [
  {
    firebaseUid: `${PREFIX}sarah`,
    phone: '+201001234567',
    email: phoneToPlaceholderEmail('+201001234567'),
    firstName: 'Sarah',
    lastName: 'Khalil',
    avatarUrl: 'https://i.pravatar.cc/150?u=demo-sarah',
    address: 'Garden City, Cairo',
    latitude: '30.0459',
    longitude: '31.2243',
  },
  {
    firebaseUid: `${PREFIX}elena`,
    phone: '+201112345678',
    email: phoneToPlaceholderEmail('+201112345678'),
    firstName: 'Elena',
    lastName: 'Hassan',
    avatarUrl: 'https://i.pravatar.cc/150?u=demo-elena',
    address: 'Zamalek, Cairo',
    latitude: '30.0700',
    longitude: '31.2200',
  },
  {
    firebaseUid: `${PREFIX}nadia`,
    phone: '+201223456789',
    email: phoneToPlaceholderEmail('+201223456789'),
    firstName: 'Nadia',
    lastName: 'Farouk',
    avatarUrl: 'https://i.pravatar.cc/150?u=demo-nadia',
    address: 'Dokki, Giza',
    latitude: '30.0131',
    longitude: '31.2089',
  },
] as const;

const FALLBACK_DEMO_MOTHER = {
  firebaseUid: `${PREFIX}mother`,
  phone: '+201004455667',
  email: phoneToPlaceholderEmail('+201004455667'),
  firstName: 'Layla',
  lastName: 'Mostafa',
  avatarUrl: 'https://i.pravatar.cc/150?u=demo-mother',
  address: 'Downtown, Cairo',
  latitude: '30.0500',
  longitude: '31.2333',
};

const SEED_NANNIES = [
  {
    firebaseUid: `${PREFIX}nanny-elena`,
    phone: '+201055512340',
    email: phoneToPlaceholderEmail('+201055512340'),
    firstName: 'Elena',
    lastName: 'Rodriguez',
    avatarUrl: 'https://i.pravatar.cc/150?u=demo-nanny-elena',
    bio: 'Certified newborn care specialist with 8 years of experience. CPR & first aid certified.',
    location: 'Zamalek, Cairo',
    latitude: '30.0614',
    longitude: '31.2197',
    yearsOfExperience: 8,
    certifications: ['CPR', 'First Aid', 'Newborn Care'],
    ageRanges: ['0-1', '1-3'],
    specialties: ['Newborn Care', 'Sleep Training'],
    availabilityType: AvailabilityType.FULL_TIME,
    rating: '4.9',
    reviewCount: 24,
  },
  {
    firebaseUid: `${PREFIX}nanny-maya`,
    phone: '+201155512341',
    email: phoneToPlaceholderEmail('+201155512341'),
    firstName: 'Maya',
    lastName: 'Patel',
    avatarUrl: 'https://i.pravatar.cc/150?u=demo-nanny-maya',
    bio: 'Warm and energetic nanny specializing in toddlers and early learning activities.',
    location: 'Maadi, Cairo',
    latitude: '29.9602',
    longitude: '31.2569',
    yearsOfExperience: 5,
    certifications: ['CPR', 'Early Childhood Education'],
    ageRanges: ['1-3', '3-5'],
    specialties: ['Toddler Care', 'Educational Play'],
    availabilityType: AvailabilityType.PART_TIME,
    rating: '4.8',
    reviewCount: 18,
  },
  {
    firebaseUid: `${PREFIX}nanny-claire`,
    phone: '+201255512342',
    email: phoneToPlaceholderEmail('+201255512342'),
    firstName: 'Claire',
    lastName: 'Thompson',
    avatarUrl: 'https://i.pravatar.cc/150?u=demo-nanny-claire',
    bio: 'British expat nanny, fluent in English and Arabic. Great with school-age children.',
    location: 'New Cairo',
    latitude: '30.0074',
    longitude: '31.4913',
    yearsOfExperience: 10,
    certifications: ['CPR', 'Montessori'],
    ageRanges: ['3-5', '5+'],
    specialties: ['Homework Help', 'Bilingual'],
    availabilityType: AvailabilityType.FULL_TIME,
    rating: '5.0',
    reviewCount: 31,
  },
  {
    firebaseUid: `${PREFIX}nanny-sandra`,
    phone: '+201555512343',
    email: phoneToPlaceholderEmail('+201555512343'),
    firstName: 'Sandra',
    lastName: 'Weber',
    avatarUrl: 'https://i.pravatar.cc/150?u=demo-nanny-sandra',
    bio: 'Flexible occasional nanny — perfect for date nights and weekend coverage.',
    location: 'Heliopolis, Cairo',
    latitude: '30.0880',
    longitude: '31.3230',
    yearsOfExperience: 3,
    certifications: ['CPR'],
    ageRanges: ['0-1', '1-3', '3-5'],
    specialties: ['Weekend Care', 'Date Night'],
    availabilityType: AvailabilityType.OCCASIONAL,
    rating: '4.7',
    reviewCount: 9,
  },
] as const;

async function clearPreviousDemoData(linkedMotherId: number | null) {
  // Ids are now autoincrement integers, so demo rows are identified by their
  // owner's seed-demo- firebase_uid (users) or by relation, rather than an
  // id prefix. The optional linked mother is a real account whose
  // demo-attached rows are cleared too (that account is treated as disposable).
  const demoUser = { firebaseUid: { startsWith: PREFIX } };

  await prisma.notification.deleteMany({
    where: {
      OR: [
        { user: demoUser },
        ...(linkedMotherId ? [{ userId: linkedMotherId }] : []),
      ],
    },
  });

  // Deleting a conversation cascades its participants and messages.
  await prisma.conversation.deleteMany({
    where: {
      OR: [
        { initiator: demoUser },
        ...(linkedMotherId ? [{ initiatorId: linkedMotherId }] : []),
      ],
    },
  });

  const demoBookings = await prisma.booking.findMany({
    where: {
      OR: [
        { mother: demoUser },
        ...(linkedMotherId ? [{ motherId: linkedMotherId }] : []),
      ],
    },
    select: { id: true },
  });
  const bookingIds = demoBookings.map((b) => b.id);

  if (bookingIds.length > 0) {
    await prisma.payment.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await prisma.review.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await prisma.careLog.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
  }

  // Deleting a community post cascades its likes, comments and RSVPs.
  await prisma.communityPost.deleteMany({
    where: {
      OR: [
        { author: demoUser },
        ...(linkedMotherId ? [{ authorId: linkedMotherId }] : []),
      ],
    },
  });

  await prisma.nannyProfile.deleteMany({ where: { user: demoUser } });
  await prisma.user.deleteMany({ where: demoUser });

  // eslint-disable-next-line no-console
  console.log('[seed-demo] Cleared previous demo data');
}

async function resolveDemoMother() {
  if (LINKED_MOTHER_UID) {
    const linked = await prisma.user.findUnique({ where: { firebaseUid: LINKED_MOTHER_UID } });
    if (!linked) {
      throw new Error(
        `User with firebase_uid="${LINKED_MOTHER_UID}" not found. Open the app, sign in once, then re-run seed.`,
      );
    }
    await prisma.user.update({
      where: { id: linked.id },
      data: {
        role: Role.MOTHER,
        deletedAt: null,
        avatarUrl: linked.avatarUrl ?? FALLBACK_DEMO_MOTHER.avatarUrl,
        // Backfill a demo home only if the linked account has none, so a real
        // registered home (and its coordinates) is never overwritten.
        address: linked.address ?? FALLBACK_DEMO_MOTHER.address,
        latitude: linked.latitude ?? new Prisma.Decimal(FALLBACK_DEMO_MOTHER.latitude),
        longitude: linked.longitude ?? new Prisma.Decimal(FALLBACK_DEMO_MOTHER.longitude),
        // Pre-verify so the demo booking flow isn't blocked by the ID gate.
        idVerificationStatus: 'APPROVED',
      },
    });
    return linked;
  }

  const fallbackUid = await ensureAuthUser(
    FALLBACK_DEMO_MOTHER.email,
    `${FALLBACK_DEMO_MOTHER.firstName} ${FALLBACK_DEMO_MOTHER.lastName}`,
  );
  return prisma.user.upsert({
    where: { email: FALLBACK_DEMO_MOTHER.email },
    create: {
      ...FALLBACK_DEMO_MOTHER,
      firebaseUid: fallbackUid,
      role: Role.MOTHER,
      isEmailVerified: true,
      isPhoneVerified: true,
      idVerificationStatus: 'APPROVED',
    },
    update: {
      firstName: FALLBACK_DEMO_MOTHER.firstName,
      lastName: FALLBACK_DEMO_MOTHER.lastName,
      avatarUrl: FALLBACK_DEMO_MOTHER.avatarUrl,
      firebaseUid: fallbackUid,
      role: Role.MOTHER,
      deletedAt: null,
      address: FALLBACK_DEMO_MOTHER.address,
      latitude: new Prisma.Decimal(FALLBACK_DEMO_MOTHER.latitude),
      longitude: new Prisma.Decimal(FALLBACK_DEMO_MOTHER.longitude),
      idVerificationStatus: 'APPROVED',
    },
  });
}

async function ensureSeedMothers() {
  const users = [];
  for (const seed of SEED_MOTHERS) {
    const uid = await ensureAuthUser(seed.email, `${seed.firstName} ${seed.lastName}`);
    users.push(
      await prisma.user.upsert({
        where: { email: seed.email },
        create: {
          ...seed,
          firebaseUid: uid,
          role: Role.MOTHER,
          isEmailVerified: true,
          isPhoneVerified: true,
          idVerificationStatus: 'APPROVED',
        },
        update: {
          firebaseUid: uid,
          firstName: seed.firstName,
          lastName: seed.lastName,
          avatarUrl: seed.avatarUrl,
          role: Role.MOTHER,
          deletedAt: null,
          address: seed.address,
          latitude: new Prisma.Decimal(seed.latitude),
          longitude: new Prisma.Decimal(seed.longitude),
          idVerificationStatus: 'APPROVED',
        },
      }),
    );
  }
  return users;
}

async function seedNannies() {
  // Certifications are now an admin-curated catalog joined to nannies. Upsert the
  // union of the demo certification names by their unique name, then link each
  // nanny below via nanny_certifications.
  const certByName = new Map<string, number>();
  const allCertNames = [...new Set(SEED_NANNIES.flatMap((n) => n.certifications))];
  for (const name of allCertNames) {
    const cert = await prisma.certification.upsert({
      where: { name },
      create: { name, isActive: true },
      update: { isActive: true, deletedAt: null },
    });
    certByName.set(name, cert.id);
  }

  const profiles = [];
  for (const n of SEED_NANNIES) {
    const uid = await ensureAuthUser(n.email, `${n.firstName} ${n.lastName}`);
    // Home location (address + distinct coordinates) lives on the user row —
    // the single source of truth proximity search reads.
    const user = await prisma.user.upsert({
      where: { email: n.email },
      create: {
        firebaseUid: uid,
        email: n.email,
        phone: n.phone,
        firstName: n.firstName,
        lastName: n.lastName,
        avatarUrl: n.avatarUrl,
        role: Role.NANNY,
        isEmailVerified: true,
        isPhoneVerified: true,
        address: n.location,
        latitude: new Prisma.Decimal(n.latitude),
        longitude: new Prisma.Decimal(n.longitude),
        // Demo nannies are pre-vetted so they appear in search — the KYC gate
        // now lives on the user row (default PENDING_ID/PENDING_REVIEW is hidden).
        idVerificationStatus: 'APPROVED',
      },
      update: {
        firstName: n.firstName,
        lastName: n.lastName,
        avatarUrl: n.avatarUrl,
        firebaseUid: uid,
        role: Role.NANNY,
        deletedAt: null,
        address: n.location,
        latitude: new Prisma.Decimal(n.latitude),
        longitude: new Prisma.Decimal(n.longitude),
        idVerificationStatus: 'APPROVED',
      },
    });

    const profile = await prisma.nannyProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        bio: n.bio,
        yearsOfExperience: n.yearsOfExperience,
        ageRanges: [...n.ageRanges],
        specialties: [...n.specialties],
        availabilityType: n.availabilityType,
        schedule: FULL_WEEK_SCHEDULE,
        rating: new Prisma.Decimal(n.rating),
        reviewCount: n.reviewCount,
        isProfileComplete: true,
        // Demo nannies are pre-vetted so they appear in search (the default is
        // PENDING_REVIEW, which is hidden from the directory).
        approvalStatus: 'APPROVED',
      },
      update: {
        bio: n.bio,
        schedule: FULL_WEEK_SCHEDULE,
        rating: new Prisma.Decimal(n.rating),
        reviewCount: n.reviewCount,
        isProfileComplete: true,
        approvalStatus: 'APPROVED',
        deletedAt: null,
      },
    });

    // Reconcile the nanny's certification links from the seeded catalog
    // (idempotent — replace the full set each run).
    await prisma.nannyCertification.deleteMany({ where: { nannyProfileId: profile.id } });
    await prisma.nannyCertification.createMany({
      data: n.certifications.map((certName) => ({
        nannyProfileId: profile.id,
        certificationId: certByName.get(certName)!,
      })),
    });

    profiles.push(profile);
  }
  return profiles;
}

async function seedCommunity(motherId: number, sarahId: number, elenaId: number, nadiaId: number) {
  const stroller = await prisma.communityPost.create({
    data: {
      authorId: nadiaId,
      type: CommunityPostType.MARKETPLACE,
      title: 'Chicco Liteway Stroller',
      body: 'Lightweight stroller, gently used for 6 months. Folds easily — perfect for Cairo errands.',
      imageUrls: ['https://picsum.photos/seed/demo-stroller/800/600'],
      price: new Prisma.Decimal('2500.00'),
      tags: ['Local', 'Activities'],
      likeCount: 4,
      commentCount: 1,
      createdAt: daysAgo(2),
    },
  });

  const clothes = await prisma.communityPost.create({
    data: {
      authorId: motherId,
      type: CommunityPostType.MARKETPLACE,
      title: '0–12 month clothes bundle',
      body: 'About 20 pieces, smoke-free home. Mixed brands, mostly 6–12M.',
      imageUrls: [
        'https://picsum.photos/seed/demo-clothes/800/600',
        'https://picsum.photos/seed/demo-clothes-2/800/600',
      ],
      price: new Prisma.Decimal('450.00'),
      tags: ['Parenting'],
      likeCount: 2,
      commentCount: 0,
      createdAt: daysAgo(4),
    },
  });

  const highChair = await prisma.communityPost.create({
    data: {
      authorId: elenaId,
      type: CommunityPostType.MARKETPLACE,
      title: 'IKEA Antilop High Chair',
      body: 'With tray and harness. Easy to wipe clean. Pickup in Maadi.',
      imageUrls: ['https://picsum.photos/seed/demo-highchair/800/600'],
      price: new Prisma.Decimal('800.00'),
      tags: ['Feeding', 'Local'],
      likeCount: 1,
      commentCount: 0,
      createdAt: daysAgo(1),
    },
  });

  const qaPost = await prisma.communityPost.create({
    data: {
      authorId: sarahId,
      type: CommunityPostType.QA,
      body: 'My 8-month-old wakes every 2 hours. What helped your little ones sleep through the night?',
      tags: ['Sleep', 'Parenting'],
      likeCount: 3,
      commentCount: 2,
      createdAt: daysAgo(3),
    },
  });

  const eventPost = await prisma.communityPost.create({
    data: {
      authorId: elenaId,
      type: CommunityPostType.EVENT,
      title: 'New moms coffee morning',
      body: 'Casual meetup — stroller-friendly café in Zamalek.',
      location: 'Zoya Café, Zamalek, Cairo',
      eventStartsAt: daysFromNow(6),
      maxAttendees: 12,
      rsvpCount: 3,
      tags: ['Local', 'Parenting'],
      likeCount: 5,
      commentCount: 1,
      createdAt: daysAgo(5),
    },
  });

  await prisma.postLike.createMany({
    data: [
      { postId: stroller.id, userId: motherId },
      { postId: stroller.id, userId: sarahId },
      { postId: clothes.id, userId: elenaId },
      { postId: qaPost.id, userId: motherId },
      { postId: eventPost.id, userId: motherId },
    ],
    skipDuplicates: true,
  });

  await prisma.comment.createMany({
    data: [
      {
        postId: stroller.id,
        authorId: sarahId,
        body: 'Is this still available? Does it recline flat for naps?',
        likeCount: 0,
        createdAt: daysAgo(1),
      },
      {
        postId: qaPost.id,
        authorId: elenaId,
        body: 'We moved bedtime earlier by 30 minutes — took about a week to settle.',
        likeCount: 1,
        createdAt: daysAgo(2),
      },
      {
        postId: qaPost.id,
        authorId: nadiaId,
        body: 'White noise and a consistent routine helped us a lot at that age.',
        likeCount: 0,
        createdAt: daysAgo(2),
      },
      {
        postId: eventPost.id,
        authorId: sarahId,
        body: 'Count me in! Should we book a table or just show up?',
        likeCount: 0,
        createdAt: daysAgo(4),
      },
    ],
  });

  await prisma.eventRsvp.createMany({
    data: [
      { postId: eventPost.id, userId: motherId },
      { postId: eventPost.id, userId: sarahId },
      { postId: eventPost.id, userId: nadiaId },
    ],
    skipDuplicates: true,
  });

  return { stroller, clothes, highChair, qaPost, eventPost };
}

async function seedMessaging(
  motherId: number,
  motherName: string,
  nadiaId: number,
  nadiaName: string,
  elenaId: number,
  elenaName: string,
  strollerPostId: number,
  clothesPostId: number,
) {
  const convStroller = await prisma.conversation.create({
    data: {
      type: ConversationType.MARKETPLACE,
      communityPostId: strollerPostId,
      initiatorId: motherId,
      updatedAt: minutesAgo(12),
      participants: {
        create: [
          { userId: motherId, lastReadAt: minutesAgo(5) },
          { userId: nadiaId, lastReadAt: hoursAgo(2) },
        ],
      },
      messages: {
        create: [
          {
            senderId: motherId,
            content: 'Hi! Is the stroller still available? Can you do EGP 2,200?',
            createdAt: hoursAgo(3),
          },
          {
            senderId: nadiaId,
            content: 'Yes it is! I can do 2,350 — it is in great condition.',
            createdAt: hoursAgo(2),
          },
          {
            senderId: motherId,
            content: 'Sounds good. Can I pick it up Saturday morning in New Cairo?',
            createdAt: minutesAgo(12),
          },
        ],
      },
    },
  });

  const convClothes = await prisma.conversation.create({
    data: {
      type: ConversationType.MARKETPLACE,
      communityPostId: clothesPostId,
      initiatorId: elenaId,
      updatedAt: minutesAgo(45),
      participants: {
        create: [
          { userId: elenaId, lastReadAt: minutesAgo(40) },
          {
            userId: motherId,
            lastReadAt: null,
          },
        ],
      },
      messages: {
        create: [
          {
            senderId: elenaId,
            content: 'Hello! Interested in the clothes bundle — are any pieces 0–3M?',
            createdAt: hoursAgo(5),
          },
          {
            senderId: motherId,
            content: 'Hi Elena! About half are 6–12M, a few 3–6M pieces too.',
            createdAt: hoursAgo(4),
          },
          {
            senderId: elenaId,
            content: 'Perfect, I will take the bundle. Can we meet tomorrow?',
            createdAt: minutesAgo(45),
          },
        ],
      },
    },
  });

  await prisma.notification.createMany({
    data: [
      {
        userId: motherId,
        type: NotificationType.MARKETPLACE_MESSAGE,
        title: 'New message',
        body: `${nadiaName} sent a message about "Chicco Liteway Stroller"`,
        isRead: true,
        referenceId: convStroller.id,
        referenceType: NotificationReferenceType.CONVERSATION,
        createdAt: hoursAgo(2),
      },
      {
        userId: motherId,
        type: NotificationType.MARKETPLACE_MESSAGE,
        title: 'New message',
        body: `${elenaName} sent a message about "0–12 month clothes bundle"`,
        isRead: false,
        referenceId: convClothes.id,
        referenceType: NotificationReferenceType.CONVERSATION,
        createdAt: minutesAgo(45),
      },
      {
        userId: nadiaId,
        type: NotificationType.MARKETPLACE_MESSAGE,
        title: 'New message',
        body: `${motherName} sent a message about "Chicco Liteway Stroller"`,
        isRead: true,
        referenceId: convStroller.id,
        referenceType: NotificationReferenceType.CONVERSATION,
        createdAt: minutesAgo(12),
      },
      {
        userId: motherId,
        type: NotificationType.MARKETPLACE_MESSAGE,
        title: 'New message',
        body: `${nadiaName} sent a message about "Chicco Liteway Stroller"`,
        isRead: true,
        referenceId: convStroller.id,
        referenceType: NotificationReferenceType.CONVERSATION,
        createdAt: daysAgo(1),
      },
      {
        userId: motherId,
        type: NotificationType.MARKETPLACE_MESSAGE,
        title: 'New message',
        body: `${elenaName} sent a message about "0–12 month clothes bundle"`,
        isRead: true,
        referenceId: convClothes.id,
        referenceType: NotificationReferenceType.CONVERSATION,
        createdAt: daysAgo(2),
      },
    ],
  });

  return { convStroller, convClothes };
}

async function seedBookings(
  motherId: number,
  nannyProfiles: { id: number }[],
) {
  const [elena, maya, claire, sandra] = nannyProfiles;
  const serviceFeePercent = new Prisma.Decimal('6.00');

  const upcoming = bookingWindow(5, 9, 17);
  const durationUpcoming = 8;
  const rateUpcoming = 180;
  const subtotalUpcoming = rateUpcoming * durationUpcoming;
  const feeUpcoming = subtotalUpcoming * 0.06;
  const totalUpcoming = subtotalUpcoming + feeUpcoming;

  const upcomingBooking = await prisma.booking.create({
    data: {
      motherId,
      nannyProfileId: elena.id,
      status: BookingStatus.CONFIRMED,
      date: upcoming.date,
      startTime: upcoming.startTime,
      endTime: upcoming.endTime,
      durationHours: new Prisma.Decimal(String(durationUpcoming)),
      baseRate: new Prisma.Decimal(String(rateUpcoming)),
      subtotal: new Prisma.Decimal(String(subtotalUpcoming)),
      serviceFeePercent,
      serviceFeeAmount: new Prisma.Decimal(String(feeUpcoming)),
      totalAmount: new Prisma.Decimal(String(totalUpcoming)),
      payments: {
        create: {
          motherId,
          amount: new Prisma.Decimal(String(totalUpcoming)),
          method: PaymentMethod.CARD,
          status: PaymentStatus.CAPTURED,
        },
      },
    },
  });

  const past = bookingWindow(-14, 10, 16);
  const durationPast = 6;
  const ratePast = 150;
  const subtotalPast = ratePast * durationPast;
  const feePast = subtotalPast * 0.06;
  const totalPast = subtotalPast + feePast;

  const pastBooking = await prisma.booking.create({
    data: {
      motherId,
      nannyProfileId: maya.id,
      status: BookingStatus.COMPLETED,
      date: past.date,
      startTime: past.startTime,
      endTime: past.endTime,
      durationHours: new Prisma.Decimal(String(durationPast)),
      baseRate: new Prisma.Decimal(String(ratePast)),
      subtotal: new Prisma.Decimal(String(subtotalPast)),
      serviceFeePercent,
      serviceFeeAmount: new Prisma.Decimal(String(feePast)),
      totalAmount: new Prisma.Decimal(String(totalPast)),
      nannyCheckedInAt: past.startTime,
      nannyCheckedOutAt: past.endTime,
      payments: {
        create: {
          motherId,
          amount: new Prisma.Decimal(String(totalPast)),
          method: PaymentMethod.CARD,
          status: PaymentStatus.CAPTURED,
        },
      },
      review: {
        create: {
          nannyProfileId: maya.id,
          motherId,
          rating: 5,
          comment: 'Maya was wonderful with our toddler. Very punctual and communicative.',
        },
      },
    },
  });

  const past2 = bookingWindow(-30, 9, 13);
  const durationPast2 = 4;
  const ratePast2 = 200;
  const subtotalPast2 = ratePast2 * durationPast2;
  const feePast2 = subtotalPast2 * 0.06;
  const totalPast2 = subtotalPast2 + feePast2;

  const cancelled = bookingWindow(3, 18, 22);
  const durationCancelled = 4;
  const rateCancelled = 120;
  const subtotalCancelled = rateCancelled * durationCancelled;
  const feeCancelled = subtotalCancelled * 0.06;
  const totalCancelled = subtotalCancelled + feeCancelled;

  await prisma.booking.create({
    data: {
      motherId,
      nannyProfileId: sandra.id,
      status: BookingStatus.CANCELLED,
      date: cancelled.date,
      startTime: cancelled.startTime,
      endTime: cancelled.endTime,
      durationHours: new Prisma.Decimal(String(durationCancelled)),
      baseRate: new Prisma.Decimal(String(rateCancelled)),
      subtotal: new Prisma.Decimal(String(subtotalCancelled)),
      serviceFeePercent,
      serviceFeeAmount: new Prisma.Decimal(String(feeCancelled)),
      totalAmount: new Prisma.Decimal(String(totalCancelled)),
      cancellationReason: 'Plans changed — rescheduled for next month',
      cancelledById: motherId,
      cancelledAt: daysAgo(2),
    },
  });

  await prisma.booking.create({
    data: {
      motherId,
      nannyProfileId: claire.id,
      status: BookingStatus.COMPLETED,
      date: past2.date,
      startTime: past2.startTime,
      endTime: past2.endTime,
      durationHours: new Prisma.Decimal(String(durationPast2)),
      baseRate: new Prisma.Decimal(String(ratePast2)),
      subtotal: new Prisma.Decimal(String(subtotalPast2)),
      serviceFeePercent,
      serviceFeeAmount: new Prisma.Decimal(String(feePast2)),
      totalAmount: new Prisma.Decimal(String(totalPast2)),
      payments: {
        create: {
          motherId,
          amount: new Prisma.Decimal(String(totalPast2)),
          method: PaymentMethod.WALLET,
          status: PaymentStatus.CAPTURED,
        },
      },
      review: {
        create: {
          nannyProfileId: claire.id,
          motherId,
          rating: 5,
          comment: 'Claire helped with homework and kept the kids engaged all morning.',
        },
      },
    },
  });

  return { upcomingBooking, pastBooking };
}

const SEED_PACKAGES = [
  {
    name: 'Starter Pack',
    description: '20 hours of care to get started',
    hours: 20,
    price: 900,
    validityDays: 30,
    maxSkills: 0,
  },
  {
    name: 'Standard Pack',
    description: '50 hours at a discounted rate',
    hours: 50,
    price: 2000,
    validityDays: 60,
    maxSkills: 1,
  },
  {
    name: 'Premium Pack',
    description: '100 hours for regular care',
    hours: 100,
    price: 3600,
    validityDays: 90,
    maxSkills: 2,
  },
];

async function seedPackages() {
  for (const p of SEED_PACKAGES) {
    await prisma.package.upsert({
      where: { name: p.name },
      create: {
        name: p.name,
        description: p.description,
        hours: p.hours,
        price: p.price,
        validityDays: p.validityDays,
        maxSkills: p.maxSkills,
        isActive: true,
      },
      update: {
        description: p.description,
        hours: p.hours,
        price: p.price,
        validityDays: p.validityDays,
        maxSkills: p.maxSkills,
        isActive: true,
        deletedAt: null,
      },
    });
  }
}

async function main() {
  const linkedMother = LINKED_MOTHER_UID
    ? await prisma.user.findUnique({ where: { firebaseUid: LINKED_MOTHER_UID } })
    : null;

  await clearPreviousDemoData(linkedMother?.id ?? null);

  const demoMother = await resolveDemoMother();
  const [sarah, elena, nadia] = await ensureSeedMothers();
  const nannyProfiles = await seedNannies();

  const motherName = `${demoMother.firstName} ${demoMother.lastName}`.trim();
  const posts = await seedCommunity(demoMother.id, sarah.id, elena.id, nadia.id);

  await seedMessaging(
    demoMother.id,
    motherName,
    nadia.id,
    `${nadia.firstName} ${nadia.lastName}`,
    elena.id,
    `${elena.firstName} ${elena.lastName}`,
    posts.stroller.id,
    posts.clothes.id,
  );

  await seedBookings(demoMother.id, nannyProfiles);

  await seedPackages();

  // eslint-disable-next-line no-console
  console.log('[seed-demo] Done — demo data ready for video recording');
  // eslint-disable-next-line no-console
  console.log(`  Demo mother: ${demoMother.email} (${demoMother.firebaseUid})`);
  if (LINKED_MOTHER_UID) {
    // eslint-disable-next-line no-console
    console.log('  Linked to your Firebase account via DEMO_MOTHER_FIREBASE_UID');
  } else {
    // eslint-disable-next-line no-console
    console.log('  Tip: set DEMO_MOTHER_FIREBASE_UID=<your-uid> to attach data to your login');
  }
  // eslint-disable-next-line no-console
  console.log(`  Nannies: ${SEED_NANNIES.length} profiles with reviews + full weekly availability`);
  // eslint-disable-next-line no-console
  console.log(`  All seeded accounts exist in Firebase Auth — password: ${SEED_PASSWORD}`);
  // eslint-disable-next-line no-console
  console.log('  Sign in with phone number + password:');
  // eslint-disable-next-line no-console
  console.log(`    Mother:  ${FALLBACK_DEMO_MOTHER.phone}`);
  for (const n of SEED_NANNIES) {
    // eslint-disable-next-line no-console
    console.log(`    Nanny ${n.firstName}: ${n.phone}`);
  }
  // eslint-disable-next-line no-console
  console.log('  Community: 3 marketplace, 1 Q&A, 1 event');
  // eslint-disable-next-line no-console
  console.log('  Messaging: 2 conversations, 6 messages, 5 notifications (1 unread)');
  // eslint-disable-next-line no-console
  console.log('  Bookings: 1 upcoming, 2 completed, 1 cancelled');
}

main()
  .catch((error) => {
    console.error('[seed-demo] Failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
