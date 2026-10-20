
import type { SurveyTarget } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import {
  receivableMotherWhere as receivable,
  resolveGroupMembers,
} from '@backend/services/group-audience.service';
import { createInAppNotifications, dispatchPush } from '@backend/services/notification.service';

export const SURVEY_PUSH_TITLE = "We'd love your feedback";

/**
 * Pushes go out a few at a time inside the request: the backend runs on Vercel
 * with no background worker. Fine for hundreds of mothers; thousands need the
 * planned queue (see the spec's known limit).
 */
const PUSH_BATCH = 25;

/** The union of the target's mothers, deduplicated and sorted. */
export async function resolveSurveyAudience(target: SurveyTarget): Promise<number[]> {
  const groupIds = [...new Set(target.groupIds)];
  const userIds = [...new Set(target.userIds)];

  // Static and dynamic groups resolve through the shared resolver, so a survey
  // can go to "mothers who haven't opened the app in 30 days" too. Dynamic
  // groups are evaluated now, at publish.
  let groupMembers: number[] = [];
  if (groupIds.length > 0) {
    const resolved = await resolveGroupMembers(groupIds);
    if (resolved.skippedGroupIds.length > 0)
      throw errors.badRequest('One of the chosen groups no longer exists.');
    groupMembers = resolved.userIds;
  }
  if (userIds.length > 0) {
    const ok = await prisma.user.count({ where: { id: { in: userIds }, ...receivable } });
    if (ok !== userIds.length) {
      throw errors.badRequest(
        "Some of the chosen people can't receive surveys — only active mothers can.",
      );
    }
  }

  if (target.allMothers) {
    const rows = await prisma.user.findMany({
      where: receivable,
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    return rows.map((r) => r.id);
  }
  // Hand-picked ids were all checked receivable above; group members already are.
  return [...new Set([...userIds, ...groupMembers])].sort((a, b) => a - b);
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
      userIds
        .slice(i, i + PUSH_BATCH)
        .map((userId) =>
          dispatchPush(userId, { title: SURVEY_PUSH_TITLE, body: survey.title, data }),
        ),
    );
  }
}
