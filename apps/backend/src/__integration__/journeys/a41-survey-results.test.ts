/**
 * A41 — reading the answers. Per question: option counts, yes/no counts, the
 * rating spread and average, and the text answers with who wrote them; per
 * mother: her status and her own answers.
 */
import type { AdminSurvey, SurveyResults } from '@nanny-app/shared';
import request from 'supertest';

import { app } from '@backend/app';

import { authHeader } from '../../../test/auth';
import { makeAdmin, makeMother, type TestUser } from '../../../test/factories';
import { createPublishedSurvey } from '../../../test/journeys/survey';

async function answer(mother: TestUser, survey: AdminSurvey, rating: number, optionIndex: number, yes: boolean, text?: string) {
  const [r, single, , yn, t] = survey.questions;
  await request(app)
    .post(`/surveys/${survey.id}/answers`)
    .set(...authHeader(mother.token))
    .send({
      answers: [
        { questionId: r!.id, rating },
        { questionId: single!.id, optionIds: [single!.options[optionIndex]!.id] },
        { questionId: yn!.id, bool: yes },
        ...(text ? [{ questionId: t!.id, text }] : []),
      ],
    })
    .expect(200);
}

describe('A41 — survey results', () => {
  it('aggregates every question type', async () => {
    const admin = await makeAdmin();
    const [a, b, c] = [await makeMother({ firstName: 'Ann' }), await makeMother(), await makeMother()];
    const survey = await createPublishedSurvey(admin.token, [a.id, b.id, c.id]);
    await answer(a, survey, 5, 0, true, 'Lovely nanny');
    await answer(b, survey, 2, 0, false);

    const res = await request(app).get(`/admin/surveys/${survey.id}/results`).set(...authHeader(admin.token));
    expect(res.status).toBe(200);
    const results = res.body.data as SurveyResults;
    expect(results.counts).toEqual({ recipients: 3, answered: 2, skipped: 0, pending: 1 });

    const [rating, single, multi, yesNo, text] = results.questions;
    expect(rating).toMatchObject({ answeredCount: 2, ratingCounts: [0, 1, 0, 0, 1], ratingAverage: 3.5 });
    expect(single!.options.map((o) => o.count)).toEqual([2, 0, 0]);
    expect(multi).toMatchObject({ answeredCount: 0 });
    expect(yesNo).toMatchObject({ yesCount: 1, noCount: 1 });
    expect(text).toMatchObject({ answeredCount: 1, ratingCounts: null, yesCount: null });

    const texts = await request(app)
      .get(`/admin/surveys/${survey.id}/text-answers`)
      .query({ questionId: text!.questionId })
      .set(...authHeader(admin.token));
    expect(texts.body.data).toEqual([expect.objectContaining({ userId: a.id, name: expect.stringContaining('Ann'), text: 'Lovely nanny' })]);
  });

  it('lists recipients by status and shows one mother her answers', async () => {
    const admin = await makeAdmin();
    const [a, b] = [await makeMother(), await makeMother()];
    const survey = await createPublishedSurvey(admin.token, [a.id, b.id]);
    await answer(a, survey, 4, 1, true);

    const pendingOnly = await request(app)
      .get(`/admin/surveys/${survey.id}/recipients`)
      .query({ status: 'PENDING' })
      .set(...authHeader(admin.token));
    expect(pendingOnly.body.data.map((r: { userId: number }) => r.userId)).toEqual([b.id]);
    expect(pendingOnly.body.meta.total).toBe(1);

    const mine = await request(app).get(`/admin/surveys/${survey.id}/recipients/${a.id}`).set(...authHeader(admin.token));
    expect(mine.body.data.recipient).toMatchObject({ userId: a.id, status: 'ANSWERED' });
    expect(mine.body.data.answers).toHaveLength(3);
    expect(mine.body.data.answers.find((x: { rating: number | null }) => x.rating !== null).rating).toBe(4);

    const stranger = await makeMother();
    expect((await request(app).get(`/admin/surveys/${survey.id}/recipients/${stranger.id}`).set(...authHeader(admin.token))).status).toBe(404);
  });
});
