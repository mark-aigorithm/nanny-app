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

const PREFIX = 'seed-demo-';
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

const SEED_MOTHERS = [
  {
    id: `${PREFIX}user-sarah`,
    firebaseUid: `${PREFIX}sarah`,
    email: 'demo.sarah@nanny-app.local',
    firstName: 'Sarah',
    lastName: 'Khalil',
    avatarUrl: 'https://i.pravatar.cc/150?u=demo-sarah',
  },
  {
    id: `${PREFIX}user-elena`,
    firebaseUid: `${PREFIX}elena`,
    email: 'demo.elena@nanny-app.local',
    firstName: 'Elena',
    lastName: 'Hassan',
    avatarUrl: 'https://i.pravatar.cc/150?u=demo-elena',
  },
  {
    id: `${PREFIX}user-nadia`,
    firebaseUid: `${PREFIX}nadia`,
    email: 'demo.nadia@nanny-app.local',
    firstName: 'Nadia',
    lastName: 'Farouk',
    avatarUrl: 'https://i.pravatar.cc/150?u=demo-nadia',
  },
] as const;

const FALLBACK_DEMO_MOTHER = {
  id: `${PREFIX}user-mother`,
  firebaseUid: `${PREFIX}mother`,
  email: 'demo.mother@nanny-app.local',
  firstName: 'Layla',
  lastName: 'Mostafa',
  avatarUrl: 'https://i.pravatar.cc/150?u=demo-mother',
};

const SEED_NANNIES = [
  {
    userId: `${PREFIX}user-nanny-elena`,
    profileId: `${PREFIX}nanny-elena`,
    firebaseUid: `${PREFIX}nanny-elena`,
    email: 'demo.nanny.elena@nanny-app.local',
    firstName: 'Elena',
    lastName: 'Rodriguez',
    avatarUrl: 'https://i.pravatar.cc/150?u=demo-nanny-elena',
    bio: 'Certified newborn care specialist with 8 years of experience. CPR & first aid certified.',
    location: 'Zamalek, Cairo',
    yearsOfExperience: 8,
    hourlyRate: '180.00',
    certifications: ['CPR', 'First Aid', 'Newborn Care'],
    ageRanges: ['0-1', '1-3'],
    specialties: ['Newborn Care', 'Sleep Training'],
    availabilityType: AvailabilityType.FULL_TIME,
    rating: '4.9',
    reviewCount: 24,
  },
  {
    userId: `${PREFIX}user-nanny-maya`,
    profileId: `${PREFIX}nanny-maya`,
    firebaseUid: `${PREFIX}nanny-maya`,
    email: 'demo.nanny.maya@nanny-app.local',
    firstName: 'Maya',
    lastName: 'Patel',
    avatarUrl: 'https://i.pravatar.cc/150?u=demo-nanny-maya',
    bio: 'Warm and energetic nanny specializing in toddlers and early learning activities.',
    location: 'Maadi, Cairo',
    yearsOfExperience: 5,
    hourlyRate: '150.00',
    certifications: ['CPR', 'Early Childhood Education'],
    ageRanges: ['1-3', '3-5'],
    specialties: ['Toddler Care', 'Educational Play'],
    availabilityType: AvailabilityType.PART_TIME,
    rating: '4.8',
    reviewCount: 18,
  },
  {
    userId: `${PREFIX}user-nanny-claire`,
    profileId: `${PREFIX}nanny-claire`,
    firebaseUid: `${PREFIX}nanny-claire`,
    email: 'demo.nanny.claire@nanny-app.local',
    firstName: 'Claire',
    lastName: 'Thompson',
    avatarUrl: 'https://i.pravatar.cc/150?u=demo-nanny-claire',
    bio: 'British expat nanny, fluent in English and Arabic. Great with school-age children.',
    location: 'New Cairo',
    yearsOfExperience: 10,
    hourlyRate: '200.00',
    certifications: ['CPR', 'Montessori'],
    ageRanges: ['3-5', '5+'],
    specialties: ['Homework Help', 'Bilingual'],
    availabilityType: AvailabilityType.FULL_TIME,
    rating: '5.0',
    reviewCount: 31,
  },
  {
    userId: `${PREFIX}user-nanny-sandra`,
    profileId: `${PREFIX}nanny-sandra`,
    firebaseUid: `${PREFIX}nanny-sandra`,
    email: 'demo.nanny.sandra@nanny-app.local',
    firstName: 'Sandra',
    lastName: 'Weber',
    avatarUrl: 'https://i.pravatar.cc/150?u=demo-nanny-sandra',
    bio: 'Flexible occasional nanny — perfect for date nights and weekend coverage.',
    location: 'Heliopolis, Cairo',
    yearsOfExperience: 3,
    hourlyRate: '120.00',
    certifications: ['CPR'],
    ageRanges: ['0-1', '1-3', '3-5'],
    specialties: ['Weekend Care', 'Date Night'],
    availabilityType: AvailabilityType.OCCASIONAL,
    rating: '4.7',
    reviewCount: 9,
  },
] as const;

async function clearPreviousDemoData(linkedMotherId: string | null) {
  await prisma.notification.deleteMany({ where: { id: { startsWith: PREFIX } } });

  await prisma.conversation.deleteMany({ where: { id: { startsWith: PREFIX } } });

  const demoBookings = await prisma.booking.findMany({
    where: {
      OR: [
        { id: { startsWith: PREFIX } },
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

  await prisma.postLike.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.comment.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.eventRsvp.deleteMany({
    where: { post: { id: { startsWith: PREFIX } } },
  });
  await prisma.communityPost.deleteMany({ where: { id: { startsWith: PREFIX } } });

  await prisma.nannyProfile.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({
    where: { firebaseUid: { startsWith: PREFIX } },
  });

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
      },
    });
    return linked;
  }

  return prisma.user.upsert({
    where: { firebaseUid: FALLBACK_DEMO_MOTHER.firebaseUid },
    create: {
      ...FALLBACK_DEMO_MOTHER,
      role: Role.MOTHER,
      isEmailVerified: true,
      isPhoneVerified: true,
    },
    update: {
      firstName: FALLBACK_DEMO_MOTHER.firstName,
      lastName: FALLBACK_DEMO_MOTHER.lastName,
      avatarUrl: FALLBACK_DEMO_MOTHER.avatarUrl,
      role: Role.MOTHER,
      deletedAt: null,
    },
  });
}

async function ensureSeedMothers() {
  const users = [];
  for (const seed of SEED_MOTHERS) {
    users.push(
      await prisma.user.upsert({
        where: { firebaseUid: seed.firebaseUid },
        create: {
          ...seed,
          role: Role.MOTHER,
          isEmailVerified: true,
          isPhoneVerified: true,
        },
        update: {
          firstName: seed.firstName,
          lastName: seed.lastName,
          avatarUrl: seed.avatarUrl,
          role: Role.MOTHER,
          deletedAt: null,
        },
      }),
    );
  }
  return users;
}

async function seedNannies() {
  const profiles = [];
  for (const n of SEED_NANNIES) {
    await prisma.user.upsert({
      where: { firebaseUid: n.firebaseUid },
      create: {
        id: n.userId,
        firebaseUid: n.firebaseUid,
        email: n.email,
        firstName: n.firstName,
        lastName: n.lastName,
        avatarUrl: n.avatarUrl,
        role: Role.NANNY,
        isEmailVerified: true,
      },
      update: {
        firstName: n.firstName,
        lastName: n.lastName,
        avatarUrl: n.avatarUrl,
        role: Role.NANNY,
        deletedAt: null,
      },
    });

    const profile = await prisma.nannyProfile.upsert({
      where: { userId: n.userId },
      create: {
        id: n.profileId,
        userId: n.userId,
        bio: n.bio,
        location: n.location,
        yearsOfExperience: n.yearsOfExperience,
        hourlyRate: new Prisma.Decimal(n.hourlyRate),
        certifications: [...n.certifications],
        ageRanges: [...n.ageRanges],
        specialties: [...n.specialties],
        availabilityType: n.availabilityType,
        rating: new Prisma.Decimal(n.rating),
        reviewCount: n.reviewCount,
        isProfileComplete: true,
        latitude: new Prisma.Decimal('30.0444'),
        longitude: new Prisma.Decimal('31.2357'),
      },
      update: {
        bio: n.bio,
        location: n.location,
        hourlyRate: new Prisma.Decimal(n.hourlyRate),
        rating: new Prisma.Decimal(n.rating),
        reviewCount: n.reviewCount,
        isProfileComplete: true,
        deletedAt: null,
      },
    });
    profiles.push(profile);
  }
  return profiles;
}

async function seedCommunity(motherId: string, sarahId: string, elenaId: string, nadiaId: string) {
  const stroller = await prisma.communityPost.create({
    data: {
      id: `${PREFIX}post-stroller`,
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
      id: `${PREFIX}post-clothes`,
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
      id: `${PREFIX}post-highchair`,
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
      id: `${PREFIX}post-qa-sleep`,
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
      id: `${PREFIX}post-event-coffee`,
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
      { id: `${PREFIX}like-1`, postId: stroller.id, userId: motherId },
      { id: `${PREFIX}like-2`, postId: stroller.id, userId: sarahId },
      { id: `${PREFIX}like-3`, postId: clothes.id, userId: elenaId },
      { id: `${PREFIX}like-4`, postId: qaPost.id, userId: motherId },
      { id: `${PREFIX}like-5`, postId: eventPost.id, userId: motherId },
    ],
    skipDuplicates: true,
  });

  await prisma.comment.createMany({
    data: [
      {
        id: `${PREFIX}comment-stroller`,
        postId: stroller.id,
        authorId: sarahId,
        body: 'Is this still available? Does it recline flat for naps?',
        likeCount: 0,
        createdAt: daysAgo(1),
      },
      {
        id: `${PREFIX}comment-qa-1`,
        postId: qaPost.id,
        authorId: elenaId,
        body: 'We moved bedtime earlier by 30 minutes — took about a week to settle.',
        likeCount: 1,
        createdAt: daysAgo(2),
      },
      {
        id: `${PREFIX}comment-qa-2`,
        postId: qaPost.id,
        authorId: nadiaId,
        body: 'White noise and a consistent routine helped us a lot at that age.',
        likeCount: 0,
        createdAt: daysAgo(2),
      },
      {
        id: `${PREFIX}comment-event`,
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
  motherId: string,
  motherName: string,
  nadiaId: string,
  nadiaName: string,
  elenaId: string,
  elenaName: string,
  strollerPostId: string,
  clothesPostId: string,
) {
  const convStroller = await prisma.conversation.create({
    data: {
      id: `${PREFIX}conv-stroller`,
      type: ConversationType.MARKETPLACE,
      communityPostId: strollerPostId,
      initiatorId: motherId,
      updatedAt: minutesAgo(12),
      participants: {
        create: [
          { id: `${PREFIX}part-stroller-mother`, userId: motherId, lastReadAt: minutesAgo(5) },
          { id: `${PREFIX}part-stroller-seller`, userId: nadiaId, lastReadAt: hoursAgo(2) },
        ],
      },
      messages: {
        create: [
          {
            id: `${PREFIX}msg-stroller-1`,
            senderId: motherId,
            content: 'Hi! Is the stroller still available? Can you do EGP 2,200?',
            createdAt: hoursAgo(3),
          },
          {
            id: `${PREFIX}msg-stroller-2`,
            senderId: nadiaId,
            content: 'Yes it is! I can do 2,350 — it is in great condition.',
            createdAt: hoursAgo(2),
          },
          {
            id: `${PREFIX}msg-stroller-3`,
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
      id: `${PREFIX}conv-clothes`,
      type: ConversationType.MARKETPLACE,
      communityPostId: clothesPostId,
      initiatorId: elenaId,
      updatedAt: minutesAgo(45),
      participants: {
        create: [
          { id: `${PREFIX}part-clothes-buyer`, userId: elenaId, lastReadAt: minutesAgo(40) },
          {
            id: `${PREFIX}part-clothes-seller`,
            userId: motherId,
            lastReadAt: null,
          },
        ],
      },
      messages: {
        create: [
          {
            id: `${PREFIX}msg-clothes-1`,
            senderId: elenaId,
            content: 'Hello! Interested in the clothes bundle — are any pieces 0–3M?',
            createdAt: hoursAgo(5),
          },
          {
            id: `${PREFIX}msg-clothes-2`,
            senderId: motherId,
            content: 'Hi Elena! About half are 6–12M, a few 3–6M pieces too.',
            createdAt: hoursAgo(4),
          },
          {
            id: `${PREFIX}msg-clothes-3`,
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
        id: `${PREFIX}notif-1`,
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
        id: `${PREFIX}notif-2`,
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
        id: `${PREFIX}notif-3`,
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
        id: `${PREFIX}notif-4`,
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
        id: `${PREFIX}notif-5`,
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
  motherId: string,
  nannyProfiles: { id: string; hourlyRate: Prisma.Decimal | null }[],
) {
  const [elena, maya, claire, sandra] = nannyProfiles;
  const serviceFeePercent = new Prisma.Decimal('6.00');

  const upcoming = bookingWindow(5, 9, 17);
  const durationUpcoming = 8;
  const rateUpcoming = Number(elena.hourlyRate ?? 180);
  const subtotalUpcoming = rateUpcoming * durationUpcoming;
  const feeUpcoming = subtotalUpcoming * 0.06;
  const totalUpcoming = subtotalUpcoming + feeUpcoming;

  const upcomingBooking = await prisma.booking.create({
    data: {
      id: `${PREFIX}booking-upcoming`,
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
      payment: {
        create: {
          id: `${PREFIX}payment-upcoming`,
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
  const ratePast = Number(maya.hourlyRate ?? 150);
  const subtotalPast = ratePast * durationPast;
  const feePast = subtotalPast * 0.06;
  const totalPast = subtotalPast + feePast;

  const pastBooking = await prisma.booking.create({
    data: {
      id: `${PREFIX}booking-past`,
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
      payment: {
        create: {
          id: `${PREFIX}payment-past`,
          motherId,
          amount: new Prisma.Decimal(String(totalPast)),
          method: PaymentMethod.CARD,
          status: PaymentStatus.CAPTURED,
        },
      },
      review: {
        create: {
          id: `${PREFIX}review-past`,
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
  const ratePast2 = Number(claire.hourlyRate ?? 200);
  const subtotalPast2 = ratePast2 * durationPast2;
  const feePast2 = subtotalPast2 * 0.06;
  const totalPast2 = subtotalPast2 + feePast2;

  const cancelled = bookingWindow(3, 18, 22);
  const durationCancelled = 4;
  const rateCancelled = Number(sandra.hourlyRate ?? 120);
  const subtotalCancelled = rateCancelled * durationCancelled;
  const feeCancelled = subtotalCancelled * 0.06;
  const totalCancelled = subtotalCancelled + feeCancelled;

  await prisma.booking.create({
    data: {
      id: `${PREFIX}booking-cancelled`,
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
      id: `${PREFIX}booking-past-2`,
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
      payment: {
        create: {
          id: `${PREFIX}payment-past-2`,
          motherId,
          amount: new Prisma.Decimal(String(totalPast2)),
          method: PaymentMethod.WALLET,
          status: PaymentStatus.CAPTURED,
        },
      },
      review: {
        create: {
          id: `${PREFIX}review-past-2`,
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
  console.log(`  Nannies: ${SEED_NANNIES.length} profiles with reviews`);
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
