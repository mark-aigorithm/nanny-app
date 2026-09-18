/**
 * Reading what the backend actually mailed, out of Mailpit.
 *
 * Registration now takes a one-time email token, and the only way to get one is
 * the way a user does: ask for a code, read the email, exchange the code. Mailpit
 * is the SMTP sink the test stack points nodemailer at (docker-compose.test.yml),
 * and it exposes everything it received over HTTP on :8025. Mirrors
 * `apps/backend/test/mailpit.ts` — the two suites talk to the same inbox.
 */
const MAILPIT_URL = process.env['MAILPIT_URL'] ?? 'http://127.0.0.1:8025';

interface MailpitSummary {
  ID: string;
}

async function mailpit<T>(path: string): Promise<T> {
  const response = await fetch(`${MAILPIT_URL}${path}`);
  if (!response.ok) {
    throw new Error(
      `Mailpit request failed (${response.status}) for ${path}. ` +
        'Is the test stack up? Run `pnpm test:env` from the repo root.',
    );
  }
  return (await response.json()) as T;
}

/** The newest message sent to `email`, or null if none has arrived yet. */
async function newestMessageId(email: string): Promise<string | null> {
  const { messages } = await mailpit<{ messages: MailpitSummary[] }>(
    `/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=1`,
  );
  return messages[0]?.ID ?? null;
}

/**
 * Wait for a verification email to `email` and return the 6-digit code from it.
 *
 * Polls because the send is a real SMTP round trip: the HTTP response to
 * /auth/email/otp can land marginally before Mailpit has finished storing the
 * message.
 */
export async function waitForOtp(email: string, timeoutMs = 10_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const id = await newestMessageId(email);
    if (id) {
      const { HTML } = await mailpit<{ HTML: string }>(`/api/v1/message/${id}`);
      // The code is the only 6-digit run inside the styled code block; see
      // the backend's lib/email/templates/email-verification.html.
      const match = HTML.match(/letter-spacing:8px[^>]*>(\d{6})</);
      if (match?.[1]) return match[1];
      throw new Error(`Email to ${email} had no verification code in it:\n${HTML.slice(0, 500)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`No verification email arrived for ${email} within ${timeoutMs}ms.`);
}
