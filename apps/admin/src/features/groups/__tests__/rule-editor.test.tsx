/**
 * The dynamic-group rule editor: rules are added one field at a time (a field
 * can't be used twice), each row reads as field / condition / amount, the
 * summary is the shared plain-language description, and a live count says how
 * many mothers the rules match.
 */
import type { DynamicGroupRules } from '@nanny-app/shared';
import { describeDynamicRules } from '@nanny-app/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import { RuleEditor } from '@admin/features/groups/rule-editor';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

const ok = <T,>(data: T) => HttpResponse.json({ data, error: null });

let previewCalls: { rules: DynamicGroupRules }[] = [];

beforeEach(() => {
  previewCalls = [];
  server.use(
    http.post('/api/admin/groups/rules-preview', async ({ request }) => {
      const body = (await request.json()) as { rules: DynamicGroupRules };
      previewCalls.push(body);
      // No rules is every active mother; any rule narrows it.
      return ok({ count: body.rules.length === 0 ? 5000 : 1240 });
    }),
  );
});

function Harness({ initial = [] }: { initial?: DynamicGroupRules }) {
  const [rules, setRules] = useState<DynamicGroupRules>(initial);
  return (
    <>
      <RuleEditor value={rules} onChange={setRules} />
      <output aria-label="rules">{JSON.stringify(rules)}</output>
    </>
  );
}

describe('RuleEditor', () => {
  it('adds a rule from the menu, describes it, counts the matches, and offers each field once', async () => {
    renderWithProviders(<Harness />);
    expect(screen.getByText(describeDynamicRules([]))).toBeInTheDocument();
    expect(await screen.findByText('5,000 mothers match right now')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Add rule' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Last app open' }));

    const rule = { field: 'lastAppOpenAt', op: 'notWithinDays', days: 30 } as const;
    expect(screen.getByText(describeDynamicRules([rule]))).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Last app open: days' })).toHaveValue(30);
    expect(await screen.findByText('1,240 mothers match right now')).toBeInTheDocument();
    expect(previewCalls.at(-1)).toEqual({ rules: [rule] });

    await userEvent.click(screen.getByRole('button', { name: 'Add rule' }));
    expect(screen.queryByRole('menuitem', { name: 'Last app open' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Completed bookings' })).toBeInTheDocument();
  });

  it('changes a condition and an amount, and removing the rule updates the summary', async () => {
    renderWithProviders(<Harness initial={[{ field: 'completedBookings', op: 'gte', value: 1 }]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Completed bookings: condition' }));
    await userEvent.click(screen.getByRole('option', { name: 'at most' }));
    const amount = screen.getByRole('spinbutton', { name: 'Completed bookings: number of bookings' });
    await userEvent.clear(amount);
    await userEvent.type(amount, '0');

    const next = [{ field: 'completedBookings', op: 'lte', value: 0 }] as const;
    expect(screen.getByRole('status', { name: 'rules' })).toHaveTextContent(JSON.stringify(next));
    expect(screen.getByText(describeDynamicRules([...next]))).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Remove rule: Completed bookings' }));
    expect(screen.getByText(describeDynamicRules([]))).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'rules' })).toHaveTextContent('[]');
  });

  it('flags an out-of-range amount on its row and stops counting until it is fixed', async () => {
    renderWithProviders(<Harness initial={[{ field: 'lastAppOpenAt', op: 'withinDays', days: 7 }]} />);
    await screen.findByText('1,240 mothers match right now');
    const before = previewCalls.length;

    const days = screen.getByRole('spinbutton', { name: 'Last app open: days' });
    await userEvent.clear(days);
    const error = screen.getByText('Enter whole days from 1 to 3,650.');
    expect(days).toHaveAttribute('aria-invalid', 'true');
    expect(days).toHaveAttribute('aria-describedby', error.id);
    expect(screen.getByText('Fix the rules above to see how many mothers match.')).toBeInTheDocument();

    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(previewCalls.length).toBe(before);
  });
});
