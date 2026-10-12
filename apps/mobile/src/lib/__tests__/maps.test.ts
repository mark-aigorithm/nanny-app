import { Platform } from 'react-native';

import { isMapAvailable } from '../maps';

let mockConfig: Record<string, unknown> = {};
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return mockConfig;
    },
  },
}));

const originalOS = Platform.OS;
afterEach(() => {
  Platform.OS = originalOS;
});

describe('isMapAvailable', () => {
  beforeEach(() => {
    Platform.OS = 'android';
  });

  it('shows the map on Android when the build published a Maps key', () => {
    // What a real build embeds: Expo has already stripped android.config.
    mockConfig = { android: { package: 'com.nannyapp.mobile' }, extra: { googleMapsEnabled: true } };
    expect(isMapAvailable()).toBe(true);
  });

  it('leaves the map out on Android for a build without a key', () => {
    mockConfig = { extra: { googleMapsEnabled: false } };
    expect(isMapAvailable()).toBe(false);
  });

  it('always shows the map on iOS (Apple Maps needs no key)', () => {
    Platform.OS = 'ios';
    mockConfig = { extra: {} };
    expect(isMapAvailable()).toBe(true);
  });
});
