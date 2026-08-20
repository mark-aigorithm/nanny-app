import type { Skill } from '@nanny-app/shared';
import { http, HttpResponse } from 'msw';

/**
 * Default request handlers — the baseline "happy" backend.
 *
 * Keep only the handlers most tests need here. A test that cares about a
 * specific response (an error, an empty list, a particular row) should override
 * it locally with `server.use(...)`, which setup.ts resets afterwards. Piling
 * every case into this file makes it impossible to read a test and know what
 * the backend was doing.
 *
 * Paths are relative because apiClient's baseURL is `/api` unless
 * VITE_API_BASE_URL is set; MSW resolves them against the jsdom origin.
 */

/** Matches the `{ data, error }` envelope every backend route returns. */
function ok<T>(data: T) {
  return HttpResponse.json({ data, error: null });
}

export const SKILL_FIXTURE: Skill = {
  id: 1,
  name: 'French speaker',
  description: 'Converses with children in French.',
  isActive: true,
  feeType: 'FLAT',
  feeValue: 15,
  createdAt: '2026-01-01T00:00:00.000Z',
};

export const handlers = [http.get('/api/admin/skills', () => ok([SKILL_FIXTURE]))];
