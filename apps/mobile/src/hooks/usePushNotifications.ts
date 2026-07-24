import { useEffect } from 'react';
import { NativeModules, Platform } from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { api, unwrap } from '@mobile/lib/api';
import { navigateToBookingDetail, shouldFocusCareLogFromPushData } from '@mobile/lib/notificationNavigation';
import { PENDING_RATING_KEY } from '@mobile/hooks/usePendingRating';
import { useAuthStore } from '@mobile/store/authStore';
import { useMessagingStore } from '@mobile/store/messagingStore';

type FirebaseMessaging = {
  requestPermission: () => Promise<number>;
  getToken: () => Promise<string>;
  onMessage: (
    handler: (msg: {
      notification?: { title?: string; body?: string };
      data?: Record<string, string>;
    }) => void,
  ) => () => void;
  onNotificationOpenedApp: (
    handler: (msg: { data?: Record<string, string> }) => void,
  ) => () => void;
  getInitialNotification: () => Promise<{ data?: Record<string, string> } | null>;
};

type ExpoNotificationsModule = typeof import('expo-notifications');

/** Push requires a dev/production native build — not Expo Go. */
export function isNativePushAvailable(): boolean {
  if (Constants.executionEnvironment === 'storeClient') {
    return false;
  }
  return Boolean(NativeModules.RNFBAppModule);
}

function getMessagingModule(): (() => FirebaseMessaging) | null {
  if (!isNativePushAvailable()) return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-firebase/messaging').default as () => FirebaseMessaging;
  } catch {
    return null;
  }
}

function loadExpoNotifications(): ExpoNotificationsModule | null {
  if (!isNativePushAvailable()) return null;

  try {
    // Lazy import avoids Expo Go side effects from expo-notifications on module load.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-notifications') as ExpoNotificationsModule;
  } catch {
    return null;
  }
}

function configureNotificationHandler(Notifications: ExpoNotificationsModule): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

async function registerTokenWithBackend(token: string) {
  await unwrap(
    api.post('/devices/push-token', {
      token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    }),
  );
}

export function isBookingCompletedPush(data?: Record<string, string>): boolean {
  const type = data?.['type']?.toLowerCase();
  return type === 'booking_completed';
}

function navigateFromNotification(
  router: ReturnType<typeof useRouter>,
  queryClient: ReturnType<typeof useQueryClient>,
  data?: Record<string, string>,
) {
  const conversationId = data?.['conversationId'];
  if (conversationId) {
    router.push({
      pathname: '/(parent)/chat/messaging',
      params: { conversationId },
    });
    return;
  }

  // A completed-booking tap should drive the mandatory rating prompt, not the
  // booking detail. Invalidating lets usePendingRating re-detect and open the sheet.
  if (isBookingCompletedPush(data)) {
    void queryClient.invalidateQueries({ queryKey: PENDING_RATING_KEY });
    router.push('/(parent)/home' as never);
    return;
  }

  // "Your nanny can stay" is the one push that needs money from the parent, so
  // it goes straight to the extension checkout rather than the booking detail.
  const extensionId = data?.['extensionId'];
  if (data?.['type'] === 'booking_extension_accepted' && extensionId) {
    router.push({
      pathname: '/(parent)/book/extension-checkout',
      params: { extensionId },
    } as never);
    return;
  }

  const bookingId = data?.['bookingId'];
  if (bookingId) {
    navigateToBookingDetail(router, Number(bookingId), {
      focusCareLog: shouldFocusCareLogFromPushData(data),
    });
    return;
  }

  const notificationType = data?.['type'];
  if (notificationType === 'nanny_checkin') {
    router.push('/(parent)/bookings' as never);
  }
}

export async function requestPushPermissionAndRegister(): Promise<boolean> {
  if (!isNativePushAvailable()) return false;

  const messagingFactory = getMessagingModule();
  if (!messagingFactory) return false;

  try {
    const messaging = messagingFactory();
    const Notifications = loadExpoNotifications();

    const authStatus = await messaging.requestPermission();
    const enabled = authStatus === 1 || authStatus === 2;
    if (!enabled) return false;

    if (Notifications) {
      configureNotificationHandler(Notifications);
      await Notifications.requestPermissionsAsync();
    }

    const token = await messaging.getToken();
    if (token) {
      await registerTokenWithBackend(token);
    }

    return true;
  } catch {
    return false;
  }
}

export function usePushNotifications() {
  const firebaseUser = useAuthStore((s) => s.user);
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!firebaseUser || !isNativePushAvailable()) return;

    let unsubscribeOnMessage: (() => void) | undefined;
    let unsubscribeOpened: (() => void) | undefined;
    let subscription: { remove: () => void } | undefined;

    const messagingFactory = getMessagingModule();
    const Notifications = loadExpoNotifications();
    if (!messagingFactory) return;

    if (Notifications) {
      configureNotificationHandler(Notifications);
    }

    void requestPushPermissionAndRegister().catch(() => undefined);

    try {
      const messaging = messagingFactory();

      unsubscribeOnMessage = messaging.onMessage((message) => {
        const incomingConversationId = message.data?.['conversationId'];
        const activeConversationId = useMessagingStore.getState().activeConversationId;
        if (incomingConversationId && incomingConversationId === activeConversationId) {
          queryClient.invalidateQueries({
            queryKey: ['messaging', 'messages', incomingConversationId],
          });
          return;
        }
        queryClient.invalidateQueries({ queryKey: ['messaging'] });
        queryClient.invalidateQueries({ queryKey: ['notifications'] });

        if (isBookingCompletedPush(message.data)) {
          queryClient.invalidateQueries({ queryKey: PENDING_RATING_KEY });
        }
      });

      unsubscribeOpened = messaging.onNotificationOpenedApp((message) => {
        navigateFromNotification(router, queryClient, message.data);
      });

      void messaging.getInitialNotification().then((message) => {
        if (message?.data) {
          navigateFromNotification(router, queryClient, message.data);
        }
      });

      if (Notifications) {
        subscription = Notifications.addNotificationResponseReceivedListener((response) => {
          const data = response.notification.request.content.data as
            | Record<string, string>
            | undefined;
          navigateFromNotification(router, queryClient, data);
        });
      }
    } catch {
      return undefined;
    }

    return () => {
      unsubscribeOnMessage?.();
      unsubscribeOpened?.();
      subscription?.remove();
    };
  }, [firebaseUser, queryClient, router]);
}
