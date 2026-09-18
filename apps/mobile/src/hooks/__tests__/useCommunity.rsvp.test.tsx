import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { api } from '@mobile/lib/api';
import { useToggleEventRsvp } from '@mobile/hooks/useCommunity';
import { useConfirmDialogStore } from '@mobile/store/confirmDialogStore';

const mockPost = api.post as jest.Mock;

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** The axios rejection for the envelope the backend returns when the event is full (HTTP 409). */
function refusal(message: string) {
  return Promise.reject(
    Object.assign(new Error('Request failed with status code 409'), {
      isAxiosError: true,
      response: { status: 409, data: { data: null, error: message } },
    }),
  );
}

describe('useToggleEventRsvp', () => {
  beforeEach(() => {
    mockPost.mockReset();
    useConfirmDialogStore.getState().dismiss();
  });

  it('tells the parent why when the server refuses the RSVP', async () => {
    mockPost.mockImplementationOnce(() => refusal('This event is at capacity.'));

    const { result } = renderHook(() => useToggleEventRsvp(), { wrapper });
    result.current.mutate(42);

    await waitFor(() => expect(result.current.isError).toBe(true));

    const dialog = useConfirmDialogStore.getState().dialog;
    expect(dialog?.title).toBe("Couldn't RSVP");
    expect(dialog?.message).toBe('This event is at capacity.');
  });

  it('shows nothing when the RSVP goes through', async () => {
    mockPost.mockResolvedValueOnce({ data: { data: { attending: true, attendeeCount: 3 }, error: null } });

    const { result } = renderHook(() => useToggleEventRsvp(), { wrapper });
    result.current.mutate(42);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(useConfirmDialogStore.getState().dialog).toBeNull();
  });
});
