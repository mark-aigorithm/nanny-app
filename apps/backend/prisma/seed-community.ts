/**
 * Seeds sample community posts (Q&A, Marketplace, Events) with likes,
 * comments, replies, and event RSVPs for local development.
 *
 * Usage (from apps/backend):
 *   pnpm db:seed:community
 *
 * Re-runs replace prior seed data (users with firebase_uid prefix seed-community-).
 */
import { PrismaPg } from '@prisma/adapter-pg';
import {
  CommunityPostType,
  Prisma,
  PrismaClient,
  Role,
} from '@prisma/client';

import { config } from '../src/lib/config';

const SEED_PREFIX = 'seed-community-';

const adapter = new PrismaPg({ connectionString: config.databaseUrl });
const prisma = new PrismaClient({ adapter });

const SEED_USERS = [
  {
    id: `${SEED_PREFIX}user-sarah`,
    firebaseUid: `${SEED_PREFIX}sarah`,
    email: 'seed.sarah@nanny-app.local',
    firstName: 'Sarah',
    lastName: 'Khalil',
    avatarUrl: 'https://i.pravatar.cc/150?u=seed-sarah',
  },
  {
    id: `${SEED_PREFIX}user-elena`,
    firebaseUid: `${SEED_PREFIX}elena`,
    email: 'seed.elena@nanny-app.local',
    firstName: 'Elena',
    lastName: 'Hassan',
    avatarUrl: 'https://i.pravatar.cc/150?u=seed-elena',
  },
  {
    id: `${SEED_PREFIX}user-nadia`,
    firebaseUid: `${SEED_PREFIX}nadia`,
    email: 'seed.nadia@nanny-app.local',
    firstName: 'Nadia',
    lastName: 'Farouk',
    avatarUrl: 'https://i.pravatar.cc/150?u=seed-nadia',
  },
] as const;

async function clearPreviousSeedData() {
  const seedUsers = await prisma.user.findMany({
    where: { firebaseUid: { startsWith: SEED_PREFIX } },
    select: { id: true },
  });

  if (seedUsers.length === 0) return;

  const userIds = seedUsers.map((u) => u.id);

  await prisma.communityPost.deleteMany({
    where: { authorId: { in: userIds } },
  });

  // eslint-disable-next-line no-console
  console.log('[seed-community] Cleared previous seed posts');
}

async function ensureSeedUsers() {
  const users = [];

  for (const seed of SEED_USERS) {
    const user = await prisma.user.upsert({
      where: { firebaseUid: seed.firebaseUid },
      create: {
        id: seed.id,
        firebaseUid: seed.firebaseUid,
        email: seed.email,
        firstName: seed.firstName,
        lastName: seed.lastName,
        avatarUrl: seed.avatarUrl,
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
    });
    users.push(user);
  }

  return users;
}

async function seedCommunityData() {
  const [sarah, elena, nadia] = await ensureSeedUsers();

  const now = Date.now();
  const daysAgo = (days: number) => new Date(now - days * 86_400_000);
  const daysFromNow = (days: number) => new Date(now + days * 86_400_000);

  const posts = await prisma.$transaction(async (tx) => {
    const qaPost1 = await tx.communityPost.create({
      data: {
        id: `${SEED_PREFIX}post-qa-sleep`,
        authorId: sarah.id,
        type: CommunityPostType.QA,
        body: 'My 8-month-old wakes every 2 hours at night. We tried a consistent bedtime routine but nothing sticks. What worked for your little ones?',
        tags: ['Sleep', 'Parenting'],
        likeCount: 2,
        commentCount: 3,
        createdAt: daysAgo(2),
      },
    });

    const qaPost2 = await tx.communityPost.create({
      data: {
        id: `${SEED_PREFIX}post-qa-feeding`,
        authorId: elena.id,
        type: CommunityPostType.QA,
        title: 'Starting solids — where to begin?',
        body: 'Pediatrician said we can start solids at 6 months. Any favorite first foods or brands available locally?',
        tags: ['Feeding', 'Development'],
        likeCount: 1,
        commentCount: 1,
        createdAt: daysAgo(1),
      },
    });

    const marketplacePost1 = await tx.communityPost.create({
      data: {
        id: `${SEED_PREFIX}post-market-stroller`,
        authorId: nadia.id,
        type: CommunityPostType.MARKETPLACE,
        title: 'Chicco Liteway Stroller',
        body: 'Lightweight stroller, gently used for 6 months. Folds easily, perfect for Cairo errands.',
        imageUrls: ['https://picsum.photos/seed/stroller/800/600'],
        price: new Prisma.Decimal('2500.00'),
        tags: ['Local', 'Activities'],
        likeCount: 3,
        commentCount: 0,
        createdAt: daysAgo(3),
      },
    });

    const marketplacePost2 = await tx.communityPost.create({
      data: {
        id: `${SEED_PREFIX}post-market-clothes`,
        authorId: sarah.id,
        type: CommunityPostType.MARKETPLACE,
        title: '0–12 month clothes bundle',
        body: 'Mixed brands, mostly 6–12M. About 20 pieces, smoke-free home.',
        imageUrls: [
          'https://picsum.photos/seed/baby-clothes/800/600',
          'https://picsum.photos/seed/baby-clothes-2/800/600',
        ],
        price: new Prisma.Decimal('450.00'),
        tags: ['Parenting'],
        likeCount: 1,
        commentCount: 0,
        createdAt: daysAgo(5),
      },
    });

    const eventPost1 = await tx.communityPost.create({
      data: {
        id: `${SEED_PREFIX}post-event-coffee`,
        authorId: elena.id,
        type: CommunityPostType.EVENT,
        title: 'New moms coffee morning',
        body: 'Casual meetup for first-time moms. Bring your little one — stroller-friendly café.',
        location: 'Zoya Café, Zamalek, Cairo',
        eventStartsAt: daysFromNow(5),
        maxAttendees: 12,
        rsvpCount: 2,
        tags: ['Local', 'Parenting'],
        likeCount: 2,
        commentCount: 1,
        createdAt: daysAgo(4),
      },
    });

    const eventPost2 = await tx.communityPost.create({
      data: {
        id: `${SEED_PREFIX}post-event-playground`,
        authorId: nadia.id,
        type: CommunityPostType.EVENT,
        title: 'Weekend playground playdate',
        body: 'Open playdate for toddlers. Snacks and shade area nearby.',
        location: 'Family Park, New Cairo',
        eventStartsAt: daysFromNow(9),
        price: new Prisma.Decimal('0.00'),
        maxAttendees: 20,
        rsvpCount: 1,
        tags: ['Activities', 'Local'],
        likeCount: 1,
        commentCount: 0,
        createdAt: daysAgo(6),
      },
    });

    // Post likes
    await tx.postLike.createMany({
      data: [
        { postId: qaPost1.id, userId: elena.id },
        { postId: qaPost1.id, userId: nadia.id },
        { postId: qaPost2.id, userId: sarah.id },
        { postId: marketplacePost1.id, userId: sarah.id },
        { postId: marketplacePost1.id, userId: elena.id },
        { postId: marketplacePost1.id, userId: nadia.id },
        { postId: marketplacePost2.id, userId: elena.id },
        { postId: eventPost1.id, userId: sarah.id },
        { postId: eventPost1.id, userId: nadia.id },
        { postId: eventPost2.id, userId: sarah.id },
      ],
    });

    // Comments on qaPost1
    const comment1 = await tx.comment.create({
      data: {
        id: `${SEED_PREFIX}comment-1`,
        postId: qaPost1.id,
        authorId: elena.id,
        body: 'We moved bedtime 30 minutes earlier and it helped a lot. Also a white noise machine was a game changer.',
        likeCount: 1,
        createdAt: daysAgo(1),
      },
    });

    await tx.comment.create({
      data: {
        id: `${SEED_PREFIX}comment-1-reply`,
        postId: qaPost1.id,
        authorId: sarah.id,
        parentCommentId: comment1.id,
        body: 'Thanks Elena! Which white noise app do you use?',
        likeCount: 0,
        createdAt: daysAgo(1),
      },
    });

    await tx.comment.create({
      data: {
        id: `${SEED_PREFIX}comment-2`,
        postId: qaPost1.id,
        authorId: nadia.id,
        body: 'Hang in there — the 8-month regression is real. It usually passes in a couple of weeks.',
        likeCount: 0,
        createdAt: daysAgo(1),
      },
    });

    await tx.commentLike.create({
      data: { commentId: comment1.id, userId: sarah.id },
    });

    // Comment on qaPost2
    await tx.comment.create({
      data: {
        id: `${SEED_PREFIX}comment-3`,
        postId: qaPost2.id,
        authorId: nadia.id,
        body: 'We started with mashed avocado and soft pear. Keep portions tiny at first!',
        likeCount: 0,
        createdAt: daysAgo(1),
      },
    });

    // Comment on event
    await tx.comment.create({
      data: {
        id: `${SEED_PREFIX}comment-4`,
        postId: eventPost1.id,
        authorId: sarah.id,
        body: 'Sounds lovely — is there parking nearby?',
        likeCount: 0,
        createdAt: daysAgo(3),
      },
    });

    // Event RSVPs
    await tx.eventRsvp.createMany({
      data: [
        { postId: eventPost1.id, userId: sarah.id },
        { postId: eventPost1.id, userId: nadia.id },
        { postId: eventPost2.id, userId: elena.id },
      ],
      skipDuplicates: true,
    });

    return {
      qa: 2,
      marketplace: 2,
      events: 2,
      comments: 5,
      replies: 1,
    };
  });

  return posts;
}

async function main() {
  await clearPreviousSeedData();
  const summary = await seedCommunityData();

  // eslint-disable-next-line no-console
  console.log('[seed-community] Done');
  // eslint-disable-next-line no-console
  console.log(`  Users:  ${SEED_USERS.length} mothers (${SEED_PREFIX}*)`);
  // eslint-disable-next-line no-console
  console.log(`  Posts:  ${summary.qa} Q&A, ${summary.marketplace} marketplace, ${summary.events} events`);
  // eslint-disable-next-line no-console
  console.log(`  Comments: ${summary.comments} total (${summary.replies} reply)`);
  // eslint-disable-next-line no-console
  console.log('  Likes, comment likes, and event RSVPs included');
}

main()
  .catch((error) => {
    console.error('[seed-community] Failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
