/**
 * Who gets a notification: groups (each marked Static or Dynamic, with its
 * size) or hand-picked mothers, with a live count of the reach. Picked mothers
 * can be saved as a static group, and the toast offers to send to that group
 * instead.
 */
import type { AdminUser, MotherPickerRow, UserGroup } from '@nanny-app/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import {
  TemplateAudienceFields,
  type AudienceValue,
  type SavedAudienceNames,
} from '@admin/features/notifications/template-audience-fields';
import { PermissionsProvider } from '@admin/lib/permissions';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

import { ADMIN, BETA, LAPSED, NOTIFIER, editorHandlers, ok } from './fixtures';

const mother = (id: number, name: string): MotherPickerRow => ({
  id, name, phone: null, completedBookings: 1, hoursBooked: 4, totalSpent: 400,
  lastBookingAt: null, createdAt: '2026-10-01T00:00:00.000Z', lastLoginAt: null, lastAppOpenAt: null,
});
const AMY = mother(11, 'Amy');
const BEA = mother(12, 'Bea');
const OCTOBER: UserGroup = {
  id: 30, name: 'October picks', description: null, kind: 'STATIC', rules: null,
  memberCount: 2, createdAt: '2026-10-20T10:00:00.000Z',
};

beforeEach(() => {
  server.use(http.get('/api/admin/me', () => ok(ADMIN)), ...editorHandlers);
});

function Harness({
  initial,
  saved,
  disabled = false,
  error,
}: {
  initial: AudienceValue;
  saved: SavedAudienceNames;
  disabled?: boolean;
  error?: string;
}) {
  const [value, setValue] = useState<AudienceValue>(initial);
  return (
    <>
      <TemplateAudienceFields
        value={value}
        onChange={setValue}
        saved={saved}
        readOnly={false}
        disabled={disabled}
        error={error}
        errorId="audience-error"
      />
      <output aria-label="audience">{JSON.stringify(value)}</output>
    </>
  );
}

function renderFields(
  initial: AudienceValue,
  saved: SavedAudienceNames = { groups: [], mothers: [] },
  extra: { disabled?: boolean; error?: string } = {},
) {
  return renderWithProviders(
    <ToastProvider>
      <PermissionsProvider>
        <Harness initial={initial} saved={saved} {...extra} />
      </PermissionsProvider>
    </ToastProvider>,
  );
}

describe('TemplateAudienceFields', () => {
  it('marks each group Static or Dynamic with its size, and counts the audience live', async () => {
    let body: unknown;
    server.use(
      http.post('/api/admin/notification-templates/audience-preview', async ({ request }) => {
        body = await request.json();
        return ok({ mothers: 1240, withPushDevice: 1031 });
      }),
    );
    renderFields({ type: 'GROUPS', groupIds: [] });

    expect(await screen.findByText(/choose who gets this notification/i)).toBeInTheDocument();
    const lapsed = await screen.findByRole('checkbox', { name: /lapsed 30d/i });
    const lapsedRow = lapsed.closest('label')!;
    expect(within(lapsedRow).getByText('Dynamic')).toBeInTheDocument();
    expect(within(lapsedRow).getByText('1,240 mothers now')).toBeInTheDocument();
    const betaRow = screen.getByRole('checkbox', { name: /beta testers/i }).closest('label')!;
    expect(within(betaRow).getByText('Static')).toBeInTheDocument();

    await userEvent.click(lapsed);
    expect(await screen.findByText('1,240 mothers · 1,031 with push enabled')).toBeInTheDocument();
    expect(body).toEqual({ audience: { type: 'GROUPS', groupIds: [2] } });
  });

  it('saves the chosen mothers as a static group, and "Use this group instead" switches to it', async () => {
    let created = false;
    let groupBody: unknown;
    let membersBody: unknown;
    server.use(
      http.get('/api/admin/groups', () => ok(created ? [LAPSED, BETA, OCTOBER] : [LAPSED, BETA])),
      http.get('/api/admin/mother-picker', () =>
        HttpResponse.json({ data: [AMY, BEA], error: null, meta: { page: 1, limit: 20, total: 2, totalPages: 1 } }),
      ),
      http.post('/api/admin/groups', async ({ request }) => {
        groupBody = await request.json();
        created = true;
        return ok({ ...OCTOBER, memberCount: 0 });
      }),
      http.post('/api/admin/groups/30/members', async ({ request }) => {
        membersBody = await request.json();
        return ok(OCTOBER);
      }),
    );
    renderFields({ type: 'MOTHERS', motherIds: [] });

    await userEvent.click(await screen.findByRole('button', { name: 'Choose mothers…' }));
    const picker = await screen.findByRole('dialog', { name: 'Choose mothers' });
    await userEvent.click(await within(picker).findByRole('checkbox', { name: 'Select Amy' }));
    await userEvent.click(within(picker).getByRole('checkbox', { name: 'Select Bea' }));
    await userEvent.click(within(picker).getByRole('button', { name: 'Use 2 mothers' }));
    expect(screen.getByText(/Amy, Bea/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Save these 2 mothers as a static group' }));
    const dialog = await screen.findByRole('dialog', { name: 'Save as a static group' });
    await userEvent.type(within(dialog).getByLabelText('Group name'), 'October picks');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create group' }));
    await waitFor(() => expect(membersBody).toEqual({ userIds: [11, 12] }));
    expect(groupBody).toEqual({ name: 'October picks', description: '', kind: 'STATIC' });

    await userEvent.click(await screen.findByRole('button', { name: 'Use this group instead' }));
    expect(screen.getByRole('status', { name: 'audience' })).toHaveTextContent('{"type":"GROUPS","groupIds":[30]}');
    expect(screen.getByRole('radio', { name: 'Groups' })).toBeChecked();
    expect(await screen.findByRole('checkbox', { name: /october picks/i })).toBeChecked();
    expect(screen.queryByRole('button', { name: 'Use this group instead' })).not.toBeInTheDocument();
  });

  it('hides "Save as a static group" from an admin who cannot manage groups', async () => {
    server.use(http.get('/api/admin/me', () => ok<AdminUser>(NOTIFIER)));
    renderFields({ type: 'MOTHERS', motherIds: [11] }, { groups: [], mothers: [{ id: 11, name: 'Amy' }] });

    expect(await screen.findByText(/Amy/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change selection…' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /as a static group/i })).not.toBeInTheDocument();
  });

  it('keeps the other mode\'s selection when switching back and forth mid-edit', async () => {
    renderFields({ type: 'GROUPS', groupIds: [2] }, { groups: [], mothers: [{ id: 11, name: 'Amy' }] });

    await userEvent.click(await screen.findByRole('radio', { name: 'Specific mothers' }));
    expect(screen.getByRole('status', { name: 'audience' })).toHaveTextContent('{"type":"MOTHERS","motherIds":[]}');

    await userEvent.click(screen.getByRole('radio', { name: 'Groups' }));
    expect(screen.getByRole('status', { name: 'audience' })).toHaveTextContent('{"type":"GROUPS","groupIds":[2]}');
    expect(await screen.findByRole('checkbox', { name: /lapsed 30d/i })).toBeChecked();
  });

  it('keeps hand-picked mothers when flipping to Groups and back', async () => {
    renderFields({ type: 'MOTHERS', motherIds: [11] }, { groups: [], mothers: [{ id: 11, name: 'Amy' }] });

    await userEvent.click(await screen.findByRole('radio', { name: 'Groups' }));
    await userEvent.click(await screen.findByRole('checkbox', { name: /beta testers/i }));
    await userEvent.click(screen.getByRole('radio', { name: 'Specific mothers' }));
    expect(screen.getByRole('status', { name: 'audience' })).toHaveTextContent('{"type":"MOTHERS","motherIds":[11]}');
    expect(screen.getByText(/Amy/)).toBeInTheDocument();
  });

  it('marks the audience invalid and described by its error, and forwards disabled', async () => {
    renderFields({ type: 'GROUPS', groupIds: [] }, undefined, { error: 'Choose at least one group.', disabled: true });

    const group = await screen.findByRole('checkbox', { name: /lapsed 30d/i });
    expect(group).toBeDisabled();
    const fieldset = group.closest('fieldset')!;
    expect(fieldset).toHaveAttribute('aria-invalid', 'true');
    expect(fieldset.getAttribute('aria-describedby')).toContain('audience-error');
    expect(screen.getByRole('radio', { name: 'Specific mothers' })).toBeDisabled();
  });
});
