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



import BookingStepProgress from '@mobile/components/BookingStepProgress';

import { colors } from '@mobile/theme';

import { usePaymobCheckout } from '@mobile/hooks/useBookings';

import {

  bookingFlowRetryParams,

  getBookingDateDisplay,

  getBookingDurationHours,

  getBookingTimeDisplay,

  type BookingFlowParams,

} from '@mobile/lib/bookingDraft';

import { getApiErrorMessage } from '@mobile/lib/api';
import {
  buildPaymobCheckoutUrl,
  PAYMOB_CHECKOUT_VIEWPORT_FIX,
} from '@mobile/lib/paymobCheckout';

import { extractBookingIdFromRedirect, isPaymobPaymentRedirect } from '@mobile/lib/paymobRedirect';

import { styles } from './styles/booking-step3-screen.styles';




function isRetryCheckout(params: BookingFlowParams): boolean {

  const id = params.bookingId?.trim();

  return (

    (params.retry === '1' || params.retry === 'true') &&

    !!id

  );

}



export default function BookingStep3Screen() {

  const router = useRouter();

  const params = useLocalSearchParams<BookingFlowParams>();

  const startedRef = useRef(false);

  const redirectHandledRef = useRef(false);



  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  const [bookingId, setBookingId] = useState<string | null>(params.bookingId ?? null);

  const [loadError, setLoadError] = useState<string | null>(null);

  const [isStarting, setIsStarting] = useState(true);

  // Measured height of the WebView wrapper. The WebView mounts only after
  // this settles so Paymob's sheet measures the final viewport (it reads
  // window.innerHeight once at bind time and never re-measures).
  const [wrapHeight, setWrapHeight] = useState(0);



  const paymobCheckout = usePaymobCheckout();

  const retryMode = isRetryCheckout(params);

  // Payment-only screen — it never creates a booking, so it needs an existing one.
  const draftReady = retryMode;



  const goToPaymentResult = useCallback(

    (id: string) => {

      setCheckoutUrl(null);

      router.replace({

        pathname: '/(parent)/book/payment-result',

        params: {

          bookingId: id,

          ...bookingFlowRetryParams(params, Number(id)),

        },

      } as never);

    },

    [params, router],

  );



  const openPaymobCheckout = useCallback(

    async (id: string) => {

      const session = await paymobCheckout.mutateAsync({ bookingId: Number(id) });

      setCheckoutUrl(buildPaymobCheckoutUrl(session.publicKey, session.clientSecret));

    },

    [paymobCheckout],

  );



  const resumeCheckout = useCallback(async () => {

    const id = params.bookingId ?? bookingId;

    if (!id) {

      setLoadError('Missing booking. Go back and try again.');

      setIsStarting(false);

      return;

    }



    setIsStarting(true);

    setLoadError(null);

    setBookingId(id);



    try {

      await openPaymobCheckout(id);

    } catch (err) {

      setLoadError(getApiErrorMessage(err, 'Payment failed. Please try again.'));

    } finally {

      setIsStarting(false);

    }

  }, [bookingId, openPaymobCheckout, params.bookingId]);



  useEffect(() => {

    if (!draftReady || startedRef.current) return;

    startedRef.current = true;

    redirectHandledRef.current = false;

    void resumeCheckout();

  }, [draftReady, resumeCheckout]);



  const handlePaymentRedirect = useCallback(

    (url: string) => {

      if (redirectHandledRef.current) return false;

      const hint = isPaymobPaymentRedirect(url);

      if (!hint) return false;

      const id = extractBookingIdFromRedirect(url) ?? bookingId;

      if (!id) return false;

      redirectHandledRef.current = true;

      setCheckoutUrl(null);

      goToPaymentResult(id);

      return true;

    },

    [bookingId, goToPaymentResult],

  );



  const handleWebViewNavigation = (event: WebViewNavigation) => {

    handlePaymentRedirect(event.url);

  };



  const handleShouldStartLoad = (url: string) => {

    if (handlePaymentRedirect(url)) return false;

    return true;

  };



  const handleWebViewError = useCallback(() => {

    setLoadError(

      "Can't reach the payment page. Make sure your device is online and can open external websites, then try again.",

    );

  }, []);



  if (!draftReady) {

    return (

      <View style={[styles.container, styles.centeredState]}>

        <Text style={styles.missingParamsText}>This booking is no longer awaiting payment.</Text>

        <Pressable style={styles.missingParamsBtn} onPress={() => router.back()}>

          <Text style={styles.missingParamsBtnText}>Go back</Text>

        </Pressable>

      </View>

    );

  }



  const dateDisplay = getBookingDateDisplay(params);

  const timeDisplay = getBookingTimeDisplay(params);

  const hours = getBookingDurationHours(params);

  const nannyName = params.nannyName?.trim() || 'Care request';

  const instructions = params.instructions?.trim() ?? '';



  return (

    <View style={styles.container}>

      <StatusBar barStyle="dark-content" />



      <View style={styles.header}>

        <View style={styles.headerRow}>

          <Pressable style={styles.headerIconBtn} onPress={() => router.back()}>

            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />

          </Pressable>

          <Text style={styles.headerTitle}>Payment</Text>

          <View style={styles.headerIconBtn} />

        </View>

      </View>



      <View style={styles.introSection}>
        <BookingStepProgress step={3} centered compact />
        <Text style={styles.checkoutSummary} numberOfLines={1}>
          {nannyName} · {dateDisplay} · {timeDisplay} · {hours}h
        </Text>
        {instructions ? (
          <Text style={styles.instructionsCompact} numberOfLines={2}>
            Instructions: {instructions}
          </Text>
        ) : null}
      </View>



      <View
        style={styles.webviewWrap}
        onLayout={(e) => {
          const h = Math.round(e.nativeEvent.layout.height);
          // Capture the first settled height only — later fluctuations (e.g.
          // the keyboard on Android) must not remount/reload the checkout.
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

                void resumeCheckout();

              }}

            >

              <Text style={styles.retryBtnText}>Try again</Text>

            </Pressable>

          </View>

        )}



        {checkoutUrl && !loadError && wrapHeight > 0 && (

          <WebView

            key={`checkout-${wrapHeight}`}

            source={{ uri: checkoutUrl }}

            onNavigationStateChange={handleWebViewNavigation}

            // iOS: react-native-webview's onShouldStartLoadWithRequest can only
            // approve main-frame navigations — subframe loads (Paymob's
            // about:srcdoc card-field iframe) get cancelled, collapsing the
            // card form. onNavigationStateChange above still catches the
            // /paymob/return redirect, so skip the handler on iOS.
            {...(Platform.OS === 'ios'
              ? {}
              : {
                  onShouldStartLoadWithRequest: (request: WebViewNavigation) =>
                    handleShouldStartLoad(request.url),
                })}

            onMessage={(event) => {
              // eslint-disable-next-line no-console
              console.log('[paymob-checkout]', event.nativeEvent.data);
            }}

            onError={handleWebViewError}

            onHttpError={handleWebViewError}

            originWhitelist={['*']}

            applicationNameForUserAgent="Version/17.2 Mobile/15E148 Safari/604.1"

            webviewDebuggingEnabled={__DEV__}

            sharedCookiesEnabled

            injectedJavaScript={PAYMOB_CHECKOUT_VIEWPORT_FIX}

            injectedJavaScriptBeforeContentLoaded={PAYMOB_CHECKOUT_VIEWPORT_FIX}

            scalesPageToFit={false}

            setSupportMultipleWindows={false}

            automaticallyAdjustContentInsets={false}

            contentInsetAdjustmentBehavior="never"

            bounces={false}

            startInLoadingState

            renderLoading={() => (

              <View style={styles.webviewLoading}>

                <ActivityIndicator color={colors.primary} />

              </View>

            )}

            style={styles.webview}

          />

        )}

      </View>

    </View>

  );

}


