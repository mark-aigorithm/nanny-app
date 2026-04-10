import { Tabs } from 'expo-router';

export default function ParentLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="home-dashboard" options={{ headerShown: false }} />
      <Tabs.Screen name="search" options={{ title: 'Search' }} />
      <Tabs.Screen name="community" options={{ title: 'Community' }} />
      <Tabs.Screen name="messages" options={{ title: 'Messages' }} />
      <Tabs.Screen name="bookings" options={{ title: 'Bookings' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      <Tabs.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Tabs.Screen name="mother-profile" options={{ title: 'Profile' }} />
      <Tabs.Screen name="customer-support" options={{ title: 'Support' }} />
      <Tabs.Screen name="book" options={{ title: 'Book' }} />
      <Tabs.Screen name="chat" options={{ title: 'Chat' }} />
      <Tabs.Screen name="nanny" options={{ title: 'Nanny' }} />
      <Tabs.Screen name="marketplace" options={{ headerShown: false }} />
      <Tabs.Screen name="events-meetups" options={{ headerShown: false }} />
      <Tabs.Screen name="community-feed" options={{ headerShown: false }} />
      <Tabs.Screen name="booking-history" options={{ headerShown: false }} />
      <Tabs.Screen name="search-results" options={{ headerShown: false }} />
      <Tabs.Screen name="account-details" options={{ headerShown: false }} />
      <Tabs.Screen name="payment-methods" options={{ headerShown: false }} />
      <Tabs.Screen name="create-post" options={{ headerShown: false }} />
      <Tabs.Screen name="post-detail" options={{ headerShown: false }} />
      <Tabs.Screen name="create-event" options={{ headerShown: false }} />
      <Tabs.Screen name="marketplace-item-detail" options={{ headerShown: false }} />
      <Tabs.Screen name="create-listing" options={{ headerShown: false }} />
    </Tabs>
  );
}
