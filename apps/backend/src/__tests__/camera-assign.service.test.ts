jest.mock('@backend/db/prisma', () => ({
  prisma: {
    nannyProfile: { findFirst: jest.fn() },
    camera: { findFirst: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import { prisma } from '@backend/db/prisma';
import { assignNannyCamera } from '@backend/services/camera.service';

const mockPrisma = prisma as unknown as {
  nannyProfile: { findFirst: jest.Mock };
  camera: { findFirst: jest.Mock; updateMany: jest.Mock };
  $transaction: jest.Mock;
};

const NANNY_PROFILE_ID = 3;
const NANNY_USER_ID = 40;

function approvedNanny(approvalStatus = 'APPROVED') {
  return { userId: NANNY_USER_ID, user: { approvalStatus } };
}

beforeEach(() => {
  jest.clearAllMocks();
  // The interactive transaction runs against the same mocked client.
  mockPrisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => Promise<unknown>) =>
    fn(prisma),
  );
  mockPrisma.nannyProfile.findFirst.mockResolvedValue(approvedNanny());
  mockPrisma.camera.findFirst.mockResolvedValue({ id: 7, name: 'Living room' });
  mockPrisma.camera.updateMany.mockResolvedValue({ count: 1 });
});

describe('assignNannyCamera', () => {
  it('claims the camera only while it is free, then returns her other cameras to the pool', async () => {
    const camera = await assignNannyCamera(NANNY_PROFILE_ID, 7);

    expect(camera).toEqual({ id: 7, name: 'Living room' });
    expect(mockPrisma.camera.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: 7,
        deletedAt: null,
        OR: [{ nannyUserId: null }, { nannyUserId: NANNY_USER_ID }],
      },
      data: { nannyUserId: NANNY_USER_ID },
    });
    expect(mockPrisma.camera.updateMany).toHaveBeenNthCalledWith(2, {
      where: { nannyUserId: NANNY_USER_ID, deletedAt: null, id: { not: 7 } },
      data: { nannyUserId: null },
    });
  });

  it('refuses a camera another nanny already has, releasing nothing', async () => {
    mockPrisma.camera.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(assignNannyCamera(NANNY_PROFILE_ID, 7)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(mockPrisma.camera.updateMany).toHaveBeenCalledTimes(1);
  });

  it('unassigns every camera she holds when given null', async () => {
    const camera = await assignNannyCamera(NANNY_PROFILE_ID, null);

    expect(camera).toBeNull();
    expect(mockPrisma.camera.updateMany).toHaveBeenCalledWith({
      where: { nannyUserId: NANNY_USER_ID, deletedAt: null },
      data: { nannyUserId: null },
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('lets a nanny who is not approved lose a camera but not gain one', async () => {
    mockPrisma.nannyProfile.findFirst.mockResolvedValue(approvedNanny('PENDING_REVIEW'));

    await expect(assignNannyCamera(NANNY_PROFILE_ID, 7)).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(assignNannyCamera(NANNY_PROFILE_ID, null)).resolves.toBeNull();
  });

  it('404s for a missing nanny or camera', async () => {
    mockPrisma.camera.findFirst.mockResolvedValueOnce(null);
    await expect(assignNannyCamera(NANNY_PROFILE_ID, 99)).rejects.toMatchObject({ statusCode: 404 });

    mockPrisma.nannyProfile.findFirst.mockResolvedValueOnce(null);
    await expect(assignNannyCamera(99, 7)).rejects.toMatchObject({ statusCode: 404 });
    expect(mockPrisma.camera.updateMany).not.toHaveBeenCalled();
  });
});
