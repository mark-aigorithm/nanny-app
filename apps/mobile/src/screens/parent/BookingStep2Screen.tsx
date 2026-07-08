import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { colors } from '@mobile/theme';

/**
 * Legacy route — payment method selection was removed.
 * Forward any deep links to the WebView checkout step.
 */
export default function BookingStep2Screen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  useEffect(() => {
    router.replace({
      pathname: '/(parent)/book/booking-step-3',
      params,
    } as never);
  }, [params, router]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}
