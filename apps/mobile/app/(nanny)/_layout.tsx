import { Tabs } from 'expo-router';

import NannyShiftPromptHost from '@mobile/components/NannyShiftPromptHost';
import { useNannyAccessGuard } from '@mobile/hooks/useNannyAccessGuard';

export default function NannyLayout() {
  useNannyAccessGuard();
  return (
    <>
      <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
        <Tabs.Screen name="dashboard" options={{ title: 'Dashboard' }} />
        <Tabs.Screen name="requests" options={{ title: 'Requests' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
        <Tabs.Screen name="care-log" options={{ href: null }} />
        <Tabs.Screen name="booking-detail" options={{ href: null }} />
        <Tabs.Screen name="notifications" options={{ href: null }} />
      </Tabs>
      <NannyShiftPromptHost />
    </>
  );
}
