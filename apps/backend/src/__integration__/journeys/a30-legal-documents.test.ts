/**
 * A30 — the Terms of Service and Privacy Policy an operator writes are the
 * ones the registration wizard opens.
 *
 * The seam is `PUT /admin/legal-documents/:key` on one side and the public
 * `GET /legal/:key` on the other — public because a new user reads them
 * before she has an account. Until an operator writes one, it reads as a
 * placeholder with no date.
 */
import request from 'supertest';

import { app } from '@backend/app';

import { authHeader } from '../../../test/auth';
import { makeAdmin, makeOperator } from '../../../test/factories';

const NEW_TERMS = { title: 'Terms of Service', body: 'Book through the app. Pay through the app.' };

describe('A30 — legal documents', () => {
  it('reads as a placeholder, signed out, before an operator has written it', async () => {
    const response = await request(app).get('/legal/terms');
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      key: 'terms',
      title: 'Terms of Service',
      body: expect.stringMatching(/will be published here soon/),
      updatedAt: null,
    });
  });

  it('shows the app what the operator saved, and leaves the other document alone', async () => {
    const admin = await makeAdmin();

    const saved = await request(app)
      .put('/admin/legal-documents/terms')
      .set(...authHeader(admin.token))
      .send(NEW_TERMS);
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({ key: 'terms', ...NEW_TERMS });
    expect(saved.body.data.updatedAt).toEqual(expect.any(String));

    const shown = await request(app).get('/legal/terms');
    expect(shown.body.data).toEqual(saved.body.data);

    const privacy = await request(app).get('/legal/privacy');
    expect(privacy.body.data.updatedAt).toBeNull();

    const console_ = await request(app).get('/admin/legal-documents').set(...authHeader(admin.token));
    expect(console_.status).toBe(200);
    expect(console_.body.data.terms).toEqual(saved.body.data);
    expect(console_.body.data.privacy.updatedAt).toBeNull();
  });

  it('refuses an empty body, and keeps what was there', async () => {
    const admin = await makeAdmin();
    await request(app).put('/admin/legal-documents/terms').set(...authHeader(admin.token)).send(NEW_TERMS);

    const response = await request(app)
      .put('/admin/legal-documents/terms')
      .set(...authHeader(admin.token))
      .send({ title: 'Terms', body: '   ' });
    expect(response.status).toBe(400);

    expect((await request(app).get('/legal/terms')).body.data.body).toBe(NEW_TERMS.body);
  });

  it('knows only the terms and the privacy policy', async () => {
    const admin = await makeAdmin();
    expect((await request(app).get('/legal/cookies')).status).toBe(404);
    expect(
      (await request(app).put('/admin/legal-documents/cookies').set(...authHeader(admin.token)).send(NEW_TERMS))
        .status,
    ).toBe(404);
  });

  it('is behind the Settings section, and writing needs MANAGE', async () => {
    const viewer = await makeOperator({ settings: 'VIEW' });
    const outsider = await makeOperator({ bookings: 'MANAGE' });

    expect((await request(app).get('/admin/legal-documents').set(...authHeader(viewer.token))).status).toBe(200);
    expect(
      (await request(app).put('/admin/legal-documents/terms').set(...authHeader(viewer.token)).send(NEW_TERMS))
        .status,
    ).toBe(403);
    expect((await request(app).get('/admin/legal-documents').set(...authHeader(outsider.token))).status).toBe(403);
  });
});
