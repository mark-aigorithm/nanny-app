/**
 * A23 — the console puts a nanny on a booking.
 *
 * Two shapes: an unclaimed request nobody took (assign = approve, so the
 * mother can pay), and a paid booking whose nanny has to be swapped (only the
 * nanny changes; the Payment row is untouched). The picker must mark the nanny
 * who is already booked for that window, and the server must refuse her.
 */
import { prisma } from '@backend/db/prisma';

import { makeBooking, makeMother, makeNanny, makeSuperuser } from '../../../test/factories';
import { assignBookingNanny, fetchBookingCandidates } from '../../../test/journeys/admin';
import { claimBooking, createBookingViaApi } from '../../../test/journeys/booking';
import { payViaPaymob, resetPaymobFake } from '../../../test/journeys/payment';

beforeEach(() => resetPaymobFake());

describe('A23 — admin assigns a nanny', () => {
  it('assigns an unclaimed request and approves it so the mother can pay', async () => {
    const mother = await makeMother();
    const nanny = await makeNanny();
    const admin = await makeSuperuser();

    const created = await createBookingViaApi(mother.token);
    expect(created.status).toBe('PENDING');

    const result = (await assignBookingNanny(admin.token, created.id, nanny.nannyProfileId)) as {
      status: string;
      nanny: { id: number } | null;
    };
    expect(result.status).toBe('APPROVED');
    expect(result.nanny?.id).toBe(nanny.nannyProfileId);

    const row = await prisma.booking.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.nannyProfileId).toBe(nanny.nannyProfileId);
    expect(row.adminApprovedById).toBe(admin.id);
    expect(row.adminActionById).toBe(admin.id);
    expect(row.nannyDecision).toBe('PENDING');

    // Both parties hear about it: the nanny that she has work, the mother that she must pay.
    expect(
      await prisma.notification.findFirst({ where: { userId: nanny.id, type: 'BOOKING_APPROVED' } }),
    ).not.toBeNull();
    expect(
      await prisma.notification.findFirst({ where: { userId: mother.id, type: 'BOOKING_APPROVED' } }),
    ).not.toBeNull();

    // And the booking is now payable — the whole point of approving it.
    await payViaPaymob(mother.token, 'booking', created.id);
    const paid = await prisma.booking.findUniqueOrThrow({ where: { id: created.id } });
    expect(paid.status).toBe('CONFIRMED');
  });

  it('swaps the nanny on a paid booking and leaves the payment alone', async () => {
    const mother = await makeMother();
    const first = await makeNanny();
    const second = await makeNanny();
    const admin = await makeSuperuser();

    const created = await createBookingViaApi(mother.token);
    await claimBooking(first.token, created.id);
    await payViaPaymob(mother.token, 'booking', created.id);
    const before = await prisma.payment.findFirstOrThrow({ where: { bookingId: created.id } });

    await assignBookingNanny(admin.token, created.id, second.nannyProfileId);

    const row = await prisma.booking.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.status).toBe('CONFIRMED');
    expect(row.nannyProfileId).toBe(second.nannyProfileId);
    expect(row.adminApprovedById).toBeNull(); // not an approval — it was already paid

    const after = await prisma.payment.findFirstOrThrow({ where: { bookingId: created.id } });
    expect(after).toEqual(before);

    expect(
      await prisma.notification.findFirst({ where: { userId: first.id, type: 'BOOKING_CANCELLED' } }),
    ).not.toBeNull();
    expect(
      await prisma.notification.findFirst({ where: { userId: second.id, type: 'BOOKING_APPROVED' } }),
    ).not.toBeNull();
    expect(
      await prisma.notification.findFirst({ where: { userId: mother.id, type: 'BOOKING_EDITED' } }),
    ).not.toBeNull();
  });

  it('marks a nanny booked for that window as busy and refuses to assign her', async () => {
    const mother = await makeMother();
    const otherMother = await makeMother();
    const busy = await makeNanny({ user: { firstName: 'Busy' } });
    const free = await makeNanny({ user: { firstName: 'Free' } });
    const admin = await makeSuperuser();

    // Both land on tomorrow. The factory's window is 10:00–14:00 UTC; the API's
    // is 10:00–14:00 Cairo wall-clock (07:00–11:00 or 08:00–12:00 UTC depending
    // on the season) — they always overlap by at least an hour.
    await makeBooking({ motherId: otherMother.id, nannyProfileId: busy.nannyProfileId, status: 'CONFIRMED' });
    const request = await createBookingViaApi(mother.token);

    const candidates = await fetchBookingCandidates(admin.token, request.id);
    const byId = new Map(candidates.map((c) => [c.id, c]));
    expect(byId.get(busy.nannyProfileId)?.conflict).toBe(true);
    expect(byId.get(free.nannyProfileId)?.conflict).toBe(false);

    await expect(
      assignBookingNanny(admin.token, request.id, busy.nannyProfileId),
    ).rejects.toThrow(/409/);

    // Still unclaimed — the refused write left nothing behind.
    const row = await prisma.booking.findUniqueOrThrow({ where: { id: request.id } });
    expect(row.status).toBe('PENDING');
    expect(row.nannyProfileId).toBeNull();
  });

  it('narrows the picker by name', async () => {
    const mother = await makeMother();
    await makeNanny({ user: { firstName: 'Sara' } });
    await makeNanny({ user: { firstName: 'Nour' } });
    const admin = await makeSuperuser();
    const request = await createBookingViaApi(mother.token);

    const rows = await fetchBookingCandidates(admin.token, request.id, 'sar');
    expect(rows.map((r) => r.name.split(' ')[0])).toEqual(['Sara']);
  });
});
