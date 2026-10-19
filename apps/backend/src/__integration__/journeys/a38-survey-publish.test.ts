/**
 * A38 — sending a survey. Publishing locks the draft and turns the union of
 * "all mothers", groups and hand-picked mothers into one PENDING recipient per
 * mother, each with an in-app notification. The list is frozen: "add
 * recipients" sends to new mothers only. Nannies, suspended or deleted mothers
 * and deleted groups never receive one.
 */
import request from 'supertest';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';

import { authHeader } from '../../../test/auth';
import { makeAdmin, makeMother, makeNanny } from '../../../test/factories';
import { createDraft, publish } from '../../../test/journeys/survey';

const surveyNotifications = (surveyId: number) =>
  prisma.notification.count({ where: { type: 'SURVEY', referenceId: surveyId } });

async function makeGroup(token: string, userIds: number[]): Promise<number> {
  const group = await request(app).post('/admin/groups').set(...authHeader(token)).send({ name: `G${Date.now()}` });
  await request(app).post(`/admin/groups/${group.body.data.id}/members`).set(...authHeader(token)).send({ userIds });
  return group.body.data.id as number;
}

describe('A38 — publishing a survey', () => {
  it('sends to the union of a group and individuals, once per mother', async () => {
    const admin = await makeAdmin();
    const [a, b, c] = [await makeMother(), await makeMother(), await makeMother()];
    const groupId = await makeGroup(admin.token, [a.id, b.id]);
    const survey = await createDraft(admin.token);

    expect(await publish(admin.token, survey.id, { groupIds: [groupId], userIds: [b.id, c.id] })).toBe(3);

    const fetched = await request(app).get(`/admin/surveys/${survey.id}`).set(...authHeader(admin.token));
    expect(fetched.body.data).toMatchObject({ status: 'PUBLISHED', counts: { recipients: 3, pending: 3 } });
    expect(fetched.body.data.publishedAt).not.toBeNull();
    expect(await surveyNotifications(survey.id)).toBe(3);
  });

  it('sends "all mothers" to active mothers only — no nannies, suspended or deleted', async () => {
    const admin = await makeAdmin();
    const active = await makeMother();
    await makeMother({ isActive: false });
    await makeMother({ deletedAt: new Date() });
    await makeNanny();
    const survey = await createDraft(admin.token);

    expect(await publish(admin.token, survey.id, { allMothers: true })).toBe(1);
    const rows = await prisma.surveyRecipient.findMany({ where: { surveyId: survey.id } });
    expect(rows.map((r) => r.userId)).toEqual([active.id]);
  });

  it('refuses a nanny picked by id, a deleted group, and an empty survey', async () => {
    const admin = await makeAdmin();
    const nanny = await makeNanny();
    const mother = await makeMother();
    const survey = await createDraft(admin.token);
    const path = `/admin/surveys/${survey.id}/publish`;

    expect((await request(app).post(path).set(...authHeader(admin.token)).send({ userIds: [nanny.id] })).status).toBe(400);

    const groupId = await makeGroup(admin.token, [mother.id]);
    await request(app).delete(`/admin/groups/${groupId}`).set(...authHeader(admin.token));
    expect((await request(app).post(path).set(...authHeader(admin.token)).send({ groupIds: [groupId] })).status).toBe(400);

    const empty = await createDraft(admin.token, { title: 'Empty' });
    const res = await request(app)
      .post(`/admin/surveys/${empty.id}/publish`)
      .set(...authHeader(admin.token))
      .send({ userIds: [mother.id] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least one question/i);
  });

  it('publishing twice is refused and sends nothing more', async () => {
    const admin = await makeAdmin();
    const mother = await makeMother();
    const survey = await createDraft(admin.token);
    await publish(admin.token, survey.id, { userIds: [mother.id] });

    const again = await request(app)
      .post(`/admin/surveys/${survey.id}/publish`)
      .set(...authHeader(admin.token))
      .send({ userIds: [mother.id] });
    expect(again.status).toBe(409);
    expect(await surveyNotifications(survey.id)).toBe(1);
  });

  it('locks the survey: no edit or delete after publishing', async () => {
    const admin = await makeAdmin();
    const mother = await makeMother();
    const survey = await createDraft(admin.token);
    await publish(admin.token, survey.id, { userIds: [mother.id] });

    const edit = await request(app).patch(`/admin/surveys/${survey.id}`).set(...authHeader(admin.token)).send({ title: 'x' });
    expect(edit.status).toBe(409);
    expect((await request(app).delete(`/admin/surveys/${survey.id}`).set(...authHeader(admin.token))).status).toBe(409);
  });

  it('adds recipients to a published survey, skipping mothers already on it', async () => {
    const admin = await makeAdmin();
    const [a, b] = [await makeMother(), await makeMother()];
    const survey = await createDraft(admin.token);

    const early = await request(app)
      .post(`/admin/surveys/${survey.id}/recipients`)
      .set(...authHeader(admin.token))
      .send({ userIds: [a.id] });
    expect(early.status).toBe(409);

    await publish(admin.token, survey.id, { userIds: [a.id] });
    const added = await request(app)
      .post(`/admin/surveys/${survey.id}/recipients`)
      .set(...authHeader(admin.token))
      .send({ userIds: [a.id, b.id] });
    expect(added.body.data).toEqual({ count: 1 });
    expect(await surveyNotifications(survey.id)).toBe(2);
  });
});
