/**
 * Guard tests for the live-Firebase E2E harness.
 *
 * These operations run against the project that also serves production, so
 * every path here proves a refusal happens *before* any Firebase or Prisma
 * call that could touch a real account — for the allowlist itself, and for
 * the run-baseline (`beginRun`) that gates deletion on top of it.
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
});

describe('purgeAccount run-baseline gate', () => {
  it('refuses before beginRun, and succeeds once a clean run has begun', async () => {
    await expect(purgeAccount('+201234567891')).rejects.toThrow(/begin/i);
    expect(mockFb.deleteUser).not.toHaveBeenCalled();

    await beginRun();

    // Simulate an account created during this run — the very next
    // getUserByPhoneNumber call (inside purgeAccount's own describeAccount)
    // reports it; everything after falls back to the "not found" default.
    mockFb.getUserByPhoneNumber.mockResolvedValueOnce({
      uid: 'uid-created-this-run',
      email: null,
      providerData: [],
    });

    const result = await purgeAccount('+201234567891');

    expect(mockFb.deleteUser).toHaveBeenCalledWith('uid-created-this-run');
    expect(result.firebaseExists).toBe(false);
  });
});

describe('completeReset', () => {
  it.each([['+201288719791'], [undefined]])(
    'refuses without calling generatePasswordResetLink when the live account phone is %s',
    async (phone) => {
      await beginRun();
      mockFb.getUserByEmail.mockResolvedValue({ phoneNumber: phone });

      await expect(completeReset('someone@example.com', 'NewPass123!')).rejects.toThrow(
        'not a reserved test number',
      );
      expect(mockFb.generatePasswordResetLink).not.toHaveBeenCalled();
    },
  );

  it('turns a missing Firebase account into a 404-shaped error, without calling generatePasswordResetLink', async () => {
    await beginRun();
    mockFb.getUserByEmail.mockRejectedValue(NOT_FOUND);

    await expect(completeReset('ghost@example.com', 'NewPass123!')).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(mockFb.generatePasswordResetLink).not.toHaveBeenCalled();
  });

  it('refuses before beginRun', async () => {
    mockFb.getUserByEmail.mockResolvedValue({ phoneNumber: '+201234567891' });

    await expect(completeReset('sarah@example.com', 'NewPass123!')).rejects.toThrow(/begin/i);
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

  it('spends the oobCode over the Identity Toolkit REST API once the live account is a reserved number', async () => {
    await beginRun();
    mockFb.getUserByEmail.mockResolvedValue({ phoneNumber: '+201234567891' });
    mockFb.generatePasswordResetLink.mockResolvedValue(
      'https://example.com/reset?oobCode=abc123&mode=resetPassword',
    );
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' });
    (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    await completeReset('sarah@example.com', 'NewPass123!');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('identitytoolkit.googleapis.com'),
      expect.objectContaining({ method: 'POST', body: expect.stringContaining('abc123') }),
    );
  });
});

describe('assertEnabled guards every operation', () => {
  const disablingMutations: Array<[string, () => void]> = [
    [
      'the flag is off',
      () => {
        mockConfig.e2eLiveAuthEnabled = false;
      },
    ],
    [
      'nodeEnv is production',
      () => {
        mockConfig.nodeEnv = 'production';
      },
    ],
    [
      'the database is not nannyapp_test',
      () => {
        mockConfig.databaseUrl = 'postgresql://user:pass@localhost:5432/nannyapp_dev';
      },
    ],
  ];

  it.each(disablingMutations)('describeAccount refuses when %s', async (_label, mutate) => {
    mutate();
    await expect(describeAccount('+201234567891')).rejects.toThrow();
    expect(mockFb.getUserByPhoneNumber).not.toHaveBeenCalled();
  });

  it.each(disablingMutations)('beginRun refuses when %s', async (_label, mutate) => {
    mutate();
    await expect(beginRun()).rejects.toThrow();
    expect(mockFb.getUserByPhoneNumber).not.toHaveBeenCalled();
  });

  it.each(disablingMutations)('purgeAccount refuses when %s', async (_label, mutate) => {
    mutate();
    await expect(purgeAccount('+201234567891')).rejects.toThrow();
    expect(mockFb.deleteUser).not.toHaveBeenCalled();
  });

  it.each(disablingMutations)('completeReset refuses when %s', async (_label, mutate) => {
    mutate();
    await expect(completeReset('sarah@example.com', 'NewPass123!')).rejects.toThrow();
    expect(mockFb.generatePasswordResetLink).not.toHaveBeenCalled();
  });
});
