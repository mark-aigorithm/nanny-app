import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Child } from '@nanny-app/shared';

/**
 * Booking step 2 picks from her saved children (Profile → Children) instead of
 * typing them in: tick who's coming, add or edit one on the spot (saved to her
 * profile and ticked), never more than one nanny may take.
 */
const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock('@mobile/lib/api', () => ({
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
  unwrap: jest.fn((promise: Promise<{ data: { data: unknown; error: string | null } }>) =>
    promise.then((res) => res.data.data),
  ),
  getApiErrorMessage: (_err: unknown, fallback: string) => fallback,
}));

jest.mock('@mobile/components/ChildFormSheet', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    __esModule: true,
    default: ({
      visible,
      initial,
      onSubmit,
    }: {
      visible: boolean;
      initial?: { name: string | null };
      onSubmit: (input: unknown) => void;
    }) =>
      visible
        ? React.createElement(
            Pressable,
            { onPress: () => onSubmit({ name: initial?.name ?? 'Mai', birthMonth: '2020-05' }) },
            React.createElement(
              Text,
              null,
              initial ? `editing ${initial.name ?? 'a child with no name'}` : 'adding',
            ),
          )
        : null,
  };
});

import { api } from '@mobile/lib/api';
import BookingCareDetailsScreen from '@mobile/screens/parent/BookingCareDetailsScreen';

const mockApi = api as unknown as { post: jest.Mock; put: jest.Mock };

const PRICING = {
  standardHourlyRate: 100,
  serviceFeePercent: 0,
  nannyPercent: 80,
  platformPercent: 20,
  skillAddOns: [],
  durationRules: [],
  includedChildrenPerBooking: 1,
  maxChildrenPerBooking: 2,
  extraChildFeeType: 'FLAT',
  extraChildFeeValue: 30,
};

const PARAMS = {
  dateIso: '2026-08-10',
  startTimeWall: '2026-08-10T09:00:00',
  endTimeWall: '2026-08-10T11:00:00',
  durationHours: '2',
  addressId: '7',
};

function child(over: Partial<Child>): Child {
  return {
    id: 1,
    name: 'Lina',
    birthMonth: '2024-11',
    ageYears: 1,
    ageMonths: 20,
    allergies: [],
    conditions: [],
    healthNotes: null,
    diet: [],
    interests: [],
    languages: [],
    notes: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

const envelope = (data: unknown) => Promise.resolve({ data: { data, error: null } });

function renderScreen(children: Child[]) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(['pricing-config'], PRICING);
  qc.setQueryData(['children'], children);
  return render(
    <QueryClientProvider client={qc}>
      <BookingCareDetailsScreen />
    </QueryClientProvider>,
  );
}

/** The params the last push to the review step carried. */
const pushedParams = () => mockPush.mock.calls.at(-1)?.[0]?.params as Record<string, string>;

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { ...PARAMS };
  jest.useFakeTimers();
});
afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

describe('BookingCareDetailsScreen — picking children', () => {
  it('picks an only child for her and carries the ids and snapshot on', () => {
    const screen = renderScreen([child({ allergies: ['Peanuts'] })]);

    // Aged on the booking month (Nov 2024 → Aug 2026).
    screen.getByText('21 mos');
    screen.getByText('Peanuts');
    fireEvent.press(screen.getByText('Continue to review'));

    const params = pushedParams();
    expect(params.childIds).toBe('1');
    expect(JSON.parse(params.children!)).toEqual([
      expect.objectContaining({ name: 'Lina', ageYears: 1, ageMonths: 21, allergies: 'Peanuts' }),
    ]);
  });

  it('assumes nothing when she has two or more, and waits for a tick', () => {
    const screen = renderScreen([child({}), child({ id: 2, name: 'Omar', birthMonth: '2021-03' })]);

    fireEvent.press(screen.getByText('Continue to review'));
    expect(mockPush).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Omar'));
    fireEvent.press(screen.getByLabelText('Lina'));
    fireEvent.press(screen.getByText('Continue to review'));
    // The order she ticked in — the second is the extra child.
    expect(pushedParams().childIds).toBe('2,1');
    screen.getByText('Extra');
  });

  it('stops at the most children one nanny may take', () => {
    const screen = renderScreen([
      child({}),
      child({ id: 2, name: 'Omar' }),
      child({ id: 3, name: 'Mai' }),
    ]);

    fireEvent.press(screen.getByLabelText('Lina'));
    fireEvent.press(screen.getByLabelText('Omar'));
    fireEvent.press(screen.getByLabelText('Mai'));
    screen.getByText('One nanny can look after up to 2 children. Untick one to swap.');
    fireEvent.press(screen.getByText('Continue to review'));
    expect(pushedParams().childIds).toBe('1,2');
  });

  it('adds a child to her profile and ticks them', async () => {
    mockApi.post.mockReturnValue(envelope(child({ id: 9, name: 'Mai', birthMonth: '2020-05' })));
    const screen = renderScreen([]);

    screen.getByText('Who is this booking for?');
    fireEvent.press(screen.getByText('Add your child'));
    fireEvent.press(screen.getByText('adding'));

    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('/children', {
        name: 'Mai',
        birthMonth: '2020-05',
      }),
    );
    await screen.findByText('Mai');
    fireEvent.press(screen.getByText('Continue to review'));
    expect(pushedParams().childIds).toBe('9');
  });

  it('sends an older build’s name-less child to the form instead of ticking it', () => {
    const screen = renderScreen([
      child({ name: null, birthMonth: null, ageYears: 4, ageMonths: null }),
      child({ id: 2, name: 'Omar' }),
    ]);

    screen.getByText('Add a name to book');
    fireEvent.press(screen.getByLabelText('Child with no name'));
    screen.getByText('editing a child with no name');
  });

  it('restores what she picked when she comes back from the review step', () => {
    mockParams = { ...PARAMS, childIds: '2' };
    const screen = renderScreen([child({}), child({ id: 2, name: 'Omar' })]);
    fireEvent.press(screen.getByText('Continue to review'));
    expect(pushedParams().childIds).toBe('2');
  });
});
