import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';

const TAB_COLOR_ACTIVE = '#137FEC';
const TAB_COLOR_INACTIVE = '#6B7280';
const COMMUNITY_ACTIVE = '#EA57A1';

function TabIcon({ emoji, focused, isCommunity }: { emoji: string; focused: boolean; isCommunity?: boolean }) {
  const activeColor = isCommunity ? COMMUNITY_ACTIVE : TAB_COLOR_ACTIVE;
  return (
    <View style={styles.tabIcon}>
      <Text style={[styles.emoji, { opacity: focused ? 1 : 0.6 }]}>{emoji}</Text>
      {focused && <View style={[styles.dot, { backgroundColor: activeColor }]} />}
    </View>
  );
}

export default function ParentLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: TAB_COLOR_ACTIVE,
        tabBarInactiveTintColor: TAB_COLOR_INACTIVE,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🔍" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: 'Community',
          tabBarActiveTintColor: COMMUNITY_ACTIVE,
          tabBarIcon: ({ focused }) => <TabIcon emoji="👩‍👩‍👧" focused={focused} isCommunity />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: ({ focused }) => <TabIcon emoji="💬" focused={focused} />,
        }}
      />
      {/* Hide detail screens from tab bar */}
      <Tabs.Screen name="nanny-profile" options={{ href: null }} />
      <Tabs.Screen name="booking" options={{ href: null }} />
      <Tabs.Screen name="live-monitor" options={{ href: null }} />
      <Tabs.Screen name="care-feed" options={{ href: null }} />
      <Tabs.Screen name="events" options={{ href: null }} />
      <Tabs.Screen name="marketplace" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
      <Tabs.Screen name="support" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    height: 80,
    paddingBottom: 20,
    paddingTop: 8,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  tabIcon: {
    alignItems: 'center',
    gap: 2,
  },
  emoji: {
    fontSize: 22,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});
