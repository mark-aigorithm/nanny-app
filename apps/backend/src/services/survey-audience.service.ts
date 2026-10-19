import { Role, type Prisma } from '@prisma/client';

import type { SurveyTarget } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import { createInAppNotifications, dispatchPush } from '@backend/services/notification.service';

export const SURVEY_PUSH_TITLE = "We'd love your feedback";

/**
 * Pushes go out a few at a time inside the request: the backend runs on Vercel
 * with no background worker. Fine for hundreds of mothers; thousands need the
 * planned queue (see the spec's known limit).
 */
const PUSH_BATCH = 25;

/** A mother who can receive a survey. */
const receivable: Prisma.UserWhereInput = { role: Role.MOTHER, deletedAt: null, isActive: true };

/** The union of the target's mothers, deduplicated and sorted. */
export async function resolveSurveyAudience(target: SurveyTarget): Promise<number[]> {
  const groupIds = [...new Set(target.groupIds)];
  const userIds = [...new Set(target.userIds)];

  if (groupIds.length > 0) {
    const live = await prisma.userGroup.count({ where: { id: { in: groupIds }, deletedAt: null } });
    if (live !== groupIds.length) throw errors.badRequest('One of the chosen groups no longer exists.');
  }
  if (userIds.length > 0) {
    const ok = await prisma.user.count({ where: { id: { in: userIds }, ...receivable } });
    if (ok !== userIds.length) {
      throw errors.badRequest("Some of the chosen people can't receive surveys — only active mothers can.");
    }
  }

  const where: Prisma.UserWhereInput = target.allMothers
    ? receivable
    : {
        ...receivable,
        OR: [
          { id: { in: userIds } },
          {
            userGroupMemberships: {
              some: { groupId: { in: groupIds }, deletedAt: null, group: { deletedAt: null } },
            },
          },
        ],
      };
  const rows = await prisma.user.findMany({ where, select: { id: true }, orderBy: { id: 'asc' } });
  return rows.map((r) => r.id);
}

/** In-app notification for every recipient, then a push each, in batches. */
export async function notifySurveyRecipients(
  survey: { id: number; title: string },
  userIds: number[],
): Promise<void> {
  if (userIds.length === 0) return;
  await createInAppNotifications(
    userIds.map((userId) => ({
      userId,
      type: 'SURVEY',
      title: SURVEY_PUSH_TITLE,
      body: survey.title,
      referenceId: survey.id,
      referenceType: 'SURVEY',
    })),
  );
  const data = { type: 'SURVEY', surveyId: String(survey.id) };
  for (let i = 0; i < userIds.length; i += PUSH_BATCH) {
    await Promise.all(
      userIds.slice(i, i + PUSH_BATCH).map((userId) =>
        dispatchPush(userId, { title: SURVEY_PUSH_TITLE, body: survey.title, data }),
      ),
    );
  }
}
