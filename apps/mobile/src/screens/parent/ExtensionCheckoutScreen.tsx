import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StatusBar,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';
import type { WebViewNavigation } from 'react-native-webview';

import { colors } from '@mobile/theme';
import { useBookingExtension, useExtensionPaymobCheckout } from '@mobile/hooks/useBookings';
import { getApiErrorMessage } from '@mobile/lib/api';
import { formatMoney } from '@mobile/lib/formatMoney';
import {
  buildPaymobCheckoutUrl,
  PAYMOB_CHECKOUT_VIEWPORT_FIX,
} from '@mobile/lib/paymobCheckout';
import { isPaymobPaymentRedirect } from '@mobile/lib/paymobRedirect';
import { styles } from './styles/extension-checkout-screen.styles';

/**
 * Paymob checkout for extra hours on a shift that is already running.
 *
 * Same machinery as the booking checkout, but deliberately stripped of the
 * nanny and booking summary: she is topping up a visit that is happening right
 * now, so the only thing she needs to confirm is how many hours and how much.
 */
export default function ExtensionCheckoutScreen() {
  const router = useRouter();
  const { extensionId } = useLocalSearchParams<{ extensionId?: string }>();

  const startedRef = useRef(false);
  const redirectHandledRef = useRef(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(true);
  // Mount the WebView only once the wrapper height settles — Paymob's sheet
  // reads window.innerHeight once at bind time and never re-measures.
  const [wrapHeight, setWrapHeight] = useState(0);

  const id = extensionId ? Number(extensionId) : undefined;
  const { data: extension } = useBookingExtension(id);
  const checkout = useExtensionPaymobCheckout();

  const goBackToBooking = useCallback(() => {
    setCheckoutUrl(null);
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(parent)/bookings' as never);
  }, [router]);

  const startCheckout = useCallback(async () => {
    if (!id) {
      setLoadError('Missing extension. Go back and try again.');
      setIsStarting(false);
      return;
    }
    setIsStarting(true);
    setLoadError(null);
    try {
      const session = await checkout.mutateAsync({ extensionId: id });
      setCheckoutUrl(buildPaymobCheckoutUrl(session.publicKey, session.clientSecret));
    } catch (err) {
      setLoadError(getApiErrorMessage(err, 'Payment failed. Please try again.'));
    } finally {
      setIsStarting(false);
    }
    // `checkout` is a fresh mutation object each render; depending on it would
    // restart the checkout on every state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!id || startedRef.current) return;
    startedRef.current = true;
    redirectHandledRef.current = false;
    void startCheckout();
  }, [id, startCheckout]);

  const handlePaymentRedirect = useCallback(
    (url: string) => {
      if (redirectHandledRef.current) return false;
      if (!isPaymobPaymentRedirect(url)) return false;
      redirectHandledRef.current = true;
      // The webhook is what actually applies the extension; the booking screen
      // re-reads it on focus, so simply returning there shows the new end time.
      goBackToBooking();
      return true;
    },
    [goBackToBooking],
  );

  if (!id) {
    return (
      <View style={[styles.container, styles.centeredState]}>
        <Text style={styles.missingParamsText}>This extension is no longer awaiting payment.</Text>
        <Pressable style={styles.retryBtn} onPress={goBackToBooking}>
          <Text style={styles.retryBtnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const hours = extension?.hours ?? 0;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Pressable style={styles.headerIconBtn} onPress={goBackToBooking}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Extra hours</Text>
          <View style={styles.headerIconBtn} />
        </View>
      </View>

      <View style={styles.introSection}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>
            {hours} extra hour{hours === 1 ? '' : 's'}
          </Text>
          <Text style={styles.summaryValue}>
            {extension ? formatMoney(extension.totalAmount) : '—'}
          </Text>
        </View>
        <Text style={styles.summaryNote}>
          Your booking's end time updates as soon as this payment goes through.
        </Text>
      </View>

      <View
        style={styles.webviewWrap}
        onLayout={(e) => {
          const h = Math.round(e.nativeEvent.layout.height);
          // First settled height only — later fluctuations (the Android
          // keyboard) must not remount and reload the checkout.
          setWrapHeight((prev) => (prev === 0 ? h : prev));
        }}
      >
        {isStarting && (
          <View style={styles.webviewLoading}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.webviewLoadingText}>Preparing checkout…</Text>
          </View>
        )}

        {loadError && !isStarting && (
          <View style={styles.webviewLoading}>
            <Text style={styles.errorText}>{loadError}</Text>
            <Pressable
              style={styles.retryBtn}
              onPress={() => {
                redirectHandledRef.current = false;
                void startCheckout();
              }}
            >
              <Text style={styles.retryBtnText}>Try again</Text>
            </Pressable>
          </View>
        )}

        {checkoutUrl && !loadError && wrapHeight > 0 && (
          <WebView
            key={`extension-checkout-${wrapHeight}`}
            source={{ uri: checkoutUrl }}
            style={styles.webview}
            onNavigationStateChange={(event: WebViewNavigation) =>
              handlePaymentRedirect(event.url)
            }
            // iOS: onShouldStartLoadWithRequest can only approve main-frame
            // navigations, so Paymob's card-field iframe gets cancelled and the
            // form collapses. onNavigationStateChange still catches the return.
            {...(Platform.OS === 'ios'
              ? {}
              : {
                  onShouldStartLoadWithRequest: (request: WebViewNavigation) =>
                    !handlePaymentRedirect(request.url),
                })}
            injectedJavaScript={PAYMOB_CHECKOUT_VIEWPORT_FIX}
            injectedJavaScriptBeforeContentLoaded={PAYMOB_CHECKOUT_VIEWPORT_FIX}
            onError={() =>
              setLoadError(
                "Can't reach the payment page. Make sure your device is online, then try again.",
              )
            }
          />
        )}
      </View>
    </View>
  );
}
