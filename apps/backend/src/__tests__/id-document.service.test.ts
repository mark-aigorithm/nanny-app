jest.mock('@backend/db/prisma', () => ({
  prisma: { user: { update: jest.fn() } },
}));
jest.mock('@backend/services/notification.service', () => ({
  createInAppNotification: jest.fn().mockResolvedValue({}),
  dispatchPush: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@backend/lib/storage', () => ({
  deleteStorageObjectByUrl: jest.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@backend/db/prisma';
import { deleteStorageObjectByUrl } from '@backend/lib/storage';
import { createInAppNotification, dispatchPush } from '@backend/services/notification.service';
import { invalidateIdDocument } from '@backend/services/id-document.service';

const mockUpdate = prisma.user.update as jest.Mock;
const FRONT = 'https://storage.example/nanny-ids/u1/front.jpg';
const BACK = 'https://storage.example/nanny-ids/u1/back.jpg';
const holder = { id: 7, idDocumentFrontUrl: FRONT, idDocumentBackUrl: BACK };

beforeEach(() => jest.clearAllMocks());

describe('invalidateIdDocument', () => {
  it('sends the user back to PENDING_ID with the ID cleared and the reason kept', async () => {
    await invalidateIdDocument(holder, { reason: 'Photo is blurry' }, 'NANNY');

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 7 },
      data: {
        approvalStatus: 'PENDING_ID',
        reviewedAt: expect.any(Date),
        rejectionReason: 'Photo is blurry',
        idDocumentType: null,
        idDocumentFrontUrl: null,
        idDocumentBackUrl: null,
      },
    });
    expect(deleteStorageObjectByUrl).toHaveBeenCalledWith(FRONT);
    expect(deleteStorageObjectByUrl).toHaveBeenCalledWith(BACK);
  });

  it('tells a nanny why, and what she needs to do', async () => {
    await invalidateIdDocument(holder, { reason: 'Photo is blurry' }, 'NANNY');

    const body =
      "Your ID couldn't be verified: Photo is blurry. Please upload a new one to keep receiving bookings.";
    expect(createInAppNotification).toHaveBeenCalledWith({
      userId: 7,
      type: 'NANNY_REJECTED',
      title: 'Please upload your ID again',
      body,
    });
    expect(dispatchPush).toHaveBeenCalledWith(7, {
      title: 'Please upload your ID again',
      body,
      data: { type: 'id_reupload_requested', title: 'Please upload your ID again' },
    });
  });

  it('words a mother notice without a reason around her next booking', async () => {
    await invalidateIdDocument(holder, {}, 'MOTHER');

    expect(createInAppNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "Your ID couldn't be verified. Please upload a new one before your next booking.",
      }),
    );
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ rejectionReason: null }) }),
    );
  });

  it('refuses when there is no ID on file', async () => {
    await expect(
      invalidateIdDocument({ id: 7, idDocumentFrontUrl: null, idDocumentBackUrl: null }, {}, 'NANNY'),
    ).rejects.toMatchObject({ statusCode: 400, message: 'There is no ID on file to invalidate.' });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(createInAppNotification).not.toHaveBeenCalled();
  });
});
