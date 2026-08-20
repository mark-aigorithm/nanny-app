/**
 * A2 — an admin turns a pending request away before any money moves.
 *
 * The assertion that matters is negative space: rejection must leave no
 * Payment row behind, and the mother must be told why.
 */
import { prisma } from '@backend/db/prisma';

import { makeMother, makeSuperuser } from '../../../test/factories';
import { rejectBooking } from '../../../test/journeys/admin';
import { createBookingViaApi } from '../../../test/journeys/booking';

describe('A2 — admin rejects a pending booking', () => {
  it('cancels the request, records the reason, and never touches money', async () => {
    const mother = await makeMother();
    const admin = await makeSuperuser();

    const booking = await createBookingViaApi(mother.token);
    expect(booking.status).toBe('PENDING');

    await rejectBooking(admin.token, booking.id, 'No nannies available in your area.');

    const rejected = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(rejected.status).toBe('CANCELLED');
    expect(rejected.cancellationReason).toBe('No nannies available in your area.');
    expect(rejected.cancelledAt).not.toBeNull();

    // No payment was ever created for a booking that died before approval.
    const payments = await prisma.payment.findMany({ where: { bookingId: booking.id } });
    expect(payments).toHaveLength(0);

    // The mother is told the request was not approved, with the reason.
    const note = await prisma.notification.findFirst({
      where: { userId: mother.id, type: 'BOOKING_CANCELLED' },
    });
    expect(note).not.toBeNull();
    expect(note?.body).toContain('No nannies available in your area.');
  });

  it('refuses to reject a booking that is already terminal', async () => {
    const mother = await makeMother();
    const admin = await makeSuperuser();

    const booking = await createBookingViaApi(mother.token);
    await rejectBooking(admin.token, booking.id);

    // A second rejection is an invalid CANCELLED → CANCELLED transition.
    await expect(rejectBooking(admin.token, booking.id)).rejects.toThrow(/400/);
  });
});
