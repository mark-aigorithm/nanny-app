/**
 * A37 — writing a survey. A draft is freely editable (PATCH replaces every
 * question), deletable, and listed with zero counts; duplicating copies the
 * questions into a new draft.
 */
import request from 'supertest';

import { app } from '@backend/app';

import { authHeader } from '../../../test/auth';
import { makeAdmin } from '../../../test/factories';
import { SAMPLE_DRAFT, createDraft } from '../../../test/journeys/survey';

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
