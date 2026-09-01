/**
 * Email-verification journey steps.
 *
 * Walks the real two-phase flow — send a code, read it out of Mailpit, exchange
 * it for a one-time token — through the same public routes the app calls.
 * Nothing is stubbed: the code really is mailed over SMTP and really is read
 * back from the inbox.
 */
import request from 'supertest';

import { app } from '@backend/app';

import { authHeader } from '../auth';
import { waitForOtp } from '../mailpit';

/**
 * Send a code to `email`, read it, and exchange it for a verification token.
 * The token is what a nanny puts in her `/auth/register` body and a mother
 * puts in her `/auth/email` body.
 *
 * `actingToken` mirrors the client: the mobile axios instance attaches the JWT
 * to every request, so a signed-in mother's send is authenticated (which is
 * what lets the collision check ignore her own row, and what puts her id on
 * the email log). A nanny mid-registration has no token and passes none.
 */
export async function proveEmail(email: string, actingToken?: string): Promise<string> {
  const send = request(app).post('/auth/email/otp');
  if (actingToken) send.set(...authHeader(actingToken));
  const sent = await send.send({ email });
  if (sent.status !== 204) {
    throw new Error(`Sending the code to ${email} failed (${sent.status}): ${sent.body?.error}`);
  }

  const code = await waitForOtp(email);

  const verified = await request(app).post('/auth/email/verify').send({ email, code });
  if (verified.status !== 200) {
    throw new Error(`Verifying the code for ${email} failed (${verified.status}): ${verified.body?.error}`);
  }

  return verified.body.data.verificationToken as string;
}

/**
 * The mother's half of the gate: prove an address, then attach it to the
 * signed-in account so she can book. Returns the updated user response.
 */
export async function verifyMyEmail(token: string, email: string): Promise<unknown> {
  const verificationToken = await proveEmail(email, token);

  const response = await request(app)
    .post('/auth/email')
    .set(...authHeader(token))
    .send({ email, verificationToken });

  if (response.status !== 200) {
    throw new Error(`Attaching ${email} failed (${response.status}): ${response.body?.error}`);
  }

  return response.body.data;
}
