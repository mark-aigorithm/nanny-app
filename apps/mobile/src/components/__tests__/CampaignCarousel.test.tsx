import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import type { PublicCampaign } from '@nanny-app/shared';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockClick = jest.fn();
let mockCampaigns: PublicCampaign[] | undefined;
jest.mock('@mobile/hooks/useCampaigns', () => ({
  useActiveCampaigns: () => ({ data: mockCampaigns }),
  useTrackImpression: () => ({ mutate: jest.fn() }),
  useTrackClick: () => ({ mutate: mockClick }),
}));

import CampaignCarousel from '@mobile/components/CampaignCarousel';
import { usePendingPromoStore } from '@mobile/store/pendingPromoStore';

const WELCOME: PublicCampaign = {
  id: 1,
  title: 'Welcome offer',
  subtitle: '20% off your first booking',
  imageUrl: 'https://cdn.example.com/welcome.png',
  targetType: 'PROMO_CODE',
  packageId: null,
  promoCode: 'WELCOME20',
};

const PACK: PublicCampaign = {
  id: 2,
  title: '10-hour pack',
  subtitle: null,
  imageUrl: 'https://cdn.example.com/pack.png',
  targetType: 'PACKAGE',
  packageId: 7,
  promoCode: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  usePendingPromoStore.getState().clear();
});

describe('CampaignCarousel', () => {
  it('renders nothing when there are no campaigns', () => {
    mockCampaigns = [];
    const { toJSON } = render(<CampaignCarousel />);
    expect(toJSON()).toBeNull();
  });

  it('shows which offer is on screen when there are several', () => {
    mockCampaigns = [WELCOME, PACK];
    const { getByText } = render(<CampaignCarousel />);
    expect(getByText('Offer · 1 of 2')).toBeTruthy();
  });

  it('labels a lone offer without a count', () => {
    mockCampaigns = [WELCOME];
    const { getByText, queryByText } = render(<CampaignCarousel />);
    expect(getByText('Offer')).toBeTruthy();
    expect(queryByText(/of 1/)).toBeNull();
  });

  it('opens booking with the promo code when a promo banner is tapped', () => {
    mockCampaigns = [WELCOME, PACK];
    const { getByLabelText } = render(<CampaignCarousel />);

    fireEvent.press(getByLabelText('Welcome offer. 20% off your first booking'));

    expect(mockClick).toHaveBeenCalledWith(1);
    expect(usePendingPromoStore.getState().pendingPromoCode).toBe('WELCOME20');
    expect(mockPush).toHaveBeenCalledWith('/(parent)/book/booking-date-picker');
  });

  it('opens package checkout when a package banner is tapped', () => {
    mockCampaigns = [WELCOME, PACK];
    const { getByLabelText } = render(<CampaignCarousel />);

    fireEvent.press(getByLabelText('10-hour pack'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(parent)/packages/checkout',
      params: { packageId: '7' },
    });
  });
});
