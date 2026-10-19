/**
 * A40 — chasing and closing. Resend reaches the chosen mothers, everyone who
 * skipped, or everyone who never responded; it puts them back to PENDING (so
 * the app prompts again), counts the send and notifies again — but never
 * touches a mother who already answered. Closing drops the survey from every
 * mother's list and refuses late answers and skips.
 */
import type { AdminSurvey } from '@nanny-app/shared';
import request from 'supertest';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';

import { authHeader } from '../../../test/auth';
import { makeAdmin, makeMother, type TestUser } from '../../../test/factories';
import { createPublishedSurvey } from '../../../test/journeys/survey';

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

const recipient = (surveyId: number, userId: number) =>
  prisma.surveyRecipient.findFirstOrThrow({ where: { surveyId, userId } });

/** A survey sent to three mothers: one answers, one skips, one stays silent. */
async function setup() {
  const admin = await makeAdmin();
  const [answered, skipped, silent] = [await makeMother(), await makeMother(), await makeMother()];
  const survey = await createPublishedSurvey(admin.token, [answered.id, skipped.id, silent.id]);
  await answer(answered, survey);
  await request(app).post(`/surveys/${survey.id}/skip`).set(...authHeader(skipped.token)).expect(200);
  return { admin, answered, skipped, silent, survey };
}

const resend = (token: string, surveyId: number, body: object) =>
  request(app).post(`/admin/surveys/${surveyId}/resend`).set(...authHeader(token)).send(body);

describe('A40 — resend and close', () => {
  it('resends to everyone who skipped', async () => {
    const { admin, skipped, silent, survey } = await setup();

    const res = await resend(admin.token, survey.id, { status: 'SKIPPED' });
    expect(res.body.data).toEqual({ count: 1 });
    expect(await recipient(survey.id, skipped.id)).toMatchObject({ status: 'PENDING', sentCount: 2 });
    expect(await recipient(survey.id, silent.id)).toMatchObject({ status: 'PENDING', sentCount: 1 });
  });

  it('resends to everyone who never responded', async () => {
    const { admin, silent, survey } = await setup();
    const res = await resend(admin.token, survey.id, { status: 'PENDING' });
    expect(res.body.data).toEqual({ count: 1 });
    expect(await recipient(survey.id, silent.id)).toMatchObject({ sentCount: 2 });
    expect(await prisma.notification.count({ where: { userId: silent.id, type: 'SURVEY' } })).toBe(2);
  });

  it('resend to selected skips answered mothers', async () => {
    const { admin, answered, skipped, survey } = await setup();
    const res = await resend(admin.token, survey.id, { userIds: [answered.id, skipped.id] });
    expect(res.body.data).toEqual({ count: 1 });
    expect(await recipient(survey.id, answered.id)).toMatchObject({ status: 'ANSWERED', sentCount: 1 });
    expect(await prisma.notification.count({ where: { userId: answered.id, type: 'SURVEY' } })).toBe(1);
  });

  it('closes: gone from her list, late answers and skips refused, resend refused', async () => {
    const { admin, silent, survey } = await setup();

    const closed = await request(app).post(`/admin/surveys/${survey.id}/close`).set(...authHeader(admin.token));
    expect(closed.status).toBe(200);
    expect(closed.body.data).toMatchObject({ status: 'CLOSED', counts: { answered: 1 } });

    const list = await request(app).get('/surveys/pending').set(...authHeader(silent.token));
    expect(list.body.data).toEqual([]);
    const late = await request(app).post(`/surveys/${survey.id}/skip`).set(...authHeader(silent.token));
    expect(late.status).toBe(409);
    expect(late.body.error).toBe('This survey has closed.');
    const [rating, single, , yesNo] = survey.questions;
    const lateAnswer = await request(app)
      .post(`/surveys/${survey.id}/answers`)
      .set(...authHeader(silent.token))
      .send({
        answers: [
          { questionId: rating!.id, rating: 4 },
          { questionId: single!.id, optionIds: [single!.options[0]!.id] },
          { questionId: yesNo!.id, bool: false },
        ],
      });
    expect(lateAnswer.status).toBe(409);
    expect((await resend(admin.token, survey.id, { status: 'PENDING' })).status).toBe(409);
    expect((await request(app).post(`/admin/surveys/${survey.id}/close`).set(...authHeader(admin.token))).status).toBe(409);
  });
});
