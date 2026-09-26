import { Stack } from 'expo-router';

export default function BookLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Ends of the flow: swiping back would re-open a submitted request or a
          paid checkout. Their Android back is handled by useHardwareBack. */}
      <Stack.Screen name="booking-confirmation" options={{ gestureEnabled: false }} />
      <Stack.Screen name="payment-result" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
