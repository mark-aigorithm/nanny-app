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
import { useAdjustmentPaymobCheckout, useBookingAdjustments } from '@mobile/hooks/useBookings';
import { getApiErrorMessage } from '@mobile/lib/api';
import { formatMoney } from '@mobile/lib/formatMoney';
import {
  buildPaymobCheckoutUrl,
  PAYMOB_CHECKOUT_VIEWPORT_FIX,
} from '@mobile/lib/paymobCheckout';
import { isPaymobPaymentRedirect } from '@mobile/lib/paymobRedirect';
import { styles } from './styles/extension-checkout-screen.styles';

/**
 * Paymob checkout for the difference owed after our team edited a booking she had
 * already paid for. Mirrors the extension checkout: same WebView machinery, a
 * one-line summary of what's owed and why.
 */
export default function AdjustmentCheckoutScreen() {
  const router = useRouter();
  const { adjustmentId, bookingId } = useLocalSearchParams<{
    adjustmentId?: string;
    bookingId?: string;
  }>();

  const startedRef = useRef(false);
  const redirectHandledRef = useRef(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(true);
  const [wrapHeight, setWrapHeight] = useState(0);

  const id = adjustmentId ? Number(adjustmentId) : undefined;
  const parentBookingId = bookingId ? Number(bookingId) : undefined;
  const { data: adjustments } = useBookingAdjustments(parentBookingId);
  const adjustment = adjustments?.find((a) => a.id === id);
  const checkout = useAdjustmentPaymobCheckout();

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
      setLoadError('Missing balance. Go back and try again.');
      setIsStarting(false);
      return;
    }
    setIsStarting(true);
    setLoadError(null);
    try {
      const session = await checkout.mutateAsync({ adjustmentId: id });
      setCheckoutUrl(buildPaymobCheckoutUrl(session.publicKey, session.clientSecret));
    } catch (err) {
      setLoadError(getApiErrorMessage(err, 'Payment failed. Please try again.'));
    } finally {
      setIsStarting(false);
    }
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
      // The webhook marks the adjustment PAID; the booking screen re-reads on focus.
      goBackToBooking();
      return true;
    },
    [goBackToBooking],
  );

  if (!id) {
    return (
      <View style={[styles.container, styles.centeredState]}>
        <Text style={styles.missingParamsText}>This balance is no longer awaiting payment.</Text>
        <Pressable style={styles.retryBtn} onPress={goBackToBooking}>
          <Text style={styles.retryBtnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Pressable style={styles.headerIconBtn} onPress={goBackToBooking}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Balance due</Text>
          <View style={styles.headerIconBtn} />
        </View>
      </View>

      <View style={styles.introSection}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Amount due</Text>
          <Text style={styles.summaryValue}>
            {adjustment ? formatMoney(adjustment.amountEgp) : '—'}
          </Text>
        </View>
        <Text style={styles.summaryNote}>
          {adjustment?.reason
            ? `Your booking was updated (${adjustment.reason}). Pay the difference to keep it confirmed.`
            : 'Your booking total went up after an update. Pay the difference to keep it confirmed.'}
        </Text>
      </View>

      <View
        style={styles.webviewWrap}
        onLayout={(e) => {
          const h = Math.round(e.nativeEvent.layout.height);
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
            key={`adjustment-checkout-${wrapHeight}`}
            source={{ uri: checkoutUrl }}
            style={styles.webview}
            onNavigationStateChange={(event: WebViewNavigation) =>
              handlePaymentRedirect(event.url)
            }
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
