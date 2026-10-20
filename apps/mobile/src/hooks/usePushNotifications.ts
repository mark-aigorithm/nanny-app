import { useEffect, useRef } from 'react';
import { NativeModules, Platform } from 'react-native';
import Constants from 'expo-constants';
import { useRouter, useSegments } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { api, unwrap } from '@mobile/lib/api';
import {
  bookingChatRoleFor,
  isBookingMessagePush,
  announcementLinkFromPush,
  isAnnouncementPush,
  isSurveyPush,
  navigateToBookingChat,
  navigateToBookingDetail,
  navigateToSurvey,
  shouldFocusCareLogFromPushData,
} from '@mobile/lib/notificationNavigation';
import { BOOKING_CHAT_KEY } from '@mobile/hooks/useBookingChat';
import { openPromoLink } from '@mobile/lib/openPromoLink';
import { goToParentTab } from '@mobile/lib/parentNav';
import { PENDING_RATING_KEY } from '@mobile/hooks/usePendingRating';
import { PENDING_SURVEYS_KEY } from '@mobile/hooks/useSurveys';
import { useAuthStore } from '@mobile/store/authStore';
import { useMessagingStore } from '@mobile/store/messagingStore';
import { useUserProfileStore } from '@mobile/store/userProfileStore';

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

async function unregisterTokenWithBackend(token: string) {
  await unwrap(api.delete('/devices/push-token', { data: { token } }));
}

/**
 * Releases this device's FCM token from the signed-in user's account.
 *
 * Must run *before* `auth().signOut()`: the axios interceptor signs the request
 * with `auth().currentUser`'s JWT, which is gone the moment sign-out completes.
 * Without it the token stays live against the previous account, so on a shared
 * or resold device the next person keeps receiving their pushes.
 *
 * Mirrors `requestPushPermissionAndRegister` — same native-push guard, and it
 * swallows every failure so a dead network can never trap a user in a
 * signed-in session.
 */
export async function unregisterPushToken(): Promise<boolean> {
  if (!isNativePushAvailable()) return false;

  const messagingFactory = getMessagingModule();
  if (!messagingFactory) return false;

  try {
    const token = await messagingFactory().getToken();
    if (!token) return false;

    await unregisterTokenWithBackend(token);
    return true;
  } catch {
    return false;
  }
}

export function isBookingCompletedPush(data?: Record<string, string>): boolean {
  const type = data?.['type']?.toLowerCase();
  return type === 'booking_completed';
}

export function isExtensionDeclinedPush(data?: Record<string, string>): boolean {
  const type = data?.['type']?.toLowerCase();
  return type === 'booking_extension_declined';
}

const ACCOUNT_STATUS_PUSHES = new Set([
  'id_reupload_requested',
  'nanny_rejected',
  'nanny_approved',
  'id_rejected',
  'id_approved',
]);

/** A push that changed her approval status — the profile must be re-read. */
export function isAccountStatusPush(data?: Record<string, string>): boolean {
  const type = data?.['type']?.toLowerCase();
  return type !== undefined && ACCOUNT_STATUS_PUSHES.has(type);
}

/**
 * Runs `open` with the role she is in. On a cold start from a tap nothing says
 * yet whether she is a mother or a nanny (neither route group has mounted and
 * the profile has not loaded), so it waits for her profile instead of pushing
 * a route the root gate would drop.
 */
function openWhenRoleKnown(
  segments: readonly string[],
  open: (role: 'parent' | 'nanny') => void,
): void {
  const inRoleGroup = segments[0] === '(nanny)' || segments[0] === '(parent)';
  const profileRole = useUserProfileStore.getState().profile?.role;
  if (inRoleGroup || profileRole) {
    open(bookingChatRoleFor(segments, profileRole));
    return;
  }
  const unsubscribe = useUserProfileStore.subscribe((state) => {
    if (!state.profile) return;
    unsubscribe();
    open(bookingChatRoleFor([], state.profile.role));
  });
}

/** Where a tapped push opens. Exported for its tests. */
export function navigateFromNotification(
  router: ReturnType<typeof useRouter>,
  segments: readonly string[],
  queryClient: ReturnType<typeof useQueryClient>,
  data?: Record<string, string>,
) {
  if (isAccountStatusPush(data)) {
    void queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
  }

  if (isSurveyPush(data)) {
    void queryClient.invalidateQueries({ queryKey: PENDING_SURVEYS_KEY });
    openWhenRoleKnown(segments, (role) => {
      if (role === 'parent') navigateToSurvey(router, Number(data!['surveyId']));
    });
    return;
  }

  // An admin announcement: its package or promo-code link opens exactly as the
  // inbox card and the Home banners do; without a link the inbox is where she
  // reads it. Mothers only — the backend never sends one to a nanny, and a
  // stale token on a shared device must not open the parent flow there.
  if (isAnnouncementPush(data)) {
    const link = announcementLinkFromPush(data);
    openWhenRoleKnown(segments, (role) => {
      if (role !== 'parent') return;
      if (link) openPromoLink(router, link);
      else goToParentTab(router, segments, '/(parent)/(tabs)/notifications');
    });
    return;
  }

  if (isBookingMessagePush(data)) {
    const bookingId = Number(data!['bookingId']);
    openWhenRoleKnown(segments, (role) => navigateToBookingChat(router, bookingId, role));
    return;
  }

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
    goToParentTab(router, segments, '/(parent)/(tabs)/home');
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

  // "Your nanny can't stay" is a dead end for that booking, so the tap starts
  // a new one rather than landing her back on the shift she can't extend.
  if (isExtensionDeclinedPush(data)) {
    router.push('/(parent)/book/booking-date-picker' as never);
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
    goToParentTab(router, segments, '/(parent)/(tabs)/bookings');
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
  // Read when a tap arrives, not when the listeners were attached: where she
  // is decides how a tab is reached (see goToParentTab).
  const segments = useSegments();
  const segmentsRef = useRef<readonly string[]>(segments);
  segmentsRef.current = segments;

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
        if (isSurveyPush(message.data)) {
          queryClient.invalidateQueries({ queryKey: PENDING_SURVEYS_KEY });
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
          return;
        }
        if (isBookingMessagePush(message.data)) {
          const bookingId = message.data?.['bookingId'];
          void queryClient.invalidateQueries({ queryKey: [BOOKING_CHAT_KEY] });
          // Her chat with this booking is on screen: the refetch is enough.
          if (bookingId === useMessagingStore.getState().activeBookingChatId) return;
          void queryClient.invalidateQueries({ queryKey: ['notifications'] });
          return;
        }
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

        if (isAccountStatusPush(message.data)) {
          queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
        }
      });

      unsubscribeOpened = messaging.onNotificationOpenedApp((message) => {
        navigateFromNotification(router, segmentsRef.current, queryClient, message.data);
      });

      void messaging.getInitialNotification().then((message) => {
        if (message?.data) {
          navigateFromNotification(router, segmentsRef.current, queryClient, message.data);
        }
      });

      if (Notifications) {
        subscription = Notifications.addNotificationResponseReceivedListener((response) => {
          const data = response.notification.request.content.data as
            | Record<string, string>
            | undefined;
          navigateFromNotification(router, segmentsRef.current, queryClient, data);
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
