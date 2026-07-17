/**
 * One-off: create a PENDING booking and mint a Paymob unified-checkout URL
 * for debugging the mobile WebView rendering.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { BookingStatus, Prisma, PrismaClient } from '@prisma/client';
import type { DecodedIdToken } from 'firebase-admin/auth';

import { config } from '../../src/lib/config';
import { createPaymobIntentionForBooking } from '../../src/services/paymob.service';

const MOTHER_PHONE = '+2011000000000';
const NANNY_PHONE = '+201055512340';
// Ids autoincrement now; idempotency keys off a stable marker in the string
// special_instructions column instead of an explicit id.
const BOOKING_MARKER = 'seed-demo-booking-checkout-debug';

const adapter = new PrismaPg({ connectionString: config.databaseUrl });
const prisma = new PrismaClient({ adapter });

async function main() {
  const mother = await prisma.user.findFirst({ where: { phone: MOTHER_PHONE } });
  const nannyUser = await prisma.user.findFirst({ where: { phone: NANNY_PHONE } });
  if (!mother || !nannyUser) throw new Error('Users not found — run seed first.');
  const nannyProfile = await prisma.nannyProfile.findUnique({ where: { userId: nannyUser.id } });
  if (!nannyProfile) throw new Error('Nanny profile missing.');

  const start = new Date(Date.now() + 48 * 3_600_000);
  start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 4 * 3_600_000);
  const date = new Date(start);
  date.setUTCHours(0, 0, 0, 0);

  const prior = await prisma.booking.findMany({
    where: { specialInstructions: BOOKING_MARKER },
    select: { id: true },
  });
  const priorIds = prior.map((b) => b.id);
  if (priorIds.length > 0) {
    await prisma.payment.deleteMany({ where: { bookingId: { in: priorIds } } });
    await prisma.booking.deleteMany({ where: { id: { in: priorIds } } });
  }
  const booking = await prisma.booking.create({
    data: {
      specialInstructions: BOOKING_MARKER,
      motherId: mother.id,
      nannyProfileId: nannyProfile.id,
      status: BookingStatus.PENDING,
      date,
      startTime: start,
      endTime: end,
      durationHours: new Prisma.Decimal('4'),
      baseRate: new Prisma.Decimal('180'),
      subtotal: new Prisma.Decimal('720'),
      serviceFeePercent: new Prisma.Decimal('6.00'),
      serviceFeeAmount: new Prisma.Decimal('43.20'),
      totalAmount: new Prisma.Decimal('763.20'),
    },
  });

  const decoded = { uid: mother.firebaseUid } as DecodedIdToken;
  const result = await createPaymobIntentionForBooking(decoded, booking.id, {
    method: 'CARD',
  } as never);

  const url = `https://accept.paymob.com/unifiedcheckout/?publicKey=${encodeURIComponent(result.publicKey)}&clientSecret=${encodeURIComponent(result.clientSecret)}`;
  // eslint-disable-next-line no-console
  console.log('CHECKOUT_URL=' + url);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
