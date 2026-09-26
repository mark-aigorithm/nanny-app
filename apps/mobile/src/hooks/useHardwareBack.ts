import { useCallback, useRef } from 'react';
import { BackHandler } from 'react-native';
import { useFocusEffect } from 'expo-router';

/**
 * Takes over Android's back button while the screen is focused. For the end
 * of a flow (booking confirmation, payment results), where the default back
 * would walk into steps that are already done — a form already submitted, a
 * payment already made. Pair it with `gestureEnabled: false` on the route so
 * the iOS swipe can't do the same.
 */
export function useHardwareBack(onBack: () => void): void {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        onBackRef.current();
        return true;
      });
      return () => subscription.remove();
    }, []),
  );
}
