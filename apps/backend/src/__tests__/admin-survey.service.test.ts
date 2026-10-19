jest.mock('@backend/db/prisma', () => ({
  prisma: {
    survey: { findFirst: jest.fn() },
    surveyRecipient: { findMany: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));
jest.mock('@backend/services/survey-audience.service', () => ({
  notifySurveyRecipients: jest.fn(),
  resolveSurveyAudience: jest.fn(),
}));

import { prisma } from '@backend/db/prisma';
import { resendSurvey } from '@backend/services/admin-survey.service';
import { notifySurveyRecipients } from '@backend/services/survey-audience.service';

const mockPrisma = prisma as unknown as {
  survey: { findFirst: jest.Mock };
  surveyRecipient: { findMany: jest.Mock; updateMany: jest.Mock };
  $transaction: jest.Mock;
};

const QUICK = 11;
const SILENT = 12;

/** What a transaction sees once `QUICK` has answered: only `SILENT` was reset. */
const tx = {
  surveyRecipient: {
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    findMany: jest.fn().mockResolvedValue([{ userId: SILENT }]),
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.survey.findFirst.mockResolvedValue({ id: 5, title: 'Q', status: 'PUBLISHED', questions: [] });
  // A read outside the write still sees both mothers as no response.
  mockPrisma.surveyRecipient.findMany.mockResolvedValue([
    { id: 1, userId: QUICK },
    { id: 2, userId: SILENT },
  ]);
  mockPrisma.surveyRecipient.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === 'function' ? (arg as (t: typeof tx) => unknown)(tx) : Promise.all(arg as unknown[]),
  );
});

describe('resendSurvey', () => {
  it('counts and notifies only the mothers its write reset, not one who answered under it', async () => {
    const result = await resendSurvey(5, { status: 'PENDING' });

    expect(result).toEqual({ count: 1 });
    expect(notifySurveyRecipients).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }), [SILENT]);
  });

  it('never resets a recipient whose account was deleted', async () => {
    await resendSurvey(5, { userIds: [QUICK, SILENT] });

    expect(tx.surveyRecipient.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          user: { deletedAt: null },
          userId: { in: [QUICK, SILENT] },
          status: { not: 'ANSWERED' },
        }),
      }),
    );
  });
});
