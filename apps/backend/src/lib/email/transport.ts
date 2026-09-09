import nodemailer, { type Transporter } from 'nodemailer';

import { config } from '@backend/lib/config';

/**
 * Thin, non-throwing wrapper around the SMTP transport — the email counterpart
 * of lib/storage.ts. Mirrors the "best-effort external provider" style: a send
 * failure returns an error result rather than throwing, so callers on the
 * request path (e.g. payment capture) are never blocked by a mail outage.
 *
 * The transporter is built lazily and reused. When email isn't configured
 * (`config.email.enabled === false`) sending is a deliberate no-op.
 */

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

export type SendEmailResult = { ok: true } | { ok: false; error: string };

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!config.email.enabled) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.secure,
      auth: { user: config.email.user, pass: config.email.pass },
    });
  }
  return transporter;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (!config.email.enabled) {
    return { ok: false, error: 'email_not_configured' };
  }
  const tx = getTransporter();
  if (!tx) return { ok: false, error: 'email_not_configured' };

  try {
    const info = await tx.sendMail({
      from: config.email.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
    });

    // `sendMail` resolving means the SMTP server took the message, NOT that it
    // took the recipient: a server can answer 250 having accepted none of them,
    // and nodemailer reports that in `rejected` rather than throwing. Reporting
    // that as a success is how a user ends up staring at a code box waiting for
    // mail that was never going to arrive.
    const accepted = info.accepted?.length ?? 0;
    const rejected = info.rejected?.map(String) ?? [];
    if (accepted === 0) {
      return {
        ok: false,
        error: `SMTP accepted no recipient${rejected.length ? ` (rejected: ${rejected.join(', ')})` : ''}`,
      };
    }

    // The provider's queue id lives in `response` (Gmail: "250 2.0.0 OK <id> - gsmtp").
    // With `from`, this is what distinguishes "we never sent it" from "we sent it
    // and the recipient's provider dropped it" — the second looks identical from
    // here, and is what an EMAIL_FROM whose domain doesn't authorize this SMTP
    // account (SPF/DKIM misalignment) produces. No recipient address is logged;
    // it is already on the email_logs row for the same moment.
    // eslint-disable-next-line no-console
    console.info('[email] sent', {
      template: input.subject,
      from: config.email.from,
      messageId: info.messageId,
      response: info.response,
      accepted,
      rejected: rejected.length,
    });

    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.warn('[email] send failed', { from: config.email.from, error });
    return { ok: false, error };
  }
}
