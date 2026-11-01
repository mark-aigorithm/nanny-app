import { Tabs } from 'expo-router';

import NannyShiftPromptHost from '@mobile/components/NannyShiftPromptHost';
import { useNannyAccessGuard } from '@mobile/hooks/useNannyAccessGuard';

export default function NannyLayout() {
  useNannyAccessGuard();
  return (
    <>
      {/* The hidden screens are pushed like stack screens (care log → chat,
          booking details → chat), so back returns to where she came from,
          not always to the dashboard. */}
      <Tabs
        backBehavior="history"
        screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}
      >
        <Tabs.Screen name="dashboard" options={{ title: 'Dashboard' }} />
        <Tabs.Screen name="requests" options={{ title: 'Requests' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
        <Tabs.Screen name="care-log" options={{ href: null }} />
        <Tabs.Screen name="booking-detail" options={{ href: null }} />
        <Tabs.Screen name="booking-chat" options={{ href: null }} />
        <Tabs.Screen name="notifications" options={{ href: null }} />
      </Tabs>
      <NannyShiftPromptHost />
    </>
  );
}
