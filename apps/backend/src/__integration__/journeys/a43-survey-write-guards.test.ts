/**
 * A43 — writes that race another admin, and recipients whose account is gone.
 *
 * Every write re-checks the survey's status inside its own guarded write, so a
 * read that went stale (another admin published or closed in between) ends in
 * a 409 instead of changing a survey that is no longer in that state. The race
 * is made deterministic by letting the real read run and then moving the row
 * on before the service writes. (Resend's version of this race is unit-tested
 * in admin-survey.service.test.ts: its read and write share one transaction,
 * so there is no gap here to step into.)
 *
 * A mother whose account was deleted after the send no longer counts as
 * "skipped" or "no response", and is never a resend target.
 */
import type { AdminSurvey } from '@nanny-app/shared';
import request from 'supertest';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';

import { authHeader } from '../../../test/auth';
import { makeAdmin, makeMother, type TestUser } from '../../../test/factories';
import { createDraft, createPublishedSurvey } from '../../../test/journeys/survey';

/** After the service's next survey read, run `change` as a concurrent admin would. */
function afterNextSurveyRead(change: () => Promise<unknown>): void {
  const real = prisma.survey.findFirst.bind(prisma.survey);
  jest.spyOn(prisma.survey, 'findFirst').mockImplementationOnce((async (args: Parameters<typeof real>[0]) => {
    const row = await real(args);
    await change();
    return row;
  }) as unknown as typeof prisma.survey.findFirst);
}

const publishBehindItsBack = (id: number) => () =>
  prisma.survey.update({ where: { id }, data: { status: 'PUBLISHED', publishedAt: new Date() } });

const liveQuestions = (surveyId: number) =>
  prisma.surveyQuestion.findMany({ where: { surveyId, deletedAt: null }, orderBy: { order: 'asc' } });

async function answer(mother: TestUser, survey: AdminSurvey) {
  const [rating, single, , yesNo] = survey.questions;
  await request(app)
    .post(`/surveys/${survey.id}/answers`)
    .set(...authHeader(mother.token))
    .send({
      answers: [
        { questionId: rating!.id, rating: 5 },
        { questionId: single!.id, optionIds: [single!.options[0]!.id] },
        { questionId: yesNo!.id, bool: true },
      ],
    })
    .expect(200);
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('A43 — status guards inside the write', () => {
  it('an edit that loses to a publish is refused and leaves the questions alone', async () => {
    const admin = await makeAdmin();
    const survey = await createDraft(admin.token);
    afterNextSurveyRead(publishBehindItsBack(survey.id));

    const res = await request(app)
      .patch(`/admin/surveys/${survey.id}`)
      .set(...authHeader(admin.token))
      .send({ title: 'Renamed', questions: [{ type: 'YES_NO', prompt: 'Only one?' }] });
    expect(res.status).toBe(409);

    expect((await liveQuestions(survey.id)).map((q) => q.id)).toEqual(survey.questions.map((q) => q.id));
    expect(await prisma.survey.findUniqueOrThrow({ where: { id: survey.id } })).toMatchObject({
      title: survey.title,
      status: 'PUBLISHED',
    });
  });

  it('a delete that loses to a publish is refused and the survey stays', async () => {
    const admin = await makeAdmin();
    const survey = await createDraft(admin.token);
    afterNextSurveyRead(publishBehindItsBack(survey.id));

    const res = await request(app).delete(`/admin/surveys/${survey.id}`).set(...authHeader(admin.token));
    expect(res.status).toBe(409);
    expect(await prisma.survey.findUniqueOrThrow({ where: { id: survey.id } })).toMatchObject({ deletedAt: null });
  });

  it('a close that loses to another close is refused and keeps the first closedAt', async () => {
    const admin = await makeAdmin();
    const mother = await makeMother();
    const survey = await createPublishedSurvey(admin.token, [mother.id]);
    const firstClose = new Date('2026-01-01T00:00:00Z');
    afterNextSurveyRead(() =>
      prisma.survey.update({ where: { id: survey.id }, data: { status: 'CLOSED', closedAt: firstClose } }),
    );

    const res = await request(app).post(`/admin/surveys/${survey.id}/close`).set(...authHeader(admin.token));
    expect(res.status).toBe(409);
    expect((await prisma.survey.findUniqueOrThrow({ where: { id: survey.id } })).closedAt).toEqual(firstClose);
  });
});

describe('A43 — recipients whose account was deleted', () => {
  it('are not counted as skipped or no response, and are never resent', async () => {
    const admin = await makeAdmin();
    const [answered, skipped, silent] = [await makeMother(), await makeMother(), await makeMother()];
    const survey = await createPublishedSurvey(admin.token, [answered.id, skipped.id, silent.id]);
    await answer(answered, survey);
    await request(app).post(`/surveys/${survey.id}/skip`).set(...authHeader(skipped.token)).expect(200);
    await prisma.user.updateMany({
      where: { id: { in: [answered.id, skipped.id, silent.id] } },
      data: { deletedAt: new Date() },
    });

    const detail = await request(app).get(`/admin/surveys/${survey.id}`).set(...authHeader(admin.token));
    // Her answers stay part of the results; only the chase-able statuses drop her.
    expect(detail.body.data.counts).toEqual({ recipients: 1, answered: 1, skipped: 0, pending: 0 });

    const noResponse = await request(app)
      .get(`/admin/surveys/${survey.id}/recipients`)
      .query({ status: 'PENDING' })
      .set(...authHeader(admin.token));
    expect(noResponse.body.data).toEqual([]);

    for (const body of [{ status: 'PENDING' }, { status: 'SKIPPED' }, { userIds: [skipped.id, silent.id] }]) {
      const res = await request(app).post(`/admin/surveys/${survey.id}/resend`).set(...authHeader(admin.token)).send(body);
      expect(res.body.data).toEqual({ count: 0 });
    }
    expect(await prisma.notification.count({ where: { userId: silent.id, type: 'SURVEY' } })).toBe(1);
  });
});
