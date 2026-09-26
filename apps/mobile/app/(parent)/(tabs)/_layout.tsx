import { Tabs } from 'expo-router';

import ParentTabBar from '@mobile/components/ParentTabBar';
import { useReducedMotion } from '@mobile/hooks/useReducedMotion';
import { fadeRiseTransition } from '@mobile/lib/sceneTransitions';

/**
 * The screens that carry the floating bar (see ROUTE_TO_TAB). `history` makes
 * back walk the tabs she actually visited instead of always jumping to Home.
 * Everything that isn't a tab is a Stack screen in the parent layout above.
 */
export default function ParentTabsLayout() {
  const reducedMotion = useReducedMotion();

  return (
    <Tabs
      backBehavior="history"
      tabBar={props => <ParentTabBar {...props} />}
      screenOptions={{ headerShown: false, ...fadeRiseTransition(reducedMotion) }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="services" options={{ title: 'Services' }} />
      <Tabs.Screen name="community" options={{ title: 'Community' }} />
      <Tabs.Screen name="community-feed" options={{ title: 'Community' }} />
      <Tabs.Screen name="messages" options={{ title: 'Messages' }} />
      <Tabs.Screen name="bookings" options={{ title: 'Activity' }} />
      <Tabs.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Tabs.Screen name="mother-profile" options={{ title: 'Account' }} />
    </Tabs>
  );
}
