// Mock config, prisma and the SMTP transport; use the REAL renderer and the
// REAL crypto helpers, so the template and the hashing are exercised too.
jest.mock('@backend/lib/config', () => ({ config: { email: { enabled: true } } }));
// firebase.ts initialises the Admin SDK on import; the service only
// type-imports DecodedIdToken from it (erased), but be explicit.
jest.mock('@backend/lib/firebase', () => ({}));
jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: { findFirst: jest.fn() },
    emailLog: { create: jest.fn() },
    emailVerification: {
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));
jest.mock('@backend/lib/email/transport', () => ({ sendEmail: jest.fn() }));

import { config } from '@backend/lib/config';
import { prisma } from '@backend/db/prisma';
import { sendEmail } from '@backend/lib/email/transport';
import { hashOtp } from '@backend/lib/otp';
import {
  consumeVerificationToken,
  sendEmailOtp,
  verifyEmailOtp,
} from '@backend/services/email-verification.service';

const mockConfig = config as unknown as { email: { enabled: boolean } };
const mockSend = sendEmail as jest.Mock;
const m = prisma as unknown as {
  user: { findFirst: jest.Mock };
  emailLog: { create: jest.Mock };
  emailVerification: {
    findFirst: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
};

const EMAIL = 'sarah@example.com';
const MINUTE = 60_000;

/** Pull the code out of the email we just "sent" — the only place it exists in the clear. */
function sentCode(): string {
  const html = mockSend.mock.calls[0]?.[0]?.html as string;
  const match = html.match(/letter-spacing:8px[^>]*>(\d{6})</);
  if (!match?.[1]) throw new Error('no code found in the rendered email');
  return match[1];
}

/** A stored row for a live, unverified code. */
function pendingRow(code: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    email: EMAIL,
    codeHash: hashOtp(code),
    tokenHash: null,
    attempts: 0,
    expiresAt: new Date(Date.now() + 10 * MINUTE),
    verifiedAt: null,
    consumedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockConfig.email.enabled = true;
  mockSend.mockResolvedValue({ ok: true });
  m.user.findFirst.mockResolvedValue(null);
  m.emailVerification.findFirst.mockResolvedValue(null);
  m.emailVerification.count.mockResolvedValue(0);
  m.emailVerification.update.mockImplementation(async () => ({ attempts: 1 }));
});

describe('sendEmailOtp', () => {
  it('mails a 6-digit code, logs the send, and stores only its hash', async () => {
    await sendEmailOtp({ email: EMAIL });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ to: EMAIL, subject: expect.stringContaining('Confirm your email') }),
    );
    const code = sentCode();

    expect(m.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientEmail: EMAIL,
          template: 'EMAIL_VERIFICATION',
          status: 'SENT',
        }),
      }),
    );

    const stored = m.emailVerification.create.mock.calls[0]?.[0]?.data;
    expect(stored.codeHash).toBe(hashOtp(code));
    // The plaintext must never reach the database.
    expect(JSON.stringify(stored)).not.toContain(code);
  });

  it('lowercases the address so the same inbox rate-limits as one', async () => {
    await sendEmailOtp({ email: '  Sarah@Example.COM ' });
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ to: EMAIL }));
    expect(m.emailVerification.create.mock.calls[0]?.[0]?.data.email).toBe(EMAIL);
  });

  it('refuses when no transport is configured, rather than silently doing nothing', async () => {
    mockConfig.email.enabled = false;
    await expect(sendEmailOtp({ email: EMAIL })).rejects.toThrow('Email is not configured');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('refuses an address another account already holds', async () => {
    m.user.findFirst.mockResolvedValue({ id: 99 });
    await expect(sendEmailOtp({ email: EMAIL })).rejects.toThrow('already exists');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('excludes the signed-in caller from the collision check, so they can re-verify their own address', async () => {
    // First findFirst resolves the caller; second is the collision check.
    m.user.findFirst
      .mockResolvedValueOnce({ id: 7, firstName: 'Sarah' })
      .mockResolvedValueOnce(null);

    await expect(
      sendEmailOtp({ email: EMAIL, decoded: { uid: 'fb-7' } as never }),
    ).resolves.toBeUndefined();

    expect(m.user.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { not: 7 } }) }),
    );
    // Knowing who they are also personalises the greeting.
    expect(mockSend.mock.calls[0][0].html).toContain('Hi Sarah');
    expect(m.emailVerification.create.mock.calls[0]?.[0]?.data.userId).toBe(7);
  });

  it('sends anonymously during nanny sign-up, when no account exists yet', async () => {
    await sendEmailOtp({ email: EMAIL });
    expect(m.emailVerification.create.mock.calls[0]?.[0]?.data.userId).toBeNull();
    expect(mockSend.mock.calls[0][0].html).not.toContain('Hi ');
  });

  it('enforces a resend cooldown', async () => {
    m.emailVerification.findFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 5_000) });
    await expect(sendEmailOtp({ email: EMAIL })).rejects.toThrow(/wait \d+ seconds/);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('allows a resend once the cooldown has passed', async () => {
    m.emailVerification.findFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 5 * MINUTE) });
    await expect(sendEmailOtp({ email: EMAIL })).resolves.toBeUndefined();
  });

  it('caps sends per address per hour', async () => {
    m.emailVerification.count.mockResolvedValue(5);
    await expect(sendEmailOtp({ email: EMAIL })).rejects.toThrow('Too many codes requested');
  });

  it('does not create a row when the mail fails, so a lost code costs no allowance', async () => {
    mockSend.mockResolvedValue({ ok: false, error: 'connection refused' });
    await expect(sendEmailOtp({ email: EMAIL })).rejects.toThrow('could not send the code');
    expect(m.emailVerification.create).not.toHaveBeenCalled();
    // The failure is still audited.
    expect(m.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
  });
});

describe('verifyEmailOtp', () => {
  it('issues a single-use token for the right code and stores only its hash', async () => {
    m.emailVerification.findFirst.mockResolvedValue(pendingRow('123456'));

    const { verificationToken, expiresAt } = await verifyEmailOtp(EMAIL, '123456');

    expect(verificationToken).toHaveLength(64);
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());
    const written = m.emailVerification.update.mock.calls[0]?.[0]?.data;
    expect(written.tokenHash).toBe(hashOtp(verificationToken));
    expect(written.verifiedAt).toBeInstanceOf(Date);
  });

  it('rejects a wrong code and counts the attempt', async () => {
    m.emailVerification.findFirst.mockResolvedValue(pendingRow('123456'));
    await expect(verifyEmailOtp(EMAIL, '000000')).rejects.toThrow('not right');
    expect(m.emailVerification.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { attempts: { increment: 1 } } }),
    );
  });

  it('burns the code once the attempt cap is reached', async () => {
    m.emailVerification.findFirst.mockResolvedValue(pendingRow('123456', { attempts: 4 }));
    m.emailVerification.update.mockResolvedValue({ attempts: 5 });
    await expect(verifyEmailOtp(EMAIL, '000000')).rejects.toThrow('expired');
  });

  it('refuses a code past its cap without even comparing it', async () => {
    m.emailVerification.findFirst.mockResolvedValue(pendingRow('123456', { attempts: 5 }));
    await expect(verifyEmailOtp(EMAIL, '123456')).rejects.toThrow('expired');
    expect(m.emailVerification.update).not.toHaveBeenCalled();
  });

  it('refuses an expired code', async () => {
    m.emailVerification.findFirst.mockResolvedValue(
      pendingRow('123456', { expiresAt: new Date(Date.now() - MINUTE) }),
    );
    await expect(verifyEmailOtp(EMAIL, '123456')).rejects.toThrow('expired');
  });

  it('gives the same answer when no code is outstanding, so live addresses are not disclosed', async () => {
    m.emailVerification.findFirst.mockResolvedValue(null);
    await expect(verifyEmailOtp(EMAIL, '123456')).rejects.toThrow('expired');
  });
});

describe('consumeVerificationToken', () => {
  const TOKEN = 'a'.repeat(64);

  function verifiedRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 1,
      email: EMAIL,
      tokenHash: hashOtp(TOKEN),
      verifiedAt: new Date(),
      consumedAt: null,
      expiresAt: new Date(Date.now() + 15 * MINUTE),
      deletedAt: null,
      ...overrides,
    };
  }

  it('spends a live token', async () => {
    m.emailVerification.findFirst.mockResolvedValue(verifiedRow());
    await expect(consumeVerificationToken(EMAIL, TOKEN)).resolves.toBeUndefined();
    expect(m.emailVerification.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { consumedAt: expect.any(Date) } }),
    );
  });

  it('refuses a token already spent', async () => {
    m.emailVerification.findFirst.mockResolvedValue(verifiedRow({ consumedAt: new Date() }));
    await expect(consumeVerificationToken(EMAIL, TOKEN)).rejects.toThrow('expired');
    expect(m.emailVerification.update).not.toHaveBeenCalled();
  });

  it('refuses a token issued for a different address', async () => {
    m.emailVerification.findFirst.mockResolvedValue(verifiedRow({ email: 'someone@else.com' }));
    await expect(consumeVerificationToken(EMAIL, TOKEN)).rejects.toThrow('expired');
  });

  it('refuses a token past its window', async () => {
    m.emailVerification.findFirst.mockResolvedValue(
      verifiedRow({ expiresAt: new Date(Date.now() - MINUTE) }),
    );
    await expect(consumeVerificationToken(EMAIL, TOKEN)).rejects.toThrow('expired');
  });

  it('refuses an unknown token', async () => {
    m.emailVerification.findFirst.mockResolvedValue(null);
    await expect(consumeVerificationToken(EMAIL, TOKEN)).rejects.toThrow('expired');
  });

  it('looks the row up by hash, never by the token itself', async () => {
    m.emailVerification.findFirst.mockResolvedValue(verifiedRow());
    await consumeVerificationToken(EMAIL, TOKEN);
    expect(m.emailVerification.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tokenHash: hashOtp(TOKEN) }),
      }),
    );
  });
});
