/**
 * A6 — buy a package, get hours, spend them on a booking.
 *
 * The rule that matters is that hours are credited only when the purchase is
 * actually paid: a PENDING_PAYMENT bucket must not be spendable, or a mother
 * could book against money that never arrived.
 *
 * The factory package is 10 hours for 1000 EGP; the seeded platform rate is
 * 120 EGP/h, so a 4-hour booking covered entirely by hours costs nothing.
 */
import request from 'supertest';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';

import { authHeader } from '../../../test/auth';
import { makeMother, makePackage, makeSuperuser } from '../../../test/factories';
import { createBookingViaApi } from '../../../test/journeys/booking';
import { purchasePackage, settleCheckout } from '../../../test/journeys/payment';

const PACKAGE_HOURS = 10;
const PACKAGE_PRICE = 1000;

async function availableHours(token: string): Promise<number> {
  const response = await request(app)
    .get('/packages/me/hours')
    .set(...authHeader(token));
  expect(response.status).toBe(200);
  return response.body.data.availableHours as number;
}

/** A mother holding a paid, ACTIVE package bucket. */
async function motherWithHours() {
  const mother = await makeMother();
  const pkg = await makePackage();

  const session = await purchasePackage(mother.token, pkg.id);
  await settleCheckout(session.clientSecret);

  return { mother, pkg, purchaseId: session.purchaseId };
}

describe('A6 — package hours', () => {
  it('credits hours only once the purchase is paid', async () => {
    const mother = await makeMother();
    const pkg = await makePackage();

    const session = await purchasePackage(mother.token, pkg.id);

    // The bucket exists but is unpaid, so nothing is spendable yet.
    const pending = await prisma.packagePurchase.findUniqueOrThrow({
      where: { id: session.purchaseId },
    });
    expect(pending.status).toBe('PENDING_PAYMENT');
    expect(await availableHours(mother.token)).toBe(0);

    await settleCheckout(session.clientSecret);

    const active = await prisma.packagePurchase.findUniqueOrThrow({
      where: { id: session.purchaseId },
    });
    expect(active.status).toBe('ACTIVE');
    expect(active.hoursPurchased).toBe(PACKAGE_HOURS);
    expect(await availableHours(mother.token)).toBe(PACKAGE_HOURS);

    // The price charged is the package's, snapshotted at purchase.
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: session.paymentId } });
    expect(Number(payment.amount)).toBe(PACKAGE_PRICE);
    expect(payment.purpose).toBe('PACKAGE');
  });

  it('draws hours down when a booking uses them', async () => {
    const { mother, purchaseId } = await motherWithHours();

    const booking = await createBookingViaApi(mother.token, { durationHours: 4 });

    const created = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(Number(created.packageHoursApplied)).toBe(4);
    // Fully covered by prepaid hours, so nothing is left to charge.
    expect(Number(created.totalAmount)).toBe(0);

    expect(await availableHours(mother.token)).toBe(PACKAGE_HOURS - 4);

    const bucket = await prisma.packagePurchase.findUniqueOrThrow({ where: { id: purchaseId } });
    expect(Number(bucket.hoursRemaining)).toBe(PACKAGE_HOURS - 4);
  });

  it('lets a mother save her hours and pay cash instead', async () => {
    const { mother } = await motherWithHours();

    const booking = await createBookingViaApi(mother.token, {
      durationHours: 4,
      usePackageHours: false,
    });

    const created = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(Number(created.packageHoursApplied)).toBe(0);
    expect(Number(created.totalAmount)).toBeGreaterThan(0);

    expect(await availableHours(mother.token)).toBe(PACKAGE_HOURS);
  });

  it('covers what it can and charges for the rest', async () => {
    const mother = await makeMother();
    // Only 3 hours available against a 4-hour booking.
    const pkg = await makePackage({ hours: 3, price: 300 });
    const session = await purchasePackage(mother.token, pkg.id);
    await settleCheckout(session.clientSecret);

    const booking = await createBookingViaApi(mother.token, { durationHours: 4 });

    const created = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(Number(created.packageHoursApplied)).toBe(3);
    expect(Number(created.totalAmount)).toBeGreaterThan(0);
    expect(await availableHours(mother.token)).toBe(0);
  });

  it('returns the hours when the booking is cancelled', async () => {
    const { mother } = await motherWithHours();

    const booking = await createBookingViaApi(mother.token, { durationHours: 4 });
    expect(await availableHours(mother.token)).toBe(PACKAGE_HOURS - 4);

    const cancel = await request(app)
      .post(`/bookings/${booking.id}/cancel`)
      .set(...authHeader(mother.token))
      .send({ reason: 'Plans changed.' });
    expect(cancel.status).toBe(200);

    // Prepaid hours must survive a cancellation — the mother already paid for them.
    expect(await availableHours(mother.token)).toBe(PACKAGE_HOURS);
  });

  it('reconciles a purchase whose webhook never arrived', async () => {
    const mother = await makeMother();
    const pkg = await makePackage();

    const session = await purchasePackage(mother.token, pkg.id);
    await settleCheckout(session.clientSecret, { deliverWebhook: false });
    expect(await availableHours(mother.token)).toBe(0);

    const sync = await request(app)
      .post(`/packages/purchases/${session.purchaseId}/sync`)
      .set(...authHeader(mother.token));
    expect(sync.status).toBe(200);

    expect(await availableHours(mother.token)).toBe(PACKAGE_HOURS);
  });

  it('shows the purchase in the admin console', async () => {
    const { purchaseId } = await motherWithHours();
    const admin = await makeSuperuser();

    const response = await request(app)
      .get('/admin/package-purchases')
      .set(...authHeader(admin.token));

    expect(response.status).toBe(200);
    const rows = response.body.data as Array<{ id: number; hoursPurchased: number }>;
    expect(rows.some((row) => row.id === purchaseId)).toBe(true);
  });

  it('refuses to buy an inactive package', async () => {
    const mother = await makeMother();
    const pkg = await makePackage({ isActive: false });

    const response = await request(app)
      .post(`/packages/${pkg.id}/purchase`)
      .set(...authHeader(mother.token))
      .send({ packageId: pkg.id });

    // Deactivating a package hides it rather than rejecting it: to a buyer it
    // is indistinguishable from one that never existed.
    expect(response.status).toBe(404);

    // And it is absent from the catalogue the app lists.
    const catalogue = await request(app)
      .get('/packages')
      .set(...authHeader(mother.token));
    expect(catalogue.status).toBe(200);
    const ids = (catalogue.body.data as Array<{ id: number }>).map((row) => row.id);
    expect(ids).not.toContain(pkg.id);
  });

  it('refuses a purchase whose body and path disagree', async () => {
    const mother = await makeMother();
    const pkg = await makePackage();
    const other = await makePackage();

    const response = await request(app)
      .post(`/packages/${pkg.id}/purchase`)
      .set(...authHeader(mother.token))
      .send({ packageId: other.id });

    expect(response.status).toBe(400);
  });
});
