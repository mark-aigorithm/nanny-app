import { EmailStatus, EmailTemplate, NotificationReferenceType } from '@prisma/client';
import { formatInTimeZone } from 'date-fns-tz';
import { PLATFORM_TIMEZONE, type ReceiptEmailVars } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { config } from '@backend/lib/config';
import { renderEmail } from '@backend/lib/email/render';
import { sendEmail } from '@backend/lib/email/transport';
import type { BookingWithRelations } from '@backend/services/booking.service';

/**
 * Transactional email the backend sends to users. Today this is the payment
 * receipt emailed to the paying parent once a booking payment captures.
 *
 * Every function here is best-effort: it renders + sends and records the
 * attempt in email_logs, but a mail or DB failure is caught and swallowed so it
 * can never block the caller (payment capture must succeed even if the receipt
 * doesn't send). When email isn't configured it's a silent no-op with no log.
 */

export interface SendReceiptEmailInput {
  booking: BookingWithRelations;
  /** Paymob transaction id captured in this settlement, if known. */
  paymobTransactionId?: string | null;
}

/** "6 August 2026" — platform-local calendar date. */
function formatDate(instant: Date): string {
  return formatInTimeZone(instant, PLATFORM_TIMEZONE, 'd MMMM yyyy');
}

/** "09:00" — platform-local wall-clock time. */
function formatTime(instant: Date): string {
  return formatInTimeZone(instant, PLATFORM_TIMEZONE, 'HH:mm');
}

function toReceiptVars(input: SendReceiptEmailInput): ReceiptEmailVars {
  const { booking } = input;
  // bookingInclude carries the newest payment attempt; it holds the currency
  // snapshot and Paymob references the receipt cites.
  const payment = booking.payments[0];
  const nanny = booking.nannyProfile?.user;
  const reference =
    input.paymobTransactionId ??
    payment?.paymobTransactionId ??
    payment?.paymobOrderId ??
    String(payment?.id ?? booking.id);
  const paidAt = payment?.updatedAt ?? booking.updatedAt;

  return {
    bookingId: booking.id,
    parentName: booking.mother.firstName,
    nannyName: nanny ? `${nanny.firstName} ${nanny.lastName}`.trim() : 'your nanny',
    bookingDate: formatDate(booking.date),
    startTime: formatTime(booking.startTime),
    endTime: formatTime(booking.endTime),
    durationHours: Number(booking.durationHours),
    currency: payment?.currency ?? 'EGP',
    subtotal: Number(booking.subtotal),
    // Reward/package credits are already folded into discountAmount — a single
    // discount line, so amounts aren't double-counted (see the Booking schema).
    discountAmount: Number(booking.discountAmount),
    totalAmount: Number(booking.totalAmount),
    paymentReference: reference,
    paymentDate: formatDate(paidAt),
  };
}

export async function sendReceiptEmail(input: SendReceiptEmailInput): Promise<void> {
  if (!config.email.enabled) return;

  const to = input.booking.mother.email;
  if (!to) return;

  try {
    const vars = toReceiptVars(input);
    const { subject, html } = renderEmail(EmailTemplate.RECEIPT, vars);
    const result = await sendEmail({ to, subject, html });

    await prisma.emailLog.create({
      data: {
        recipientEmail: to,
        userId: input.booking.mother.id,
        template: EmailTemplate.RECEIPT,
        subject,
        status: result.ok ? EmailStatus.SENT : EmailStatus.FAILED,
        error: result.ok ? null : result.error,
        referenceType: NotificationReferenceType.BOOKING,
        referenceId: input.booking.id,
      },
    });
  } catch (err) {
    // A receipt must never break payment capture — log and move on.
    // eslint-disable-next-line no-console
    console.warn('[email] failed to send receipt', { bookingId: input.booking.id, err });
  }
}
