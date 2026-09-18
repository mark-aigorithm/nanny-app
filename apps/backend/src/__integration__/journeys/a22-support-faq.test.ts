/**
 * A22 — the FAQ an operator writes is the FAQ the app shows.
 *
 * The Help & Support screen used to carry its questions in the app bundle,
 * so nothing an operator did could reach them. They are a console setting
 * now: the seam is `PUT /admin/support-faq` on one side and `GET /support/faq`
 * on the other, and the defaults keep a fresh environment from being blank.
 */
import request from 'supertest';

import { app } from '@backend/app';

import { authHeader } from '../../../test/auth';
import { makeAdmin, makeMother, makeOperator } from '../../../test/factories';

const NEW_FAQ = {
  items: [
    { question: 'Do you cover Alexandria?', answer: 'Not yet — Cairo only for now.' },
    { question: 'Can I pay cash?', answer: 'No. Every booking is paid by card in the app.' },
  ],
};

function readAsApp(token: string) {
  return request(app).get('/support/faq').set(...authHeader(token));
}

describe('A22 — support FAQ', () => {
  it('answers the built-in questions before an operator has written any', async () => {
    const mother = await makeMother();
    const response = await readAsApp(mother.token);
    expect(response.status).toBe(200);
    expect(response.body.data.items[0].question).toBe('How are nannies vetted?');
  });

  it('shows the app exactly what the operator saved, in that order', async () => {
    const admin = await makeAdmin();
    const mother = await makeMother();

    const saved = await request(app)
      .put('/admin/support-faq')
      .set(...authHeader(admin.token))
      .send(NEW_FAQ);
    expect(saved.status).toBe(200);
    expect(saved.body.data).toEqual(NEW_FAQ);

    const shown = await readAsApp(mother.token);
    expect(shown.body.data).toEqual(NEW_FAQ);

    const console_ = await request(app).get('/admin/support-faq').set(...authHeader(admin.token));
    expect(console_.body.data).toEqual(NEW_FAQ);
  });

  it('refuses an entry with no answer, and keeps what was there', async () => {
    const admin = await makeAdmin();
    const mother = await makeMother();
    await request(app).put('/admin/support-faq').set(...authHeader(admin.token)).send(NEW_FAQ);

    const response = await request(app)
      .put('/admin/support-faq')
      .set(...authHeader(admin.token))
      .send({ items: [{ question: 'Half written', answer: '' }] });
    expect(response.status).toBe(400);

    expect((await readAsApp(mother.token)).body.data).toEqual(NEW_FAQ);
  });

  it('is behind the Settings section, and writing needs MANAGE', async () => {
    const viewer = await makeOperator({ settings: 'VIEW' });
    const outsider = await makeOperator({ bookings: 'MANAGE' });

    expect((await request(app).get('/admin/support-faq').set(...authHeader(viewer.token))).status).toBe(200);
    expect(
      (await request(app).put('/admin/support-faq').set(...authHeader(viewer.token)).send(NEW_FAQ)).status,
    ).toBe(403);
    expect((await request(app).get('/admin/support-faq').set(...authHeader(outsider.token))).status).toBe(403);
  });
});
