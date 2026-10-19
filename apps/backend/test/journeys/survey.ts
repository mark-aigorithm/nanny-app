import type { AdminSurvey, SurveyDraftInput, SurveyTargetInput } from '@nanny-app/shared';
import request from 'supertest';

import { app } from '@backend/app';

import { authHeader } from '../auth';

/** One question of every type: the shape most survey tests want. */
export const SAMPLE_DRAFT: SurveyDraftInput = {
  title: 'How are we doing?',
  description: 'Two minutes, promise.',
  questions: [
    { type: 'RATING', prompt: 'Rate your last nanny' },
    { type: 'SINGLE_CHOICE', prompt: 'How did you find us?', options: ['Friend', 'Instagram', 'Search'] },
    { type: 'MULTI_CHOICE', prompt: 'What do you book for?', options: ['Work', 'Errands', 'Date night'], required: false },
    { type: 'YES_NO', prompt: 'Would you recommend us?' },
    { type: 'TEXT', prompt: 'Anything else?', required: false },
  ],
};

export async function createDraft(adminToken: string, draft: SurveyDraftInput = SAMPLE_DRAFT): Promise<AdminSurvey> {
  const res = await request(app).post('/admin/surveys').set(...authHeader(adminToken)).send(draft);
  expect(res.status).toBe(201);
  return res.body.data as AdminSurvey;
}

export async function publish(adminToken: string, surveyId: number, target: SurveyTargetInput): Promise<number> {
  const res = await request(app)
    .post(`/admin/surveys/${surveyId}/publish`)
    .set(...authHeader(adminToken))
    .send(target);
  expect(res.status).toBe(200);
  return (res.body.data as { count: number }).count;
}

/** A published SAMPLE_DRAFT sent to the given mothers. */
export async function createPublishedSurvey(adminToken: string, userIds: number[]): Promise<AdminSurvey> {
  const survey = await createDraft(adminToken);
  await publish(adminToken, survey.id, { userIds });
  return survey;
}
