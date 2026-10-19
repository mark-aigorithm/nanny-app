/**
 * A39 — a mother answering. Her pending list holds PENDING and SKIPPED
 * surveys (skip only dismisses the prompt — she can still answer from her
 * profile). Answers are checked against each question's type, options and
 * required flag, and are final: a second submit is refused.
 */
import type { AdminSurvey } from '@nanny-app/shared';
import request from 'supertest';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';

import { authHeader } from '../../../test/auth';
import { makeAdmin, makeMother, makeNanny } from '../../../test/factories';
import { createDraft, createPublishedSurvey } from '../../../test/journeys/survey';

/** A valid answer set for SAMPLE_DRAFT: every required question, nothing optional. */
function validAnswers(survey: AdminSurvey) {
  const [rating, single, , yesNo] = survey.questions;
  return [
    { questionId: rating!.id, rating: 4 },
    { questionId: single!.id, optionIds: [single!.options[0]!.id] },
    { questionId: yesNo!.id, bool: true },
  ];
}

const pending = async (token: string) =>
  (await request(app).get('/surveys/pending').set(...authHeader(token))).body.data as Array<{ id: number; status: string }>;

describe('A39 — answering a survey', () => {
  it('lists, skips (still listed), then answers from the list (no longer listed)', async () => {
    const admin = await makeAdmin();
    const mother = await makeMother();
    const survey = await createPublishedSurvey(admin.token, [mother.id]);

    expect(await pending(mother.token)).toEqual([expect.objectContaining({ id: survey.id, status: 'PENDING', questionCount: 5 })]);

    const skip = await request(app).post(`/surveys/${survey.id}/skip`).set(...authHeader(mother.token));
    expect(skip.status).toBe(200);
    expect(await pending(mother.token)).toEqual([expect.objectContaining({ id: survey.id, status: 'SKIPPED' })]);

    const view = await request(app).get(`/surveys/${survey.id}`).set(...authHeader(mother.token));
    expect(view.status).toBe(200);
    expect(view.body.data.questions).toHaveLength(5);

    const submit = await request(app)
      .post(`/surveys/${survey.id}/answers`)
      .set(...authHeader(mother.token))
      .send({ answers: validAnswers(survey) });
    expect(submit.status).toBe(200);
    expect(await pending(mother.token)).toEqual([]);

    const recipient = await prisma.surveyRecipient.findFirstOrThrow({ where: { surveyId: survey.id } });
    expect(recipient.status).toBe('ANSWERED');
    expect(recipient.answeredAt).not.toBeNull();
  });

  it('refuses a missing required answer and an option from another question', async () => {
    const admin = await makeAdmin();
    const mother = await makeMother();
    const survey = await createPublishedSurvey(admin.token, [mother.id]);
    const path = `/surveys/${survey.id}/answers`;

    const missing = await request(app).post(path).set(...authHeader(mother.token)).send({ answers: validAnswers(survey).slice(1) });
    expect(missing.status).toBe(400);
    expect(missing.body.error).toBe('"Rate your last nanny" is required.');

    const answers = validAnswers(survey);
    answers[1] = { questionId: survey.questions[1]!.id, optionIds: [survey.questions[2]!.options[0]!.id] };
    expect((await request(app).post(path).set(...authHeader(mother.token)).send({ answers })).status).toBe(400);
  });

  it('a second submission is refused and answers are not duplicated', async () => {
    const admin = await makeAdmin();
    const mother = await makeMother();
    const survey = await createPublishedSurvey(admin.token, [mother.id]);
    const path = `/surveys/${survey.id}/answers`;

    const [first, second] = await Promise.all([
      request(app).post(path).set(...authHeader(mother.token)).send({ answers: validAnswers(survey) }),
      request(app).post(path).set(...authHeader(mother.token)).send({ answers: validAnswers(survey) }),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect(await prisma.surveyAnswer.count({ where: { recipient: { surveyId: survey.id } } })).toBe(3);

    const skipAfter = await request(app).post(`/surveys/${survey.id}/skip`).set(...authHeader(mother.token));
    expect(skipAfter.status).toBe(409);
  });

  it('a skip racing a submit never undoes the answer', async () => {
    const admin = await makeAdmin();
    const mother = await makeMother();
    const survey = await createPublishedSurvey(admin.token, [mother.id]);

    const [skip, submit] = await Promise.all([
      request(app).post(`/surveys/${survey.id}/skip`).set(...authHeader(mother.token)),
      request(app).post(`/surveys/${survey.id}/answers`).set(...authHeader(mother.token)).send({ answers: validAnswers(survey) }),
    ]);
    expect([200, 409]).toContain(skip.status);
    expect(submit.status).toBe(200);
    const recipient = await prisma.surveyRecipient.findFirstOrThrow({ where: { surveyId: survey.id } });
    expect(recipient.status).toBe('ANSWERED');
    expect(await prisma.surveyAnswer.count({ where: { recipient: { surveyId: survey.id } } })).toBe(3);
  });

  it('stores only answered optional questions and the chosen options', async () => {
    const admin = await makeAdmin();
    const mother = await makeMother();
    const survey = await createPublishedSurvey(admin.token, [mother.id]);
    const multi = survey.questions[2]!;
    const text = survey.questions[4]!;

    await request(app)
      .post(`/surveys/${survey.id}/answers`)
      .set(...authHeader(mother.token))
      .send({
        answers: [
          ...validAnswers(survey),
          { questionId: multi.id, optionIds: [multi.options[0]!.id, multi.options[2]!.id] },
          { questionId: text.id, text: '   ' },
        ],
      })
      .expect(200);

    const stored = await prisma.surveyAnswer.findMany({
      where: { recipient: { surveyId: survey.id } },
      include: { options: true },
    });
    expect(stored).toHaveLength(4);
    expect(stored.find((a) => a.questionId === multi.id)!.options).toHaveLength(2);
  });

  it('hides surveys she was not sent, drafts, and refuses nannies', async () => {
    const admin = await makeAdmin();
    const [mother, other] = [await makeMother(), await makeMother()];
    const nanny = await makeNanny();
    const survey = await createPublishedSurvey(admin.token, [other.id]);
    const draft = await createDraft(admin.token);

    expect((await request(app).get(`/surveys/${survey.id}`).set(...authHeader(mother.token))).status).toBe(404);
    expect((await request(app).get(`/surveys/${draft.id}`).set(...authHeader(mother.token))).status).toBe(404);
    expect(await pending(mother.token)).toEqual([]);
    expect((await request(app).get('/surveys/pending').set(...authHeader(nanny.token))).status).toBe(403);
  });
});
