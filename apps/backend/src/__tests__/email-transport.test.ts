/**
 * The SMTP wrapper's honesty about what actually happened.
 *
 * `sendMail` resolving means the server took the *message*, not that it took the
 * *recipient*: a 250 can come back with every address in `rejected`. Reporting
 * that as `ok: true` is how a caller records EmailStatus.SENT, returns 204, and
 * leaves a user waiting for a code that was never going to arrive.
 */

const mockSendMail = jest.fn();

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn(() => ({ sendMail: mockSendMail })) },
}));

jest.mock('@backend/lib/config', () => ({
  config: {
    email: {
      enabled: true,
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      user: 'bot@example.com',
      pass: 'secret',
      from: 'NannyApp <bot@example.com>',
    },
  },
}));

import { sendEmail } from '@backend/lib/email/transport';

const MAIL = { to: 'sarah@example.com', subject: 'Your code', html: '<p>123456</p>' };

beforeEach(() => {
  mockSendMail.mockReset();
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

it('reports success when the recipient was accepted', async () => {
  mockSendMail.mockResolvedValue({
    accepted: ['sarah@example.com'],
    rejected: [],
    messageId: '<abc@example.com>',
    response: '250 2.0.0 OK 1757 - gsmtp',
  });

  await expect(sendEmail(MAIL)).resolves.toEqual({ ok: true });
});

it('reports failure when SMTP answered 250 but accepted nobody', async () => {
  mockSendMail.mockResolvedValue({
    accepted: [],
    rejected: ['sarah@example.com'],
    messageId: '<abc@example.com>',
    response: '250 2.0.0 OK',
  });

  const result = await sendEmail(MAIL);

  expect(result.ok).toBe(false);
  expect(result).toMatchObject({ error: expect.stringContaining('sarah@example.com') });
});

it('logs the queue id and the From actually used, to tell a non-send from a dropped send', async () => {
  const info = jest.spyOn(console, 'info');
  mockSendMail.mockResolvedValue({
    accepted: ['sarah@example.com'],
    rejected: [],
    messageId: '<abc@example.com>',
    response: '250 2.0.0 OK 1757 - gsmtp',
  });

  await sendEmail(MAIL);

  expect(info).toHaveBeenCalledWith(
    '[email] sent',
    expect.objectContaining({
      from: 'NannyApp <bot@example.com>',
      messageId: '<abc@example.com>',
      response: '250 2.0.0 OK 1757 - gsmtp',
    }),
  );
});

it('never logs the recipient address — email_logs already holds it', async () => {
  const info = jest.spyOn(console, 'info');
  mockSendMail.mockResolvedValue({
    accepted: ['sarah@example.com'],
    rejected: [],
    messageId: '<abc@example.com>',
    response: '250 OK',
  });

  await sendEmail(MAIL);

  expect(JSON.stringify(info.mock.calls[0])).not.toContain('sarah@example.com');
});

it('turns a thrown transport error into a result rather than propagating it', async () => {
  mockSendMail.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:1025'));

  await expect(sendEmail(MAIL)).resolves.toEqual({
    ok: false,
    error: 'connect ECONNREFUSED 127.0.0.1:1025',
  });
});
