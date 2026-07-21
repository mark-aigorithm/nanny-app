/**
 * One-off: create a CONFIRMED 01:00–04:00 booking for e2e testing.
 *
 * Usage (from apps/backend):
 *   npx ts-node --transpile-only -r tsconfig-paths/register prisma/scripts/create-test-booking.ts
 */
import { PrismaPg } from '@prisma/adapter-pg';
import {
  BookingStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';

import { config } from '../../src/lib/config';

const MOTHER_PHONE = '+2011000000000';
const NANNY_PHONE = '+201055512340';
// Ids are now autoincrement integers, so this run is made idempotent by tagging
// the booking with a stable marker in special_instructions (a plain string
// column) and cleaning up any prior run keyed off that marker.
const BOOKING_MARKER = 'seed-demo-booking-night-test';

const adapter = new PrismaPg({ connectionString: config.databaseUrl });
const prisma = new PrismaClient({ adapter });

function findUserByPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  return prisma.user.findFirst({
    where: {
      OR: [{ phone }, { email: `${digits}@phone.nannyapp.local` }],
      deletedAt: null,
    },
  });
}

async function main() {
  const mother = await findUserByPhone(MOTHER_PHONE);
  if (!mother) throw new Error(`Mother ${MOTHER_PHONE} not found — sign up in the app first.`);

  const nannyUser = await findUserByPhone(NANNY_PHONE);
  if (!nannyUser) throw new Error(`Nanny ${NANNY_PHONE} not found — run pnpm db:seed:demo first.`);
  const nannyProfile = await prisma.nannyProfile.findUnique({ where: { userId: nannyUser.id } });
  if (!nannyProfile) throw new Error('Nanny profile missing.');

  // Shift starting right now (5 min ago) for live e2e testing, 4h long.
  const start = new Date(Date.now() - 5 * 60_000);
  start.setSeconds(0, 0);
  const end = new Date(start.getTime() + 4 * 3_600_000);
  const date = new Date(start);
  date.setUTCHours(0, 0, 0, 0);

  const hours = 4;
  // Per-nanny rates were removed; bookings price from the platform standard rate.
  const rate = 180;
  const subtotal = rate * hours;
  const fee = subtotal * 0.06;
  const total = subtotal + fee;

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
      status: BookingStatus.CONFIRMED,
      date,
      startTime: start,
      endTime: end,
      durationHours: new Prisma.Decimal(String(hours)),
      baseRate: new Prisma.Decimal(String(rate)),
      subtotal: new Prisma.Decimal(String(subtotal)),
      serviceFeePercent: new Prisma.Decimal('6.00'),
      serviceFeeAmount: new Prisma.Decimal(String(fee)),
      totalAmount: new Prisma.Decimal(String(total)),
      payments: {
        create: {
          motherId: mother.id,
          amount: new Prisma.Decimal(String(total)),
          method: PaymentMethod.CARD,
          status: PaymentStatus.CAPTURED,
        },
      },
    },
  });

  // eslint-disable-next-line no-console
  console.log('[create-test-booking] Created CONFIRMED booking:');
  // eslint-disable-next-line no-console
  console.log(`  id:     ${booking.id}`);
  // eslint-disable-next-line no-console
  console.log(`  mother: ${mother.firstName} ${mother.lastName} (${MOTHER_PHONE})`);
  // eslint-disable-next-line no-console
  console.log(`  nanny:  ${nannyUser.firstName} ${nannyUser.lastName} (${NANNY_PHONE})`);
  // eslint-disable-next-line no-console
  console.log(`  window: ${start.toString()} → ${end.toString()}`);
  // eslint-disable-next-line no-console
  console.log(`  total:  EGP ${total.toFixed(2)} (payment CAPTURED)`);
}

main()
  .catch((error) => {
    console.error('[create-test-booking] Failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
