import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Child } from '@nanny-app/shared';

/**
 * Profile → Children: each saved child with their age and health warning, the
 * empty state with a way forward, and add / edit / remove.
 */
jest.mock('@mobile/lib/api', () => ({
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
  unwrap: jest.fn((promise: Promise<{ data: { data: unknown; error: string | null } }>) =>
    promise.then((res) => res.data.data),
  ),
  getApiErrorMessage: (_err: unknown, fallback: string) => fallback,
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
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
            { onPress: () => onSubmit({ name: initial?.name ?? 'Omar', birthMonth: '2022-01' }) },
            React.createElement(Text, null, initial ? `editing ${initial.name}` : 'adding'),
          )
        : null,
  };
});

import { api } from '@mobile/lib/api';
import ChildrenScreen from '@mobile/screens/parent/ChildrenScreen';

const mockApi = api as unknown as {
  get: jest.Mock;
  post: jest.Mock;
  put: jest.Mock;
  delete: jest.Mock;
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

function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ChildrenScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ChildrenScreen', () => {
  it('lists each child with their age and health warning', async () => {
    mockApi.get.mockReturnValue(
      envelope([
        child({ allergies: ['Peanuts'], conditions: ['Asthma'], interests: ['Lego'] }),
        child({ id: 2, name: 'Omar', birthMonth: '2021-03', ageYears: 5, ageMonths: null }),
      ]),
    );
    const screen = renderScreen();

    await screen.findByText('Lina');
    screen.getByText('20 mos · Born Nov 2024');
    screen.getByText('Peanuts, Asthma');
    screen.getByText('Loves: Lego');
    screen.getByText('5 yrs · Born Mar 2021');
  });

  it('flags a child from an older build that still needs a name', async () => {
    mockApi.get.mockReturnValue(
      envelope([child({ name: null, birthMonth: null, ageYears: 4, ageMonths: null })]),
    );
    const screen = renderScreen();
    await screen.findByText('Add a name to book for this child.');
  });

  it('shows an empty state with the button to add one', async () => {
    mockApi.get.mockReturnValue(envelope([]));
    mockApi.post.mockReturnValue(envelope(child({ id: 9, name: 'Omar' })));
    const screen = renderScreen();

    await screen.findByText('No children yet');
    fireEvent.press(screen.getByText('Add a child'));
    fireEvent.press(screen.getByText('adding'));

    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('/children', {
        name: 'Omar',
        birthMonth: '2022-01',
      }),
    );
    await screen.findByText('Omar');
  });

  it('edits a child with a PUT of the whole child', async () => {
    mockApi.get.mockReturnValue(envelope([child({})]));
    mockApi.put.mockReturnValue(envelope(child({ name: 'Lina' })));
    const screen = renderScreen();

    fireEvent.press(await screen.findByLabelText('Edit Lina'));
    fireEvent.press(screen.getByText('editing Lina'));

    await waitFor(() =>
      expect(mockApi.put).toHaveBeenCalledWith('/children/1', {
        name: 'Lina',
        birthMonth: '2022-01',
      }),
    );
  });

  it('removes a child only after she confirms', async () => {
    mockApi.get.mockReturnValue(envelope([child({})]));
    mockApi.delete.mockReturnValue(envelope([]));
    const alert = jest.spyOn(Alert, 'alert');
    const screen = renderScreen();

    fireEvent.press(await screen.findByLabelText('Remove Lina'));
    expect(mockApi.delete).not.toHaveBeenCalled();

    const buttons = alert.mock.calls[0]?.[2] ?? [];
    buttons.find((b) => b.text === 'Remove')?.onPress?.();
    await waitFor(() => expect(mockApi.delete).toHaveBeenCalledWith('/children/1'));
  });
});
