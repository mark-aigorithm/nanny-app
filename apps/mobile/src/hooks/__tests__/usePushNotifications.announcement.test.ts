// Explicit mocks: this file must not depend on the global stub for firebase
// (importing the hook pulls in `@mobile/lib/api`, which initialises the SDK).
jest.mock('@mobile/lib/firebase', () => ({ auth: () => ({ currentUser: null }) }));
jest.mock('@react-native-firebase/messaging', () => ({
  __esModule: true,
  default: () => ({
    requestPermission: jest.fn(),
    getToken: jest.fn(),
    onMessage: jest.fn(),
    onNotificationOpenedApp: jest.fn(),
    getInitialNotification: jest.fn(),
  }),
}), { virtual: true });

import { useUserProfileStore } from '@mobile/store/userProfileStore';

const mockOpenPromoLink = jest.fn();
jest.mock('@mobile/lib/openPromoLink', () => ({
  openPromoLink: (...args: unknown[]) => mockOpenPromoLink(...args),
}));

import { navigateFromNotification } from '@mobile/hooks/usePushNotifications';

const ON_HOME = ['(parent)', '(tabs)', 'home'];
const queryClient = { invalidateQueries: jest.fn() };

function makeRouter() {
  return { push: jest.fn(), navigate: jest.fn(), dismissTo: jest.fn() };
}

beforeEach(() => {
  jest.clearAllMocks();
  useUserProfileStore.setState({ profile: null });
});

describe('announcement push tap', () => {
  it('opens the booking flow with the code from a promo announcement', () => {
    const router = makeRouter();
    navigateFromNotification(router as never, ON_HOME, queryClient as never, {
      type: 'ANNOUNCEMENT',
      broadcastId: '3',
      targetType: 'PROMO_CODE',
      promoCode: 'SAVE20',
    });
    expect(mockOpenPromoLink).toHaveBeenCalledWith(router, { type: 'promo_code', code: 'SAVE20' });
  });

  it('opens the package from a package announcement', () => {
    const router = makeRouter();
    navigateFromNotification(router as never, ON_HOME, queryClient as never, {
      type: 'ANNOUNCEMENT',
      broadcastId: '3',
      targetType: 'PACKAGE',
      packageId: '7',
    });
    expect(mockOpenPromoLink).toHaveBeenCalledWith(router, { type: 'package', packageId: 7 });
  });

  it('opens the notifications tab when the announcement has no link', () => {
    const router = makeRouter();
    navigateFromNotification(router as never, ON_HOME, queryClient as never, {
      type: 'ANNOUNCEMENT',
      broadcastId: '3',
    });
    expect(mockOpenPromoLink).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith('/(parent)/(tabs)/notifications');
  });

  it('waits for her profile on a cold start, then opens the link', () => {
    const router = makeRouter();
    navigateFromNotification(router as never, [], queryClient as never, {
      type: 'ANNOUNCEMENT',
      broadcastId: '3',
      targetType: 'PROMO_CODE',
      promoCode: 'SAVE20',
    });
    expect(mockOpenPromoLink).not.toHaveBeenCalled();

    useUserProfileStore.setState({ profile: { id: 1, role: 'MOTHER' } as never });
    expect(mockOpenPromoLink).toHaveBeenCalledWith(router, { type: 'promo_code', code: 'SAVE20' });
  });

  it('does nothing in the nanny app', () => {
    const router = makeRouter();
    navigateFromNotification(router as never, ['(nanny)', '(tabs)', 'dashboard'], queryClient as never, {
      type: 'ANNOUNCEMENT',
      broadcastId: '3',
      targetType: 'PROMO_CODE',
      promoCode: 'SAVE20',
    });
    expect(mockOpenPromoLink).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(router.dismissTo).not.toHaveBeenCalled();
  });
});
