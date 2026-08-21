/**
 * Booking factory.
 *
 * Prices are produced by `calculatePriceBreakdown` from @nanny-app/shared —
 * the same pure engine the booking service and the mobile estimate use — rather
 * than by hand-written arithmetic. A factory that invents its own totals would
 * drift from the pricing rules the moment they change, and tests would then
 * assert against numbers the product no longer produces.
 */
import { calculatePriceBreakdown } from '@nanny-app/shared';
import { type BookingStatus, type Prisma } from '@prisma/client';

import { prisma } from '@backend/db/prisma';

/** Platform defaults, matching DEFAULTS in app-settings.service.ts. */
const BASE_RATE = 120;
const NANNY_PERCENT = 80;
const PLATFORM_PERCENT = 20;

export type BookingOverrides = {
  motherId: number;
  /** Omit for an unclaimed broadcast request — the column is null until a nanny accepts. */
  nannyProfileId?: number;
  status?: BookingStatus;
  /** Defaults to tomorrow, keeping the booking inside the advance-notice window. */
  date?: Date;
  durationHours?: number;
  baseRate?: number;
  data?: Partial<Prisma.BookingUncheckedCreateInput>;
};

/**
 * Start time is fixed at 10:00 so the booking always falls inside the platform's
 * 06:00–22:00 window; a factory that produced out-of-window bookings would fail
 * validation for reasons unrelated to whatever the test is actually checking.
 */
const START_HOUR = 10;

export async function makeBooking(overrides: BookingOverrides) {
  const {
    motherId,
    nannyProfileId,
    status = 'PENDING',
    durationHours = 4,
    baseRate = BASE_RATE,
    data = {},
  } = overrides;

  const date = overrides.date ?? tomorrow();
  const startTime = at(date, START_HOUR);
  const endTime = at(date, START_HOUR + durationHours);

  const breakdown = calculatePriceBreakdown({
    baseRate,
    durationHours,
    nannyPercent: NANNY_PERCENT,
    platformPercent: PLATFORM_PERCENT,
  });

  return prisma.booking.create({
    data: {
      motherId,
      ...(nannyProfileId === undefined ? {} : { nannyProfileId }),
      status,
      date,
      startTime,
      endTime,
      durationHours,
      baseRate: breakdown.baseRate,
      effectiveHourlyRate: breakdown.effectiveHourlyRate,
      subtotal: breakdown.subtotal,
      durationMultiplier: breakdown.durationMultiplier,
      discountAmount: breakdown.discountAmount,
      // Zero in the modern breakdown: the platform's cut is expressed by the
      // nanny/platform split below. The columns remain for historic bookings.
      serviceFeePercent: breakdown.serviceFeePercent,
      serviceFeeAmount: breakdown.serviceFeeAmount,
      totalAmount: breakdown.totalAmount,
      nannyAmount: breakdown.nannyAmount,
      platformAmount: breakdown.platformAmount,
      childrenCount: breakdown.childrenCount,
      extraChildren: breakdown.extraChildren,
      extraChildFeePerHour: breakdown.extraChildFeePerHour,
      ...data,
    },
  });
}

/** Midnight tomorrow, UTC — `date` is a DATE column, so the time part is dropped. */
function tomorrow(): Date {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + 1);
  value.setUTCHours(0, 0, 0, 0);
  return value;
}

function at(date: Date, hour: number): Date {
  const value = new Date(date);
  value.setUTCHours(hour, 0, 0, 0);
  return value;
}
