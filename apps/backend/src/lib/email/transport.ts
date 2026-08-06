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
    await tx.sendMail({
      from: config.email.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
