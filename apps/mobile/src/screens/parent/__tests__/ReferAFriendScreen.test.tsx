import React from 'react';
import { RefreshControl } from 'react-native';
import { render, act } from '@testing-library/react-native';
import type { ReferralSummary } from '@nanny-app/shared';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn().mockResolvedValue(true) }));

// The screen is a thin view over this one query; stubbing it keeps the test on
// what the screen shows for each state rather than on React Query plumbing.
const mockRefetch = jest.fn().mockResolvedValue(undefined);
let mockSummary: { data?: ReferralSummary; isLoading: boolean; isError: boolean };
jest.mock('@mobile/hooks/useReferrals', () => ({
  useReferralSummary: () => ({ ...mockSummary, refetch: mockRefetch }),
}));

import ReferAFriendScreen from '@mobile/screens/parent/ReferAFriendScreen';

const SUMMARY: ReferralSummary = {
  code: 'MONA-7Q2X',
  shareMessage: 'Join me on NannyNow with MONA-7Q2X',
  enabled: true,
  referrerPoints: 200,
  refereePoints: 100,
  stats: { invited: 0, joined: 0, pointsEarned: 0 },
  referrals: [],
};

const ERROR_COPY = 'Couldn’t load your invites. Pull to refresh.';

beforeEach(() => {
  mockRefetch.mockClear();
});

// The device-level offline case is covered by C10 (the OfflineGate covers the
// app); this is the other half — a request that fails while the device still
// believes it is online, which the gate never sees.
describe('ReferAFriendScreen when the invites cannot load', () => {
  beforeEach(() => {
    mockSummary = { data: undefined, isLoading: false, isError: true };
  });

  it('says so in words a person can act on', () => {
    const { getByText } = render(<ReferAFriendScreen />);
    getByText(ERROR_COPY);
  });

  it('does not pretend: no code and no invite list', () => {
    const { queryByText } = render(<ReferAFriendScreen />);
    expect(queryByText('Your code')).toBeNull();
    expect(queryByText('Give an hour, get two')).toBeNull();
  });

  it('refetches when she pulls to refresh, as the message asks', async () => {
    const { UNSAFE_getByType } = render(<ReferAFriendScreen />);
    await act(async () => {
      UNSAFE_getByType(RefreshControl).props.onRefresh();
    });
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});

describe('ReferAFriendScreen once the invites load', () => {
  it('shows the code and drops the error', () => {
    mockSummary = { data: SUMMARY, isLoading: false, isError: false };
    const { getByText, queryByText } = render(<ReferAFriendScreen />);
    getByText('Your code');
    getByText('MONA-7Q2X');
    expect(queryByText(ERROR_COPY)).toBeNull();
  });
});
