/**
 * Guard tests for the live-Firebase E2E harness.
 *
 * These operations run against the project that also serves production, so
 * every path here proves a refusal happens *before* any Firebase or Prisma
 * call that could touch a real account — for the allowlist itself, for the
 * run-baseline (`beginRun`) that gates deletion on top of it, and for the
 * creation-time freshness check that turns "has a uid" into "this run
 * created that uid".
 */
jest.mock('@backend/db/prisma', () => ({
  prisma: { user: { findUnique: jest.fn(), update: jest.fn() } },
}));
jest.mock('@backend/lib/firebase', () => ({
  firebaseAuth: {
    getUserByPhoneNumber: jest.fn(),
    getUserByEmail: jest.fn(),
    deleteUser: jest.fn(),
    generatePasswordResetLink: jest.fn(),
  },
}));

// A mutable, shared config mock — mutated per-test (rather than reassigned)
// so tests can flip the flag / nodeEnv / database name without re-mocking.
const mockConfig = {
  e2eLiveAuthEnabled: true,
  nodeEnv: 'test' as string,
  databaseUrl: 'postgresql://user:pass@localhost:55432/nannyapp_test',
  firebase: { webApiKey: 'test-web-api-key' },
};
jest.mock('@backend/lib/config', () => ({ config: mockConfig }));

import { prisma } from '@backend/db/prisma';
import { firebaseAuth } from '@backend/lib/firebase';
import {
  __resetRunStateForTests,
  beginRun,
  completeReset,
  describeAccount,
  purgeAccount,
  TEST_PHONES,
} from '@backend/services/e2e-auth.service';

const mockFb = firebaseAuth as unknown as {
  getUserByPhoneNumber: jest.Mock;
  getUserByEmail: jest.Mock;
  deleteUser: jest.Mock;
  generatePasswordResetLink: jest.Mock;
};
const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock; update: jest.Mock };
};

/** Firebase's shape for "no account with this phone/email". */
const NOT_FOUND = Object.assign(new Error('no user'), { code: 'auth/user-not-found' });

/** Same generic, PII-free message completeReset uses for both refusal branches. */
const NOT_RESERVED_ACCOUNT_MESSAGE = 'That account is not on a reserved test number.';

const originalFetch = globalThis.fetch;

beforeEach(() => {
  jest.clearAllMocks();
  __resetRunStateForTests();

  mockConfig.e2eLiveAuthEnabled = true;
  mockConfig.nodeEnv = 'test';
  mockConfig.databaseUrl = 'postgresql://user:pass@localhost:55432/nannyapp_test';
  mockConfig.firebase.webApiKey = 'test-web-api-key';

  // Sane defaults: no local row, no Firebase account, unless a test says otherwise.
  mockPrisma.user.findUnique.mockResolvedValue(null);
  mockFb.getUserByPhoneNumber.mockRejectedValue(NOT_FOUND);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

it('allows only the two reserved numbers', () => {
  expect(TEST_PHONES).toEqual(['+201234567891', '+201234567892']);
});

it.each([
  '+201288719791', // a real person
  '+201234567890', // a manual-test account
  '+201234567893',
  '+201100000001', // an emulator fixture
])('refuses to describe %s', async (phone) => {
  await expect(describeAccount(phone)).rejects.toThrow('not a reserved test number');
  expect(mockFb.getUserByPhoneNumber).not.toHaveBeenCalled();
});

it.each(['+201288719791', '+201234567890'])('refuses to purge %s', async (phone) => {
  await expect(purgeAccount(phone)).rejects.toThrow('not a reserved test number');
  expect(mockFb.deleteUser).not.toHaveBeenCalled();
});

it('refuses to purge a non-reserved number even after a clean beginRun, with no Firebase call', async () => {
  await beginRun();
  jest.clearAllMocks();

  await expect(purgeAccount('+201288719791')).rejects.toThrow('not a reserved test number');
  expect(mockFb.getUserByPhoneNumber).not.toHaveBeenCalled();
  expect(mockFb.deleteUser).not.toHaveBeenCalled();
});

describe('beginRun', () => {
  it('refuses when a reserved number already has a Firebase account, and deletes nothing', async () => {
    mockFb.getUserByPhoneNumber.mockImplementation(async (phone: string) => {
      if (phone === '+201234567891') {
        return { uid: 'pre-existing-uid', email: null, providerData: [] };
      }
      throw NOT_FOUND;
    });

    await expect(beginRun()).rejects.toThrow('+201234567891');
    expect(mockFb.deleteUser).not.toHaveBeenCalled();

    // And the run never began — purge still refuses.
    await expect(purgeAccount('+201234567892')).rejects.toThrow(/begin/i);
    expect(mockFb.deleteUser).not.toHaveBeenCalled();
  });

  it('records a clean baseline when neither reserved number has a Firebase account', async () => {
    const result = await beginRun();

    expect(result.phones).toEqual(TEST_PHONES);
    expect(mockFb.getUserByPhoneNumber).toHaveBeenCalledWith('+201234567891');
    expect(mockFb.getUserByPhoneNumber).toHaveBeenCalledWith('+201234567892');
    expect(mockFb.deleteUser).not.toHaveBeenCalled();
  });

  it('a failed second beginRun revokes an earlier successful baseline', async () => {
    await beginRun(); // clean — succeeds, records a baseline

    // A reserved number now has an account (e.g. someone registered it by
    // hand between runs) — the *next* beginRun must both refuse and revoke
    // the baseline the first call recorded, not just fail to renew it.
    mockFb.getUserByPhoneNumber.mockImplementation(async (phone: string) => {
      if (phone === '+201234567891') {
        return { uid: 'late-arrival', email: null, providerData: [] };
      }
      throw NOT_FOUND;
    });

    await expect(beginRun()).rejects.toThrow('+201234567891');

    // The process is now locked, despite the earlier successful begin.
    await expect(purgeAccount('+201234567891')).rejects.toThrow(/begin/i);
    expect(mockFb.deleteUser).not.toHaveBeenCalled();
  });
});

describe('purgeAccount run-baseline gate', () => {
  it('refuses before beginRun, and succeeds once a clean run has begun', async () => {
    await expect(purgeAccount('+201234567891')).rejects.toThrow(/begin/i);
    expect(mockFb.deleteUser).not.toHaveBeenCalled();

    await beginRun();

    // Simulate an account created during this run — freshly "created" so it
    // also clears the run-age check below.
    mockFb.getUserByPhoneNumber.mockResolvedValueOnce({
      uid: 'uid-created-this-run',
      email: null,
      providerData: [],
      metadata: { creationTime: new Date().toISOString() },
    });

    const result = await purgeAccount('+201234567891');

    expect(mockFb.deleteUser).toHaveBeenCalledWith('uid-created-this-run');
    expect(result.firebaseExists).toBe(false);
  });
});

describe('run-freshness check (assertCreatedDuringRun)', () => {
  it('refuses to purge an account whose Firebase creation time predates the run baseline, and calls no deleteUser', async () => {
    await beginRun();

    const staleCreationTime = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour before begin
    mockFb.getUserByPhoneNumber.mockResolvedValueOnce({
      uid: 'stale-uid',
      email: null,
      providerData: [],
      metadata: { creationTime: staleCreationTime },
    });

    await expect(purgeAccount('+201234567891')).rejects.toThrow('predates this run');
    expect(mockFb.deleteUser).not.toHaveBeenCalled();
  });

  it('refuses to complete a reset for an account whose creation time predates the run baseline, and calls no generatePasswordResetLink', async () => {
    await beginRun();

    const staleCreationTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    mockFb.getUserByEmail.mockResolvedValue({
      phoneNumber: '+201234567891',
      metadata: { creationTime: staleCreationTime },
    });

    await expect(completeReset('sarah@example.com', 'NewPass123!')).rejects.toThrow('predates this run');
    expect(mockFb.generatePasswordResetLink).not.toHaveBeenCalled();
  });

  it('tolerates a few minutes of clock skew before the baseline', async () => {
    await beginRun();

    const slightlyBeforeBegin = new Date(Date.now() - 2 * 60 * 1000).toISOString(); // 2 min before "now"
    mockFb.getUserByPhoneNumber.mockResolvedValueOnce({
      uid: 'skew-ok-uid',
      email: null,
      providerData: [],
      metadata: { creationTime: slightlyBeforeBegin },
    });

    const result = await purgeAccount('+201234567891');

    expect(mockFb.deleteUser).toHaveBeenCalledWith('skew-ok-uid');
    expect(result.firebaseExists).toBe(false);
  });

  it('allows purge of an account created fresh during the run', async () => {
    await beginRun();

    mockFb.getUserByPhoneNumber.mockResolvedValueOnce({
      uid: 'fresh-uid',
      email: null,
      providerData: [],
      metadata: { creationTime: new Date().toISOString() },
    });

    const result = await purgeAccount('+201234567891');

    expect(mockFb.deleteUser).toHaveBeenCalledWith('fresh-uid');
    expect(result.firebaseExists).toBe(false);
  });
});

describe('completeReset', () => {
  it('returns the same status and generic message whether the account is missing or on a non-reserved number', async () => {
    await beginRun();

    mockFb.getUserByEmail.mockRejectedValueOnce(NOT_FOUND);
    const missingAccountError = await completeReset('ghost@example.com', 'NewPass123!').catch(
      (e: unknown) => e,
    );

    mockFb.getUserByEmail.mockResolvedValueOnce({
      phoneNumber: '+201288719791',
      metadata: { creationTime: new Date().toISOString() },
    });
    const wrongPhoneError = await completeReset('someone@example.com', 'NewPass123!').catch(
      (e: unknown) => e,
    );

    expect(missingAccountError).toMatchObject({ statusCode: 403, message: NOT_RESERVED_ACCOUNT_MESSAGE });
    expect(wrongPhoneError).toMatchObject({ statusCode: 403, message: NOT_RESERVED_ACCOUNT_MESSAGE });
    // Never leak the real phone number in the refusal.
    expect((wrongPhoneError as Error).message).not.toContain('+201288719791');
    expect(mockFb.generatePasswordResetLink).not.toHaveBeenCalled();
  });

  it.each([['+201288719791'], [undefined]])(
    'refuses without calling generatePasswordResetLink when the live account phone is %s',
    async (phone) => {
      await beginRun();
      mockFb.getUserByEmail.mockResolvedValue({
        phoneNumber: phone,
        metadata: { creationTime: new Date().toISOString() },
      });

      await expect(completeReset('someone@example.com', 'NewPass123!')).rejects.toThrow(
        NOT_RESERVED_ACCOUNT_MESSAGE,
      );
      expect(mockFb.generatePasswordResetLink).not.toHaveBeenCalled();
    },
  );

  it('refuses before beginRun, without calling getUserByEmail', async () => {
    mockFb.getUserByEmail.mockResolvedValue({ phoneNumber: '+201234567891' });

    await expect(completeReset('sarah@example.com', 'NewPass123!')).rejects.toThrow(/begin/i);
    expect(mockFb.getUserByEmail).not.toHaveBeenCalled();
    expect(mockFb.generatePasswordResetLink).not.toHaveBeenCalled();
  });

  it('throws before generating a link when FIREBASE_WEB_API_KEY is not configured', async () => {
    await beginRun();
    mockConfig.firebase.webApiKey = '';
    mockFb.getUserByEmail.mockResolvedValue({ phoneNumber: '+201234567891' });

    await expect(completeReset('sarah@example.com', 'NewPass123!')).rejects.toThrow(
      'FIREBASE_WEB_API_KEY',
    );
    expect(mockFb.getUserByEmail).not.toHaveBeenCalled();
    expect(mockFb.generatePasswordResetLink).not.toHaveBeenCalled();
  });

  it('spends the oobCode over the Identity Toolkit REST API once the live account is a reserved, freshly-created number', async () => {
    await beginRun();
    mockFb.getUserByEmail.mockResolvedValue({
      phoneNumber: '+201234567891',
      metadata: { creationTime: new Date().toISOString() },
    });
    mockFb.generatePasswordResetLink.mockResolvedValue(
      'https://example.com/reset?oobCode=abc123&mode=resetPassword',
    );
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await completeReset('sarah@example.com', 'NewPass123!');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('identitytoolkit.googleapis.com'),
      expect.objectContaining({ method: 'POST', body: expect.stringContaining('abc123') }),
    );
  });
});

describe('assertEnabled guards every operation', () => {
  const disablingMutations: Array<[string, () => void, RegExp]> = [
    [
      'the flag is off',
      () => {
        mockConfig.e2eLiveAuthEnabled = false;
      },
      /disabled/i,
    ],
    [
      'nodeEnv is production',
      () => {
        mockConfig.nodeEnv = 'production';
      },
      /disabled/i,
    ],
    [
      'the database is not nannyapp_test',
      () => {
        mockConfig.databaseUrl = 'postgresql://user:pass@localhost:5432/nannyapp_dev';
      },
      /nannyapp_dev/,
    ],
  ];

  it.each(disablingMutations)('describeAccount refuses when %s', async (_label, mutate, expectedMessage) => {
    mutate();
    await expect(describeAccount('+201234567891')).rejects.toThrow(expectedMessage);
    expect(mockFb.getUserByPhoneNumber).not.toHaveBeenCalled();
  });

  it.each(disablingMutations)('beginRun refuses when %s', async (_label, mutate, expectedMessage) => {
    mutate();
    await expect(beginRun()).rejects.toThrow(expectedMessage);
    expect(mockFb.getUserByPhoneNumber).not.toHaveBeenCalled();
  });

  it.each(disablingMutations)(
    'purgeAccount refuses when %s, even with an already-begun run',
    async (_label, mutate, expectedMessage) => {
      await beginRun(); // succeeds under the clean default config
      jest.clearAllMocks();
      mutate();

      await expect(purgeAccount('+201234567891')).rejects.toThrow(expectedMessage);
      expect(mockFb.getUserByPhoneNumber).not.toHaveBeenCalled();
      expect(mockFb.deleteUser).not.toHaveBeenCalled();
    },
  );

  it.each(disablingMutations)(
    'completeReset refuses when %s, even with an already-begun run',
    async (_label, mutate, expectedMessage) => {
      await beginRun();
      jest.clearAllMocks();
      mutate();

      await expect(completeReset('sarah@example.com', 'NewPass123!')).rejects.toThrow(expectedMessage);
      expect(mockFb.getUserByEmail).not.toHaveBeenCalled();
      expect(mockFb.generatePasswordResetLink).not.toHaveBeenCalled();
    },
  );
});
