import React, { useCallback, useEffect, useRef, useState } from 'react';

import {

  View,

  Text,

  Pressable,

  StatusBar,

  ActivityIndicator,

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



      <View style={styles.webviewWrap}>

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



        {checkoutUrl && !loadError && (

          <WebView

            source={{ uri: checkoutUrl }}

            onNavigationStateChange={handleWebViewNavigation}

            onShouldStartLoadWithRequest={(request) => handleShouldStartLoad(request.url)}

            onError={handleWebViewError}

            onHttpError={handleWebViewError}

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


