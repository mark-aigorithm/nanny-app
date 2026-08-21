/**
 * Proves the admin Vitest harness end to end.
 *
 * Rendering a component that fetches through the real `fetchSkills` exercises
 * the whole client stack in one go: jsdom, React 19, React Query, the axios
 * `apiClient` with its auth interceptors, MSW's network interception, and the
 * `{ data, error }` envelope unwrapping. If any of those is misconfigured, this
 * fails — which is what lets a real feature test's failure be read as a real bug.
 */
import { useQuery } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { fetchSkills } from '@admin/lib/api';

import { SKILL_FIXTURE } from './handlers';
import { renderWithProviders } from './render';
import { server } from './server';

/** Minimal consumer — the point is the data path, not any particular screen. */
function SkillList() {
  const { data, isLoading, error } = useQuery({ queryKey: ['skills'], queryFn: fetchSkills });

  if (isLoading) return <p>Loading…</p>;
  if (error) return <p role="alert">Could not load skills</p>;

  return (
    <ul>
      {data?.map((skill) => (
        <li key={skill.id}>{skill.name}</li>
      ))}
    </ul>
  );
}

describe('admin test harness', () => {
  it('renders data fetched through apiClient and MSW', async () => {
    renderWithProviders(<SkillList />);

    expect(screen.getByText('Loading…')).toBeInTheDocument();

    expect(await screen.findByText(SKILL_FIXTURE.name)).toBeInTheDocument();
  });

  it('lets a test override a handler to exercise the failure path', async () => {
    server.use(
      http.get('/api/admin/skills', () =>
        HttpResponse.json({ data: null, error: 'Boom' }, { status: 500 }),
      ),
    );

    renderWithProviders(<SkillList />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Could not load skills');
    });
  });
});
