import { Tabs } from 'expo-router';

export default function ParentLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="search" options={{ title: 'Search' }} />
      <Tabs.Screen name="community" options={{ title: 'Community' }} />
      <Tabs.Screen name="messages" options={{ title: 'Messages' }} />
      <Tabs.Screen name="bookings" options={{ title: 'Bookings' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
