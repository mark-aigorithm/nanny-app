/**
 * A37 — writing a survey. A draft is freely editable (PATCH replaces every
 * question), deletable, and listed with zero counts; duplicating copies the
 * questions into a new draft.
 */
import request from 'supertest';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';

import { authHeader } from '../../../test/auth';
import { makeAdmin, makeMother } from '../../../test/factories';
import { SAMPLE_DRAFT, createDraft, publish } from '../../../test/journeys/survey';

describe('A37 — survey drafts', () => {
  it('creates a draft with ordered questions and options', async () => {
    const admin = await makeAdmin();
    const survey = await createDraft(admin.token);

    expect(survey).toMatchObject({
      status: 'DRAFT',
      title: 'How are we doing?',
      counts: { recipients: 0, answered: 0, skipped: 0, pending: 0 },
      publishedAt: null,
    });
    expect(survey.questions.map((q) => [q.order, q.type])).toEqual([
      [0, 'RATING'], [1, 'SINGLE_CHOICE'], [2, 'MULTI_CHOICE'], [3, 'YES_NO'], [4, 'TEXT'],
    ]);
    expect(survey.questions[1]!.options.map((o) => o.label)).toEqual(['Friend', 'Instagram', 'Search']);
  });

  it('replaces every question on PATCH', async () => {
    const admin = await makeAdmin();
    const survey = await createDraft(admin.token);

    const res = await request(app)
      .patch(`/admin/surveys/${survey.id}`)
      .set(...authHeader(admin.token))
      .send({ title: 'Renamed', questions: [{ type: 'YES_NO', prompt: 'Only one?' }] });
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Renamed');
    expect(res.body.data.questions.map((q: { prompt: string }) => q.prompt)).toEqual(['Only one?']);

    const fetched = await request(app).get(`/admin/surveys/${survey.id}`).set(...authHeader(admin.token));
    expect(fetched.body.data.questions).toHaveLength(1);
  });

  it('lists drafts, filters by status, and deletes', async () => {
    const admin = await makeAdmin();
    const survey = await createDraft(admin.token);

    const list = await request(app).get('/admin/surveys').query({ status: 'DRAFT' }).set(...authHeader(admin.token));
    expect(list.body.data.map((s: { id: number }) => s.id)).toEqual([survey.id]);
    expect(list.body.meta.total).toBe(1);
    const published = await request(app).get('/admin/surveys').query({ status: 'PUBLISHED' }).set(...authHeader(admin.token));
    expect(published.body.data).toEqual([]);

    expect((await request(app).delete(`/admin/surveys/${survey.id}`).set(...authHeader(admin.token))).status).toBe(200);
    expect((await request(app).get(`/admin/surveys/${survey.id}`).set(...authHeader(admin.token))).status).toBe(404);
  });

  it('sorts the list on the server, including by sent-to and response rate', async () => {
    const admin = await makeAdmin();
    const [a, b, c] = [await makeMother(), await makeMother(), await makeMother()];
    const zebra = await createDraft(admin.token, { ...SAMPLE_DRAFT, title: 'Zebra' });
    const apple = await createDraft(admin.token, { ...SAMPLE_DRAFT, title: 'apple' });
    const mango = await createDraft(admin.token, { ...SAMPLE_DRAFT, title: 'Mango' });
    await publish(admin.token, apple.id, { userIds: [a.id] });
    await publish(admin.token, mango.id, { userIds: [a.id, b.id, c.id] });
    // Apple's one mother answered (100%); nobody answered Mango (0%).
    await prisma.surveyRecipient.updateMany({ where: { surveyId: apple.id }, data: { status: 'ANSWERED', answeredAt: new Date() } });

    const ids = async (query: Record<string, string>) => {
      const res = await request(app).get('/admin/surveys').query(query).set(...authHeader(admin.token));
      expect(res.status).toBe(200);
      return (res.body.data as { id: number }[]).map((s) => s.id);
    };
    // Default: newest first.
    expect(await ids({})).toEqual([mango.id, apple.id, zebra.id]);
    // Case-blind title order.
    expect(await ids({ sortBy: 'title', sortDir: 'asc' })).toEqual([apple.id, mango.id, zebra.id]);
    // An aggregate, ordered before paging: page 1 of 1 holds the biggest send.
    expect(await ids({ sortBy: 'recipients', sortDir: 'desc', limit: '1' })).toEqual([mango.id]);
    // A draft has no rate and goes last either way.
    expect(await ids({ sortBy: 'responseRate', sortDir: 'desc' })).toEqual([apple.id, mango.id, zebra.id]);
    expect(await ids({ sortBy: 'responseRate', sortDir: 'asc' })).toEqual([mango.id, apple.id, zebra.id]);
    expect(await ids({ sortBy: 'id', sortDir: 'asc' })).toEqual([zebra.id, apple.id, mango.id]);
  });

  it('duplicates into a new draft with the same questions', async () => {
    const admin = await makeAdmin();
    const survey = await createDraft(admin.token);

    const res = await request(app).post(`/admin/surveys/${survey.id}/duplicate`).set(...authHeader(admin.token));
    expect(res.status).toBe(201);
    expect(res.body.data.id).not.toBe(survey.id);
    expect(res.body.data).toMatchObject({ status: 'DRAFT', title: 'How are we doing? (copy)' });
    expect(res.body.data.questions.map((q: { prompt: string }) => q.prompt)).toEqual(
      SAMPLE_DRAFT.questions!.map((q) => q.prompt),
    );
  });

  it('refuses an invalid draft', async () => {
    const admin = await makeAdmin();
    const res = await request(app)
      .post('/admin/surveys')
      .set(...authHeader(admin.token))
      .send({ title: 'x', questions: [{ type: 'SINGLE_CHOICE', prompt: 'p', options: ['only one'] }] });
    expect(res.status).toBe(400);
  });
});
