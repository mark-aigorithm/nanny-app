import { BookingExtensionStatus, BookingStatus, Prisma } from '@prisma/client';
import {
  type AppliedSkillFee,
  type BookingExtensionResponse,
  BOOKING_EXTENSION_NANNY_RESPONSE_MINUTES,
  BOOKING_EXTENSION_PAYMENT_MINUTES,
  BOOKING_EXTENSION_PRESET_HOURS,
  type CreateBookingExtensionRequest,
  extendablePresetHours,
  packageHoursCreditFor,
  planPackageHoursRedemption,
  type RedeemExtensionPointsRequest,
  resolvePackageHourValue,
  Role,
} from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { config } from '@backend/lib/config';
import { errors } from '@backend/lib/errors';
import type { DecodedIdToken } from '@backend/lib/firebase';
import { toPlatformWallClock, wallClockToUtc } from '@backend/lib/platform-time';
import { addHoursToWallClock } from '@nanny-app/shared';

import { getPlatformConfig, getRevenueSplit } from './app-settings.service';
import {
  assertNoConflict,
  settleExtensionUnpaid,
  toBookingExtensionResponse,
} from './booking.service';
import { createInAppNotification, dispatchPush } from './notification.service';
import {
  getRedeemableSummary,
  redeemPackageHours,
} from './package-hours.service';
import { applyBookingRedemption, notifyPointsRedeemed } from './reward.service';

/** Round to 2 decimals for money/hour math. */
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** The booking fields an extension needs. Narrow on purpose — this service
 * never renders a booking, it only prices against one. */
const bookingForExtension = {
  mother: { select: { id: true, firstName: true, lastName: true } },
  nannyProfile: { select: { id: true, userId: true, user: { select: { firstName: true } } } },
} as const;

type BookingForExtension = Prisma.BookingGetPayload<{ include: typeof bookingForExtension }>;

/** Reads the persisted skill add-on snapshot back into typed form. */
function parseSkillAddOns(raw: Prisma.JsonValue | null | undefined): AppliedSkillFee[] {
  return Array.isArray(raw) ? (raw as unknown as AppliedSkillFee[]) : [];
}

async function getUserByUid(uid: string) {
  const user = await prisma.user.findUnique({ where: { firebaseUid: uid } });
  if (!user || user.deletedAt) throw errors.unauthorized();
  return user;
}

/**
 * Validate `hours` against the booking and the platform's own rules, and return
 * the end time the booking would have. This is the single gate every extension
 * passes through — the mother's request and the nanny's acceptance both call it,
 * because the nanny's calendar and the platform config can both move in between.
 *
 * The two rules are exactly the ones `createBooking` enforces, applied to the
 * EXTENDED shift: it must still fit inside the daily booking window, and it must
 * not exceed the maximum booking duration.
 */
async function resolveNewEndTime(
  booking: BookingForExtension,
  hours: number,
): Promise<Date> {
  const platform = await getPlatformConfig();
  const startWall = toPlatformWallClock(booking.startTime);
  const endWall = toPlatformWallClock(booking.endTime);

  const allowed = extendablePresetHours({
    startWall,
    endWall,
    durationHours: Number(booking.durationHours),
    windowStartHour: platform.bookingWindowStartHour,
    windowEndHour: platform.bookingWindowEndHour,
    maxBookingHours: platform.maxBookingHours,
  });

  if (!allowed.includes(hours)) {
    // Say which limit bit, so the mother gets a message she can act on rather
    // than a flat "not allowed".
    if (Number(booking.durationHours) + hours > platform.maxBookingHours) {
      throw errors.badRequest(
        `A booking can run for at most ${platform.maxBookingHours} hours, and this one would reach ${round2(Number(booking.durationHours) + hours)}.`,
      );
    }
    throw errors.badRequest(
      'Those extra hours would run past the end of the booking window for the day.',
    );
  }

  const newEndWall = addHoursToWallClock(endWall, hours);
  // Unreachable while `allowed` contains `hours` — extendablePresetHours only
  // offers an amount whose new end time it could compute. Guarded so a future
  // change there can't silently produce a bad instant.
  if (!newEndWall) throw errors.badRequest('Could not work out the new end time.');

  return wallClockToUtc(newEndWall);
}

/** The extension still awaiting an outcome on this booking, if any. */
async function findOpenExtension(bookingId: number) {
  return prisma.bookingExtension.findFirst({
    where: {
      bookingId,
      deletedAt: null,
      status: { in: [BookingExtensionStatus.PENDING_NANNY, BookingExtensionStatus.ACCEPTED] },
    },
    orderBy: { id: 'desc' },
  });
}

/**
 * Lazily settle an extension whose deadline has passed. Callers get this for
 * free by routing reads through here, so a mother who opens the app after the
 * window closed sees the real state rather than a request that looks live.
 */
async function expireIfPastDeadline(extensionId: number): Promise<void> {
  const ext = await prisma.bookingExtension.findFirst({
    where: { id: extensionId, deletedAt: null },
    select: { id: true, status: true, expiresAt: true },
  });
  if (!ext) return;
  const isOpen =
    ext.status === BookingExtensionStatus.PENDING_NANNY ||
    ext.status === BookingExtensionStatus.ACCEPTED;
  if (isOpen && ext.expiresAt.getTime() <= Date.now()) {
    await settleExtensionUnpaid(ext.id, 'EXPIRED');
  }
}

async function loadBooking(bookingId: number): Promise<BookingForExtension> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId, deletedAt: null },
    include: bookingForExtension,
  });
  if (!booking) throw errors.notFound('Booking not found.');
  return booking;
}

async function loadExtension(extensionId: number) {
  const ext = await prisma.bookingExtension.findFirst({
    where: { id: extensionId, deletedAt: null },
  });
  if (!ext) throw errors.notFound('Extension request not found.');
  return ext;
}

// ── Public service functions ─────────────────────────────────────────────────

/**
 * The mother asks for extra hours on a shift that is under way. This creates a
 * QUOTE only: nothing is charged and no credits are touched until the nanny
 * accepts, because the hours aren't hers to spend until someone agrees to work
 * them.
 */
export async function requestBookingExtension(
  decoded: DecodedIdToken,
  bookingId: number,
  body: CreateBookingExtensionRequest,
): Promise<BookingExtensionResponse> {
  const user = await getUserByUid(decoded.uid);
  if (user.role !== Role.MOTHER) throw errors.forbidden('Only mothers can extend a booking.');

  const booking = await loadBooking(bookingId);
  if (booking.motherId !== user.id) throw errors.forbidden('Access denied.');
  if (booking.status !== BookingStatus.IN_PROGRESS) {
    throw errors.badRequest(
      `Only a booking that is under way can be extended. This one is ${booking.status}.`,
    );
  }
  if (!booking.nannyProfileId) {
    throw errors.badRequest('This booking has no assigned nanny to ask.');
  }

  // Settle a stale request first, so a mother whose last attempt timed out isn't
  // told she already has one in flight.
  const existing = await findOpenExtension(bookingId);
  if (existing) {
    await expireIfPastDeadline(existing.id);
    const stillOpen = await findOpenExtension(bookingId);
    if (stillOpen) {
      throw errors.conflict('You already have an extension request in progress for this booking.');
    }
  }

  const newEndTime = await resolveNewEndTime(booking, body.hours);

  // The nanny's own calendar is the other constraint: extending into her next
  // booking would double-book her. Excludes this booking so its own row can't
  // be read as the conflict.
  await assertNoConflict(booking.nannyProfileId, booking.startTime, newEndTime, booking.id);

  // Price off the booking's frozen rate — the add-ons the mother already chose
  // are carried at the rate she already agreed to, never re-priced.
  const hourlyRate = Number(booking.effectiveHourlyRate) || Number(booking.baseRate);
  const subtotal = round2(body.hours * hourlyRate);
  const split = await getRevenueSplit();
  const nannyAmount = round2((subtotal * split.nannyPercent) / 100);

  const created = await prisma.bookingExtension.create({
    data: {
      bookingId: booking.id,
      motherId: user.id,
      status: BookingExtensionStatus.PENDING_NANNY,
      hours: body.hours,
      newEndTime,
      hourlyRate,
      subtotal,
      totalAmount: subtotal,
      nannyAmount,
      platformAmount: round2(subtotal - nannyAmount),
      expiresAt: new Date(Date.now() + BOOKING_EXTENSION_NANNY_RESPONSE_MINUTES * 60_000),
    },
  });

  await notifyNannyExtensionRequested(booking, created.id, body.hours);

  return toBookingExtensionResponse(created);
}

/**
 * Reserve the mother's package hours against an accepted extension, mirroring
 * what `createBooking` does at booking time. Returns the row as updated.
 *
 * Deliberately runs on ACCEPTANCE rather than on request: reserving hours for a
 * request the nanny then declines would take them out of circulation for no
 * reason, and every reservation made here is returned by settleExtensionUnpaid
 * if the extension doesn't end up paid.
 */
async function applyPackageHoursToExtension(
  tx: Prisma.TransactionClient,
  extensionId: number,
  booking: BookingForExtension,
): Promise<void> {
  const ext = await tx.bookingExtension.findFirst({ where: { id: extensionId } });
  if (!ext) return;

  const skillAddOns = parseSkillAddOns(booking.selectedSkillFees);
  const summary = await getRedeemableSummary(ext.motherId, tx);
  const totalAmount = Number(ext.totalAmount);

  const plan = planPackageHoursRedemption({
    baseRate: Number(booking.baseRate),
    // Extensions are never re-tiered — the mother is buying more of the same
    // hour at the rate she already has, not re-rating the whole booking.
    durationMultiplier: 1,
    totalAmount,
    durationHours: Number(ext.hours),
    availableHours: summary.availableHours,
    maxSkillsAllowed: summary.maxSkillsAllowed,
    skillFeesPerHour: skillAddOns.map((s) => s.amountPerHour),
  });
  if (plan.hoursToRedeem <= 0) return;

  const redeem = await redeemPackageHours(tx, {
    userId: ext.motherId,
    scope: { bookingExtensionId: ext.id },
    hoursNeeded: plan.hoursToRedeem,
  });
  if (redeem.hoursApplied <= 0) return;

  // Re-price against the buckets FIFO actually drew from, for the same reason
  // the booking flow does: the plan takes the best allowance across all buckets,
  // and billing at that rate when a smaller-allowance bucket was drained would
  // waive skill fees the consumed package never covered.
  const actual = resolvePackageHourValue({
    baseRate: Number(booking.baseRate),
    durationMultiplier: 1,
    maxSkillsAllowed: redeem.maxSkillsAllowed,
    skillFeesPerHour: skillAddOns.map((s) => s.amountPerHour),
  });
  const credit = packageHoursCreditFor({
    hoursApplied: redeem.hoursApplied,
    creditPerHour: actual.creditPerHour,
    totalAmount,
  });

  await tx.bookingExtension.update({
    where: { id: ext.id },
    data: {
      discountAmount: round2(Number(ext.discountAmount) + credit),
      totalAmount: round2(totalAmount - credit),
      // The platform funds credits — the nanny's earnings are never reduced.
      platformAmount: round2(Number(ext.platformAmount) - credit),
      packageHoursApplied: redeem.hoursApplied,
      packageSkillsCovered: actual.skillsCovered,
      packageCreditAmount: credit,
    },
  });
}

/**
 * The nanny accepts or declines the extra hours. On acceptance the mother's
 * package hours are reserved and the payment clock starts; if the credits cover
 * the whole amount the extension settles immediately with no trip to Paymob.
 */
export async function respondToBookingExtension(
  decoded: DecodedIdToken,
  extensionId: number,
  accept: boolean,
): Promise<BookingExtensionResponse> {
  const user = await getUserByUid(decoded.uid);
  if (user.role !== Role.NANNY) throw errors.forbidden('Only nannies can answer an extension request.');

  await expireIfPastDeadline(extensionId);

  const ext = await loadExtension(extensionId);
  const booking = await loadBooking(ext.bookingId);
  if (booking.nannyProfile?.userId !== user.id) {
    throw errors.forbidden('This is not your booking.');
  }
  if (ext.status !== BookingExtensionStatus.PENDING_NANNY) {
    throw errors.badRequest(`This extension request is already ${ext.status.toLowerCase()}.`);
  }

  if (!accept) {
    await settleExtensionUnpaid(ext.id, 'DECLINED');
    await prisma.bookingExtension.update({
      where: { id: ext.id },
      data: { nannyRespondedAt: new Date() },
    });
    await notifyMotherExtensionDecided(booking, ext.id, false, Number(ext.hours), 0);
    return toBookingExtensionResponse(await loadExtension(ext.id));
  }

  // Re-check both gates at acceptance: the platform window may have been
  // reconfigured and — more likely — the nanny may have taken another booking
  // since the mother asked.
  await resolveNewEndTime(booking, Number(ext.hours));
  if (booking.nannyProfileId) {
    await assertNoConflict(booking.nannyProfileId, booking.startTime, ext.newEndTime, booking.id);
  }

  await prisma.$transaction(async (tx) => {
    await tx.bookingExtension.update({
      where: { id: ext.id },
      data: {
        status: BookingExtensionStatus.ACCEPTED,
        nannyRespondedAt: new Date(),
        expiresAt: new Date(Date.now() + BOOKING_EXTENSION_PAYMENT_MINUTES * 60_000),
      },
    });
    await applyPackageHoursToExtension(tx, ext.id, booking);
  });

  const accepted = await loadExtension(ext.id);

  // Fully covered by prepaid hours — there is nothing to charge, so settle it
  // now rather than sending the mother to a checkout for EGP 0.
  if (Number(accepted.totalAmount) <= 0) {
    await applyPaidExtension(accepted.id);
    return toBookingExtensionResponse(await loadExtension(ext.id));
  }

  await notifyMotherExtensionDecided(
    booking,
    accepted.id,
    true,
    Number(accepted.hours),
    Number(accepted.totalAmount),
  );
  return toBookingExtensionResponse(accepted);
}

/** The mother withdraws her own request before it is paid for. */
export async function cancelBookingExtension(
  decoded: DecodedIdToken,
  extensionId: number,
): Promise<BookingExtensionResponse> {
  const user = await getUserByUid(decoded.uid);
  if (user.role !== Role.MOTHER) throw errors.forbidden('Only mothers can withdraw an extension request.');

  const ext = await loadExtension(extensionId);
  if (ext.motherId !== user.id) throw errors.forbidden('Access denied.');
  if (ext.status === BookingExtensionStatus.PAID) {
    throw errors.badRequest('This extension has already been paid for.');
  }

  await settleExtensionUnpaid(ext.id, 'CANCELLED');
  return toBookingExtensionResponse(await loadExtension(ext.id));
}

/**
 * Apply Care Points against an accepted extension, before paying for it.
 * Mirrors `redeemBookingPoints` — points are refunded by settleExtensionUnpaid
 * if the extension never gets paid for.
 */
export async function redeemExtensionPoints(
  decoded: DecodedIdToken,
  extensionId: number,
  body: RedeemExtensionPointsRequest,
): Promise<BookingExtensionResponse> {
  const user = await getUserByUid(decoded.uid);
  if (user.role !== Role.MOTHER) throw errors.forbidden('Only mothers can redeem points.');

  await expireIfPastDeadline(extensionId);

  const ext = await loadExtension(extensionId);
  if (ext.motherId !== user.id) throw errors.forbidden('Access denied.');
  if (ext.status !== BookingExtensionStatus.ACCEPTED) {
    throw errors.badRequest('Points can only be applied to an accepted extension before payment.');
  }
  if (Number(ext.rewardCreditAmount) > 0) {
    throw errors.badRequest('Points are already applied to this extension.');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const { hours, pointsCost, discount: rawDiscount } = await applyBookingRedemption(tx, {
      userId: user.id,
      scope: { bookingExtensionId: ext.id },
      redeemHours: body.hours,
      perHour: Number(ext.hourlyRate),
      durationHours: Number(ext.hours),
    });
    // Never discount below zero owed. The platform funds the reward — the
    // nanny's share of the extension is never touched.
    const discount = Math.min(rawDiscount, Number(ext.totalAmount));
    return tx.bookingExtension.update({
      where: { id: ext.id },
      data: {
        discountAmount: round2(Number(ext.discountAmount) + discount),
        totalAmount: round2(Number(ext.totalAmount) - discount),
        platformAmount: round2(Number(ext.platformAmount) - discount),
        rewardCreditHoursApplied: hours,
        rewardCreditPoints: pointsCost,
        rewardCreditAmount: discount,
      },
    });
  });

  await notifyPointsRedeemed(
    user.id,
    updated.rewardCreditPoints,
    Number(updated.rewardCreditHoursApplied),
  );

  // Points covered the rest — settle rather than send her to a EGP 0 checkout.
  if (Number(updated.totalAmount) <= 0) {
    await applyPaidExtension(updated.id);
    return toBookingExtensionResponse(await loadExtension(ext.id));
  }

  return toBookingExtensionResponse(updated);
}

/**
 * Move the booking's end time out and mark the extension PAID. This is the ONLY
 * place an extension changes the booking, and it is idempotent on the
 * extension's status, so a replayed webhook can't add the hours twice.
 *
 * Called from the payment capture path, and directly when credits cover the
 * whole amount.
 */
export async function applyPaidExtension(extensionId: number): Promise<void> {
  const applied = await prisma.$transaction(async (tx) => {
    const ext = await tx.bookingExtension.findFirst({
      where: { id: extensionId, deletedAt: null },
    });
    if (!ext) return null;
    if (ext.status === BookingExtensionStatus.PAID) return null; // replay
    if (ext.status !== BookingExtensionStatus.ACCEPTED) {
      // eslint-disable-next-line no-console
      console.warn('[booking-extension] refusing to apply an extension that is not accepted', {
        extensionId,
        status: ext.status,
      });
      return null;
    }

    const booking = await tx.booking.findUnique({ where: { id: ext.bookingId } });
    if (!booking) return null;
    // A shift that has already ended can't gain hours. The money is captured, so
    // record it and leave the booking alone rather than crashing the webhook —
    // the row stays visible for support to refund.
    if (booking.status !== BookingStatus.IN_PROGRESS) {
      // eslint-disable-next-line no-console
      console.warn('[booking-extension] paid extension for a booking that is no longer running', {
        extensionId,
        bookingId: booking.id,
        bookingStatus: booking.status,
      });
      return null;
    }

    await tx.booking.update({
      where: { id: booking.id },
      data: {
        endTime: ext.newEndTime,
        durationHours: round2(Number(booking.durationHours) + Number(ext.hours)),
        subtotal: round2(Number(booking.subtotal) + Number(ext.subtotal)),
        discountAmount: round2(Number(booking.discountAmount) + Number(ext.discountAmount)),
        totalAmount: round2(Number(booking.totalAmount) + Number(ext.totalAmount)),
        nannyAmount: round2(Number(booking.nannyAmount) + Number(ext.nannyAmount)),
        platformAmount: round2(Number(booking.platformAmount) + Number(ext.platformAmount)),
        packageHoursApplied: round2(
          Number(booking.packageHoursApplied) + Number(ext.packageHoursApplied),
        ),
        packageCreditAmount: round2(
          Number(booking.packageCreditAmount) + Number(ext.packageCreditAmount),
        ),
        rewardCreditHoursApplied: round2(
          Number(booking.rewardCreditHoursApplied) + Number(ext.rewardCreditHoursApplied),
        ),
        rewardCreditPoints: booking.rewardCreditPoints + ext.rewardCreditPoints,
        rewardCreditAmount: round2(
          Number(booking.rewardCreditAmount) + Number(ext.rewardCreditAmount),
        ),
      },
    });

    return tx.bookingExtension.update({
      where: { id: ext.id },
      data: { status: BookingExtensionStatus.PAID, paidAt: new Date() },
    });
  });

  if (applied) {
    await notifyExtensionApplied(applied.bookingId, Number(applied.hours));
  }
}

/**
 * Settle every extension whose deadline has passed — a nanny who never answered,
 * or a mother who never paid. Driven by the same tick that reconciles stale
 * Paymob intentions, so no new scheduler is introduced.
 */
export async function expireStaleBookingExtensions(): Promise<void> {
  const stale = await prisma.bookingExtension.findMany({
    where: {
      deletedAt: null,
      status: { in: [BookingExtensionStatus.PENDING_NANNY, BookingExtensionStatus.ACCEPTED] },
      expiresAt: { lte: new Date() },
    },
    select: { id: true },
    take: 50,
  });

  for (const ext of stale) {
    try {
      await settleExtensionUnpaid(ext.id, 'EXPIRED');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[booking-extension] failed to expire a stale extension', {
        extensionId: ext.id,
        err,
      });
    }
  }
}

/**
 * Sweep expired extensions on an interval. Deliberately separate from the
 * Paymob reconciliation tick: that one is skipped entirely when Paymob is not
 * configured, and an extension whose deadline has passed must still be settled
 * — otherwise the mother's reserved package hours would be stranded on a server
 * that happens to have payments turned off.
 */
export function startBookingExtensionExpiryScheduler(): void {
  if (config.nodeEnv === 'test') return;

  const tick = () => {
    void expireStaleBookingExtensions();
  };

  // unref so a pending sweep never keeps the process alive on shutdown — this
  // is housekeeping, not work anything is waiting on.
  setInterval(tick, 30_000).unref();
  setTimeout(tick, 5_000).unref();
}

/** Read one extension. Mother and assigned nanny only. */
export async function getBookingExtension(
  decoded: DecodedIdToken,
  extensionId: number,
): Promise<BookingExtensionResponse> {
  const user = await getUserByUid(decoded.uid);
  await expireIfPastDeadline(extensionId);

  const ext = await loadExtension(extensionId);
  const booking = await loadBooking(ext.bookingId);
  const isMother = ext.motherId === user.id;
  const isNanny = booking.nannyProfile?.userId === user.id;
  if (!isMother && !isNanny) throw errors.forbidden('Access denied.');

  return toBookingExtensionResponse(ext);
}

// ── Notifications ────────────────────────────────────────────────────────────

async function notifyNannyExtensionRequested(
  booking: BookingForExtension,
  extensionId: number,
  hours: number,
): Promise<void> {
  const nannyUserId = booking.nannyProfile?.userId;
  if (!nannyUserId) return;

  const motherName = `${booking.mother.firstName} ${booking.mother.lastName}`;
  const title = 'Extra hours requested';
  const body = `${motherName} would like to extend your shift by ${hours} hour${hours === 1 ? '' : 's'}.`;

  await createInAppNotification({
    userId: nannyUserId,
    type: 'BOOKING_EXTENSION_REQUESTED',
    title,
    body,
    referenceId: booking.id,
    referenceType: 'BOOKING',
  });
  await dispatchPush(nannyUserId, {
    title,
    body,
    data: {
      type: 'booking_extension_requested',
      bookingId: String(booking.id),
      extensionId: String(extensionId),
      title,
    },
  });
}

async function notifyMotherExtensionDecided(
  booking: BookingForExtension,
  extensionId: number,
  accepted: boolean,
  hours: number,
  amountDue: number,
): Promise<void> {
  const nannyName = booking.nannyProfile?.user.firstName ?? 'Your nanny';
  const plural = hours === 1 ? '' : 's';
  const title = accepted ? 'Extra hours confirmed' : 'Extension declined';
  const body = accepted
    ? `${nannyName} can stay ${hours} more hour${plural}. Pay EGP ${amountDue} to confirm.`
    : `${nannyName} can't stay the extra ${hours} hour${plural}.`;

  await createInAppNotification({
    userId: booking.motherId,
    type: accepted ? 'BOOKING_EXTENSION_ACCEPTED' : 'BOOKING_EXTENSION_DECLINED',
    title,
    body,
    referenceId: booking.id,
    referenceType: 'BOOKING',
  });
  await dispatchPush(booking.motherId, {
    title,
    body,
    data: {
      // The accepted push is the mother's route to checkout, so it carries the
      // extension id the payment screen needs.
      type: accepted ? 'booking_extension_accepted' : 'booking_extension_declined',
      bookingId: String(booking.id),
      extensionId: String(extensionId),
      title,
    },
  });
}

/** Tell both sides the hours are locked in and the shift now runs later. */
async function notifyExtensionApplied(bookingId: number, hours: number): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: bookingForExtension,
  });
  if (!booking) return;

  const plural = hours === 1 ? '' : 's';
  const title = 'Booking extended';
  const recipients = [booking.motherId, booking.nannyProfile?.userId].filter(
    (id): id is number => typeof id === 'number',
  );

  for (const userId of recipients) {
    const body =
      userId === booking.motherId
        ? `Your booking now runs ${hours} hour${plural} longer.`
        : `This shift has been extended by ${hours} hour${plural}.`;
    await createInAppNotification({
      userId,
      type: 'BOOKING_EXTENDED',
      title,
      body,
      referenceId: booking.id,
      referenceType: 'BOOKING',
    });
    await dispatchPush(userId, {
      title,
      body,
      data: { type: 'booking_extended', bookingId: String(booking.id), title },
    });
  }
}

/** Re-exported so callers don't need to know the preset list lives in shared. */
export { BOOKING_EXTENSION_PRESET_HOURS };
