/**
 * A nanny can hold a skill that has since been deactivated in the catalog.
 * The editor must show it — a hidden-but-selected skill used to ride along on
 * every save and fail it — and let the admin keep or drop it.
 */
import type { AdminNanny, SetNannySkillsInput, Skill } from '@nanny-app/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { NannySkillsEditor } from '@admin/features/nannies/nanny-skills-editor';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

function skill(id: number, name: string, isActive = true): Skill {
  return {
    id,
    name,
    description: null,
    isActive,
    feeType: null,
    feeValue: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

// The active catalog, as the detail page passes it.
const ACTIVE = [skill(3, 'French'), skill(13, 'Test Skill 10'), skill(5, 'Test Skill 2')];

const NANNY: AdminNanny = {
  id: 21,
  name: 'Amira Hassan',
  email: 'amira@example.com',
  phone: null,
  dateOfBirth: null,
  avatarUrl: null,
  bio: null,
  location: null,
  yearsOfExperience: null,
  certifications: [],
  skills: [
    { id: 3, name: 'French', feeType: null, feeValue: 0, isActive: true },
    { id: 4, name: 'Test Skill 1', feeType: null, feeValue: 0, isActive: false },
  ],
  isEmailVerified: false,
  isPhoneVerified: false,
  approvalStatus: 'APPROVED',
  idDocumentType: null,
  rejectionReason: null,
  reviewedAt: null,
  idDocumentFrontUrl: null,
  idDocumentBackUrl: null,
  createdAt: '2026-07-01T00:00:00.000Z',
};

function captureSave(): { body: SetNannySkillsInput | null } {
  const sent: { body: SetNannySkillsInput | null } = { body: null };
  server.use(
    http.put('/api/admin/nannies/:id/skills', async ({ request }) => {
      sent.body = (await request.json()) as SetNannySkillsInput;
      return HttpResponse.json({ data: NANNY, error: null });
    }),
  );
  return sent;
}

describe('NannySkillsEditor', () => {
  it('shows a held skill that was deactivated, checked and marked inactive', () => {
    renderWithProviders(<NannySkillsEditor nanny={NANNY} skills={ACTIVE} onDone={() => {}} />);

    const held = screen.getByRole('checkbox', { name: /^Test Skill 1(?!0)/ });
    expect(held).toBeChecked();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('keeps the inactive skill when another is added', async () => {
    const sent = captureSave();
    const onDone = vi.fn();
    renderWithProviders(<NannySkillsEditor nanny={NANNY} skills={ACTIVE} onDone={onDone} />);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Test Skill 2' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save skills' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect([...(sent.body?.skillIds ?? [])].sort((a, b) => a - b)).toEqual([3, 4, 5]);
  });

  it('drops the inactive skill when the admin unticks it', async () => {
    const sent = captureSave();
    const onDone = vi.fn();
    renderWithProviders(<NannySkillsEditor nanny={NANNY} skills={ACTIVE} onDone={onDone} />);

    await userEvent.click(screen.getByRole('checkbox', { name: /^Test Skill 1(?!0)/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save skills' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(sent.body?.skillIds).toEqual([3]);
  });

  it('orders skills naturally, so "Test Skill 2" comes before "Test Skill 10"', () => {
    renderWithProviders(<NannySkillsEditor nanny={NANNY} skills={ACTIVE} onDone={() => {}} />);

    const names = screen.getAllByRole('checkbox').map((box) => box.closest('label')?.textContent);
    expect(names).toEqual(['French', 'Test Skill 1Inactive', 'Test Skill 2', 'Test Skill 10']);
  });
});
