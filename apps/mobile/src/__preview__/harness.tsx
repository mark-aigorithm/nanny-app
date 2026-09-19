/* TEMPORARY — visual-validation harness. Delete after screenshots. */
import React from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  Address,
  BookingOptions,
  BookingResponse,
  PricingConfig,
  RewardConfig,
  RewardWallet,
} from '@nanny-app/shared';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function wall(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}:${pad(d.getSeconds())}`;
}

const now = new Date();
const soon = new Date(now.getTime() + 2 * 3600_000);

export const BOOKING_OPTIONS: BookingOptions = {
  bookingWindowStartHour: 6,
  bookingWindowEndHour: 22,
  minBookingHours: 2,
  maxBookingHours: 12,
  minAdvanceBookingHours: 2,
  cancellationWindowHours: 24,
  timezone: 'Africa/Cairo',
  nowWallClock: wall(now),
  earliestStartWallClock: wall(soon),
};

export const PRICING_CONFIG: PricingConfig = {
  standardHourlyRate: 120,
  serviceFeePercent: 0,
  nannyPercent: 80,
  platformPercent: 20,
  skillAddOns: [
    { id: 1, name: 'Newborn care', feeType: 'FLAT', feeValue: 25 },
    { id: 2, name: 'Special needs', feeType: 'PERCENTAGE', feeValue: 15 },
    { id: 3, name: 'Overnight stay', feeType: 'FLAT', feeValue: 40 },
  ],
  durationRules: [
    { minHours: 6, multiplier: 0.95, label: 'Half day' },
    { minHours: 8, multiplier: 0.9, label: 'Full day' },
  ],
  includedChildrenPerBooking: 2,
  maxChildrenPerBooking: 4,
  extraChildFeeType: 'FLAT',
  extraChildFeeValue: 30,
};

export const REWARD_CONFIG: RewardConfig = {
  enabled: true,
  pointsPerBookedHour: 10,
  redemptionPointsPerHour: 200,
  minRedemptionPoints: 200,
  referralEnabled: true,
  referrerPoints: 500,
  refereePoints: 250,
};

export const REWARD_WALLET: RewardWallet = {
  userId: 1,
  pointsBalance: 640,
  lifetimeEarned: 1200,
  lifetimeRedeemed: 560,
};

const todayIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

export function mockBooking(overrides: Partial<BookingResponse> = {}): BookingResponse {
  return {
    id: 1,
    status: 'PENDING',
    date: todayIso,
    startTime: `${todayIso}T09:00:00+03:00`,
    endTime: `${todayIso}T13:00:00+03:00`,
    durationHours: 4,
    effectiveHourlyRate: 120,
    totalAmount: 480,
    rewardCreditHoursApplied: 0,
    rewardCreditPoints: 0,
    rewardCreditAmount: 0,
    createdAt: new Date(now.getTime() - 132_000).toISOString(),
    ...overrides,
  } as unknown as BookingResponse;
}

export function setPreviewParams(params: Record<string, string>): void {
  (globalThis as unknown as { __PREVIEW_PARAMS__?: Record<string, string> }).__PREVIEW_PARAMS__ =
    params;
}

/** A mother's address book, as the picker and the Addresses screen read it. */
export const ADDRESSES: Address[] = [
  {
    id: 1,
    label: 'Home',
    formattedAddress: '12 Rd 9, Maadi, Cairo Governorate, Egypt',
    governorate: 'Cairo',
    area: 'Maadi',
    street: '12 Road 9',
    building: '4',
    floor: '2',
    apartment: '7',
    landmark: 'Behind Seoudi Market, ring bell 7',
    latitude: 29.9602,
    longitude: 31.2569,
    isDefault: true,
    createdAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 2,
    label: 'Work',
    formattedAddress: 'Smart Village, Giza Governorate, Egypt',
    governorate: 'Giza',
    area: 'Sheikh Zayed',
    street: null,
    building: 'B7',
    floor: '3',
    apartment: null,
    landmark: null,
    latitude: 30.0716,
    longitude: 31.0165,
    isDefault: false,
    createdAt: '2026-09-05T00:00:00.000Z',
  },
];

export function PreviewProviders({
  children,
  bookings = [],
  addresses = ADDRESSES,
}: {
  children: ReactNode;
  bookings?: BookingResponse[];
  addresses?: Address[];
}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(['booking-options'], BOOKING_OPTIONS);
  client.setQueryData(['pricing-config'], PRICING_CONFIG);
  client.setQueryData(['rewards', 'config'], REWARD_CONFIG);
  client.setQueryData(['rewards', 'wallet'], REWARD_WALLET);
  client.setQueryData(['addresses'], addresses);
  bookings.forEach((b) => client.setQueryData(['bookings', b.id], b));

  return (
    <QueryClientProvider client={client}>
      {/* Screens position their header/footer absolutely against a flex:1
          container — without a hard device frame they stretch past the fold. */}
      <View style={{ width: 390, height: 844, overflow: 'hidden' }}>{children}</View>
    </QueryClientProvider>
  );
}
