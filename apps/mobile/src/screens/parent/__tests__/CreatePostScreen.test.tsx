import React from 'react';
import { Platform } from 'react-native';
import { act, render, fireEvent, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@mobile/lib/api', () => ({
  api: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
  unwrap: jest.fn(),
  unwrapPaginated: jest.fn(),
}));
jest.mock('@mobile/lib/storage', () => ({ uploadImageToFirebase: jest.fn() }));
jest.mock('@mobile/lib/e2eImage', () => ({
  e2ePlaceholderImageUri: jest.fn().mockResolvedValue(null),
}));
let mockParams: Record<string, string> = { type: 'event' };
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

// Android opens native dialogs through the imperative API; record each call.
const mockOpen = jest.fn();
jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: () => null,
  DateTimePickerAndroid: { open: (...args: unknown[]) => mockOpen(...args) },
}));

import CreatePostScreen from '@mobile/screens/parent/CreatePostScreen';
import { formatEventDate } from '@mobile/lib/communityUtils';

type OpenParams = {
  mode: string;
  value: Date;
  onChange: (event: { type: string }, date?: Date) => void;
};

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CreatePostScreen />
    </QueryClientProvider>,
  );
}

const originalOS = Platform.OS;
beforeEach(() => {
  mockParams = { type: 'event' };
  mockOpen.mockReset();
  Platform.OS = 'android';
});
afterEach(() => {
  Platform.OS = originalOS;
});

describe('event date & time on Android', () => {
  // Asking Android for mode="datetime" (iOS-only) crashed the app when the
  // dialog closed: the picker opens the day, then the time, never both.
  it('picks the day, then the time, and shows the result', () => {
    renderScreen();
    fireEvent.press(screen.getByTestId('createPost.eventDate'));

    expect(mockOpen).toHaveBeenCalledTimes(1);
    const dateParams = mockOpen.mock.calls[0]![0] as OpenParams;
    expect(dateParams.mode).toBe('date');

    const day = new Date(2031, 4, 20, 9, 0);
    act(() => dateParams.onChange({ type: 'set' }, day));

    expect(mockOpen).toHaveBeenCalledTimes(2);
    const timeParams = mockOpen.mock.calls[1]![0] as OpenParams;
    expect(timeParams.mode).toBe('time');
    expect(timeParams.value).toEqual(day);

    const picked = new Date(2031, 4, 20, 18, 30);
    act(() => timeParams.onChange({ type: 'set' }, picked));
    expect(screen.getByText(formatEventDate(picked.toISOString()))).toBeTruthy();
    expect(mockOpen.mock.calls.every(([p]) => (p as OpenParams).mode !== 'datetime')).toBe(true);
  });

  it('stops after the day when the user cancels it', () => {
    renderScreen();
    fireEvent.press(screen.getByTestId('createPost.eventDate'));
    (mockOpen.mock.calls[0]![0] as OpenParams).onChange({ type: 'dismissed' });
    expect(mockOpen).toHaveBeenCalledTimes(1);
  });
});

describe('starting post type', () => {
  it('opens on the type the feed asked for', () => {
    renderScreen();
    expect(screen.getByText('Event name')).toBeTruthy();
  });

  it('follows a new type when the mounted screen is opened again', () => {
    mockParams = { type: 'qa' };
    const view = renderScreen();
    expect(screen.queryByText('Event name')).toBeNull();

    mockParams = { type: 'event' };
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <CreatePostScreen />
      </QueryClientProvider>,
    );
    expect(screen.getByText('Event name')).toBeTruthy();
  });
});
