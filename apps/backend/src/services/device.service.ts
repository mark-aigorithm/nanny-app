import { type RegisterPushTokenRequest } from '@nanny-app/shared';
import { DevicePlatform, type User } from '@prisma/client';

import { prisma } from '@backend/db/prisma';
import type { DecodedIdToken } from '@backend/lib/firebase';
import { errors } from '@backend/lib/errors';

async function getUserByUid(uid: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { firebaseUid: uid } });
  if (!user || user.deletedAt) throw errors.unauthorized();
  return user;
}

function toPrismaPlatform(platform: 'ios' | 'android'): DevicePlatform {
  return platform === 'ios' ? DevicePlatform.IOS : DevicePlatform.ANDROID;
}

export async function registerPushToken(
  decoded: DecodedIdToken,
  body: RegisterPushTokenRequest,
): Promise<{ registered: true }> {
  const user = await getUserByUid(decoded.uid);

  await prisma.deviceToken.upsert({
    where: { token: body.token },
    create: {
      userId: user.id,
      token: body.token,
      platform: toPrismaPlatform(body.platform),
    },
    update: {
      userId: user.id,
      platform: toPrismaPlatform(body.platform),
      deletedAt: null,
    },
  });

  return { registered: true };
}

export async function removePushToken(
  decoded: DecodedIdToken,
  token: string,
): Promise<{ removed: true }> {
  const user = await getUserByUid(decoded.uid);

  await prisma.deviceToken.updateMany({
    where: { token, userId: user.id, deletedAt: null },
    data: { deletedAt: new Date() },
  });

  return { removed: true };
}
