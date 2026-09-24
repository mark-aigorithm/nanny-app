import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// The step label on each middle screen of the wizard. A Google/Apple sign-up
// skips the email-code and password steps, so it counts fewer steps; the phone
// wizard's labels must stay exactly as they are.

let mockRole = 'parent';
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ role: mockRole }),
}));
// The map and the Places search are native / networked; the label is all that
// matters here.
jest.mock('@mobile/components/HomeLocationMapCard', () => () => null);
jest.mock('@mobile/components/LocationSearchInput', () => () => null);
jest.mock('@mobile/lib/googlePlaces', () => ({ reverseGeocode: jest.fn() }));
// Step 1's native date picker and E2E image helper; neither affects the label.
jest.mock('@react-native-community/datetimepicker', () => () => null);
jest.mock('@mobile/lib/e2eImage', () => ({ e2ePlaceholderImageUri: jest.fn() }));
jest.mock('@mobile/hooks/useNannies', () => ({
  useCertificationCatalog: () => ({ data: [] }),
  useSkillCatalog: () => ({ data: [] }),
}));

import RegistrationStep1Screen from '@mobile/screens/auth/RegistrationStep1Screen';
import RegistrationStep2Screen from '@mobile/screens/auth/RegistrationStep2Screen';
import RegistrationNannyLocationScreen from '@mobile/screens/auth/RegistrationNannyLocationScreen';
import RegistrationNannyIdScreen from '@mobile/screens/auth/RegistrationNannyIdScreen';
import RegistrationNannyDetailsScreen from '@mobile/screens/auth/RegistrationNannyDetailsScreen';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';

function renderScreen(Screen: React.ComponentType) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <Screen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useRegistrationDraftStore.getState().reset();
});

/** The widths of the wizard's progress-bar fills (the 6px-high bars). */
function progressFillWidths(): unknown[] {
  return screen.UNSAFE_root
    .findAll((node) => typeof node.type === 'string' && node.type === 'View')
    .map((node) => StyleSheet.flatten(node.props.style) ?? {})
    .filter((style) => style.height === 6 && typeof style.width === 'string')
    .map((style) => style.width);
}

describe('mother', () => {
  beforeEach(() => {
    mockRole = 'parent';
    useRegistrationDraftStore.setState({ role: 'parent' });
  });

  it('phone wizard: location & preferences is step 4 of 5', async () => {
    renderScreen(RegistrationStep2Screen);
    expect(await screen.findByText('STEP 4 OF 5 — LOCATION & PREFERENCES')).toBeTruthy();
  });

  it('Google/Apple wizard: location & preferences is step 2 of 3', async () => {
    useRegistrationDraftStore.setState({ authProvider: 'google' });
    renderScreen(RegistrationStep2Screen);
    expect(await screen.findByText('STEP 2 OF 3 — LOCATION & PREFERENCES')).toBeTruthy();
  });
});

describe('nanny', () => {
  beforeEach(() => {
    mockRole = 'nanny';
    useRegistrationDraftStore.setState({ role: 'nanny' });
  });

  it('phone wizard: labels are unchanged', async () => {
    renderScreen(RegistrationNannyLocationScreen);
    expect(await screen.findByText('STEP 4 OF 6 — HOME LOCATION')).toBeTruthy();
    screen.unmount();

    renderScreen(RegistrationNannyIdScreen);
    expect(await screen.findByText('VERIFY YOUR IDENTITY')).toBeTruthy();
    screen.unmount();

    renderScreen(RegistrationNannyDetailsScreen);
    expect(await screen.findByText('STEP 6 OF 6 — PROFESSIONAL DETAILS')).toBeTruthy();
  });

  it('Google/Apple wizard: personal info is step 1 of 5, and its bar fills a fifth', async () => {
    useRegistrationDraftStore.setState({ authProvider: 'google' });
    renderScreen(RegistrationStep1Screen);
    expect(await screen.findByText('STEP 1 OF 5 — PERSONAL INFO')).toBeTruthy();
    expect(progressFillWidths()).toEqual(['20%']);
  });

  it('phone wizard: personal info is step 1 of 6, and its bar fills a sixth', async () => {
    renderScreen(RegistrationStep1Screen);
    expect(await screen.findByText('STEP 1 OF 6 — PERSONAL INFO')).toBeTruthy();
    expect(progressFillWidths()).toEqual(['16.6%']);
  });

  it('Google/Apple wizard: location, ID and details are steps 2, 3 and 4 of 5', async () => {
    useRegistrationDraftStore.setState({ authProvider: 'apple' });

    renderScreen(RegistrationNannyLocationScreen);
    expect(await screen.findByText('STEP 2 OF 5 — HOME LOCATION')).toBeTruthy();
    screen.unmount();

    renderScreen(RegistrationNannyIdScreen);
    expect(await screen.findByText('STEP 3 OF 5 — VERIFY YOUR IDENTITY')).toBeTruthy();
    screen.unmount();

    renderScreen(RegistrationNannyDetailsScreen);
    expect(await screen.findByText('STEP 4 OF 5 — PROFESSIONAL DETAILS')).toBeTruthy();
  });
});
