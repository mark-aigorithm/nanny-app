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

import {

  useCreateBooking,

  usePaymobCheckout,

} from '@mobile/hooks/useBookings';

import {

  bookingFlowRetryParams,

  getBookingDateDisplay,

  getBookingDurationHours,

  getBookingTimeDisplay,

  hasRequiredBookingDraft,

  type BookingFlowParams,

} from '@mobile/lib/bookingDraft';

import { getApiErrorMessage } from '@mobile/lib/api';
import { buildPaymobCheckoutUrl } from '@mobile/lib/paymobCheckout';
import { isStandardBookingDateAllowed, STANDARD_BOOKING_SAME_DAY_MESSAGE } from '@nanny-app/shared';

import { extractBookingIdFromRedirect, isPaymobPaymentRedirect } from '@mobile/lib/paymobRedirect';

import { styles } from './styles/booking-step3-screen.styles';



/**
 * Paymob's unified checkout page can render wider than the WebView viewport,
 * making its content overflow horizontally. Force a device-width viewport
 * and clamp horizontal overflow inside the page.
 */
const CHECKOUT_VIEWPORT_FIX = `
(function () {
  function apply() {
    if (!document.head) return false;
    var meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
    if (!document.getElementById('rn-checkout-fit')) {
      var style = document.createElement('style');
      style.id = 'rn-checkout-fit';
      style.innerHTML = 'html, body { overflow-x: hidden !important; max-width: 100vw !important; } iframe { max-width: 100vw !important; }';
      document.head.appendChild(style);
    }
    return true;
  }
  if (!apply()) {
    document.addEventListener('DOMContentLoaded', apply);
  }
  // Re-assert after focus: iOS re-evaluates zoom when inputs focus.
  document.addEventListener('focusin', apply, true);

  // The keyboard opening/closing changes window.innerHeight; Paymob lays
  // out against whatever it measures at that moment and doesn't recover
  // when the keyboard hides. Re-nudge around every focus change.
  function scheduleNudges() {
    [120, 450, 900].forEach(function (ms) {
      setTimeout(function () {
        try {
          window.dispatchEvent(new Event('resize'));
          if (window.visualViewport) {
            window.visualViewport.dispatchEvent(new Event('resize'));
          }
        } catch (e) { /* noop */ }
      }, ms);
    });
  }
  document.addEventListener('focusin', scheduleNudges, true);
  document.addEventListener('focusout', scheduleNudges, true);

  // Paymob's sheet measures window.innerHeight once when it binds and never
  // re-measures. The RN WebView's frame can settle to a smaller size right
  // after mount, leaving the sheet laid out for the stale, taller viewport
  // (content pushed below the visible area). Nudge it to re-measure.
  function nudgeResize() {
    try {
      window.dispatchEvent(new Event('resize'));
      if (window.visualViewport) {
        window.visualViewport.dispatchEvent(new Event('resize'));
      }
    } catch (e) { /* noop */ }
  }
  function debugReport(tag) {
    if (!window.ReactNativeWebView) return;
    try {
      var frames = document.querySelectorAll('iframe');
      var info = [];
      for (var i = 0; i < frames.length; i++) {
        var f = frames[i];
        var inner = -1;
        var innerH = -1;
        try {
          if (f.contentDocument && f.contentDocument.body) {
            inner = f.contentDocument.body.children.length;
            innerH = f.contentDocument.body.scrollHeight;
          }
        } catch (x) { inner = -2; }
        var cs = window.getComputedStyle(f);
        info.push({
          src: f.getAttribute('srcdoc') ? 'srcdoc' : (f.src || '').slice(0, 60),
          w: f.offsetWidth,
          h: f.offsetHeight,
          disp: cs.display,
          vis: cs.visibility,
          kids: inner,
          innerH: innerH,
          parentH: f.parentElement ? f.parentElement.offsetHeight : -1,
        });
      }
      var txt = document.body ? document.body.innerText.replace(/\\s+/g, ' ').slice(0, 160) : '';
      window.ReactNativeWebView.postMessage(JSON.stringify({
        dbg: tag,
        url: location.href.slice(0, 100),
        bodyH: document.body ? document.body.scrollHeight : -1,
        winH: window.innerHeight,
        inputs: document.querySelectorAll('input').length,
        text: txt,
        iframes: info,
      }));
    } catch (e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ dbg: tag, err: String(e) }));
    }
  }
  window.addEventListener('error', function (e) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ dbg: 'js-error', msg: String(e.message).slice(0, 300) }));
    }
  });
  var tries = 0;
  var timer = setInterval(function () {
    nudgeResize();
    if (tries === 4 || tries === 16) debugReport('t' + tries);
    if (++tries > 20) clearInterval(timer);
  }, 500);
})();
true;
`;

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



  const createBooking = useCreateBooking();

  const paymobCheckout = usePaymobCheckout();

  const retryMode = isRetryCheckout(params);

  const draftReady = hasRequiredBookingDraft(params) || retryMode;



  const goToConfirmation = useCallback(

    (id: string) => {

      router.replace({

        pathname: '/(parent)/book/booking-confirmation',

        params: { bookingId: id },

      } as never);

    },

    [router],

  );



  const goToPaymentResult = useCallback(

    (id: string) => {

      setCheckoutUrl(null);

      router.replace({

        pathname: '/(parent)/book/payment-result',

        params: {

          bookingId: id,

          ...bookingFlowRetryParams(params, id),

        },

      } as never);

    },

    [params, router],

  );



  const openPaymobCheckout = useCallback(

    async (id: string) => {

      const session = await paymobCheckout.mutateAsync({ bookingId: id });

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



  const startCheckout = useCallback(async () => {

    if (!params.nannyProfileId || !params.dateIso || !params.startTimeIso || !params.endTimeIso) {

      setLoadError('Missing booking details. Go back and try again.');

      setIsStarting(false);

      return;

    }

    if (!isStandardBookingDateAllowed(params.dateIso)) {
      setLoadError(STANDARD_BOOKING_SAME_DAY_MESSAGE);
      setIsStarting(false);
      return;
    }



    setIsStarting(true);

    setLoadError(null);



    try {

      const created = await createBooking.mutateAsync({

        nannyProfileId: params.nannyProfileId,

        date: params.dateIso,

        startTime: params.startTimeIso,

        endTime: params.endTimeIso,

        ...(params.instructions?.trim()

          ? { specialInstructions: params.instructions.trim() }

          : {}),

      });

      setBookingId(created.id);

      router.setParams({
        bookingId: created.id,
        retry: '1',
      } as never);

      if (created.status === 'CONFIRMED') {

        goToConfirmation(created.id);

        return;

      }



      await openPaymobCheckout(created.id);

    } catch (err) {

      setLoadError(getApiErrorMessage(err, 'Payment failed. Please try again.'));

    } finally {

      setIsStarting(false);

    }

  }, [createBooking, goToConfirmation, openPaymobCheckout, params, router]);



  useEffect(() => {

    if (!draftReady || startedRef.current) return;

    startedRef.current = true;

    redirectHandledRef.current = false;

    if (retryMode) {

      void resumeCheckout();

    } else {

      void startCheckout();

    }

  }, [draftReady, resumeCheckout, retryMode, startCheckout]);



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

        <Text style={styles.missingParamsText}>Booking details are incomplete.</Text>

        <Pressable style={styles.missingParamsBtn} onPress={() => router.back()}>

          <Text style={styles.missingParamsBtnText}>Go back</Text>

        </Pressable>

      </View>

    );

  }



  const dateDisplay = getBookingDateDisplay(params);

  const timeDisplay = getBookingTimeDisplay(params);

  const hours = getBookingDurationHours(params);

  const nannyName = params.nannyName?.trim() || 'Your nanny';

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

                if (params.bookingId ?? bookingId) {

                  void resumeCheckout();

                } else {

                  startedRef.current = true;

                  void startCheckout();

                }

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

            injectedJavaScript={CHECKOUT_VIEWPORT_FIX}

            injectedJavaScriptBeforeContentLoaded={CHECKOUT_VIEWPORT_FIX}

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


