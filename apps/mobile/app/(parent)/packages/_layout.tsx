import { Stack } from 'expo-router';

export default function PackagesFlowLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* The purchase is settled here; swiping back would re-open the checkout.
          Android back is handled by useHardwareBack. */}
      <Stack.Screen name="payment-result" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
