/* TEMPORARY — visual-validation harness. Delete after screenshots. */
import React from 'react';
import { ScrollView, View } from 'react-native';
import type { BookingExtensionResponse, BookingResponse } from '@nanny-app/shared';

import ParentShiftControlsCard from '@mobile/components/ParentShiftControlsCard';
import { useUserProfileStore } from '@mobile/store/userProfileStore';
import { colors, spacing } from '@mobile/theme';
import { mockBooking, PreviewProviders } from './harness';

// The card is mother-only, so seed the role it gates on.
useUserProfileStore.setState({
  profile: { role: 'MOTHER' } as never,
});

function mockExtension(
  overrides: Partial<BookingExtensionResponse> = {},
): BookingExtensionResponse {
  return {
    id: 77,
    bookingId: 1,
    status: 'PENDING_NANNY',
    hours: 2,
    newEndTime: new Date().toISOString(),
    hourlyRate: 120,
    subtotal: 240,
    discountAmount: 0,
    packageHoursApplied: 0,
    packageSkillsCovered: 0,
    packageCreditAmount: 0,
    rewardCreditHoursApplied: 0,
    rewardCreditPoints: 0,
    rewardCreditAmount: 0,
    totalAmount: 240,
    nannyAmount: 168,
    requestedAt: new Date().toISOString(),
    nannyRespondedAt: null,
    expiresAt: new Date(Date.now() + 13 * 60_000).toISOString(),
    paidAt: null,
    ...overrides,
  };
}

function running(overrides: Partial<BookingResponse> = {}): BookingResponse {
  return mockBooking({
    status: 'IN_PROGRESS',
    nanny: {
      nannyProfileId: 19,
      firstName: 'Elena',
      lastName: 'Nanny',
      avatarUrl: null,
      location: null,
      phone: null,
    },
    canExtend: true,
    extendableHours: [1, 2, 3],
    activeExtension: null,
    ...overrides,
  } as Partial<BookingResponse>);
}

export default function ShiftControlsPreview() {
  return (
    <PreviewProviders>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}
      >
        {/* Idle — the two controls */}
        <ParentShiftControlsCard booking={running()} />

        {/* Waiting on the nanny */}
        <ParentShiftControlsCard
          booking={running({ activeExtension: mockExtension() })}
        />

        {/* Accepted — the one state that needs her to pay */}
        <ParentShiftControlsCard
          booking={running({ activeExtension: mockExtension({ status: 'ACCEPTED' }) })}
        />

        <View style={{ height: spacing['3xl'] }} />
      </ScrollView>
    </PreviewProviders>
  );
}
