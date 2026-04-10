import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@mobile/theme';
import {
  MOCK_NANNY_EARNINGS,
  MOCK_NANNY_STATS,
  MOCK_NANNY_REQUESTS,
} from '@mobile/mocks';
import { styles } from './styles/nanny-dashboard-screen.styles';

const STAT_CONFIG = [
  { key: 'totalBookings' as const, label: 'Total bookings', icon: 'calendar', bg: colors.primaryMuted, iconColor: colors.primary },
  { key: 'repeatClients' as const, label: 'Repeat clients', icon: 'people', bg: colors.taupeLight, iconColor: colors.textTertiary },
  { key: 'averageRating' as const, label: 'Avg. rating', icon: 'star', bg: colors.warmLight, iconColor: colors.goldWarm },
  { key: 'responseRate' as const, label: 'Response rate', icon: 'flash', bg: colors.successLight, iconColor: colors.success },
] as const;

export default function NannyDashboardScreen() {
  const earnings = MOCK_NANNY_EARNINGS;
  const stats = MOCK_NANNY_STATS;
  const upcomingBookings = MOCK_NANNY_REQUESTS.filter((r) => r.status === 'accepted');

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Earnings Card */}
        <View style={styles.earningsCard}>
          <Text style={styles.earningsTitle}>Your earnings</Text>
          <View style={styles.earningsRow}>
            <View style={styles.earningsItem}>
              <Text style={styles.earningsLabel}>This week</Text>
              <Text style={styles.earningsAmount}>${earnings.thisWeek}</Text>
            </View>
            <View style={styles.earningsDivider} />
            <View style={styles.earningsItem}>
              <Text style={styles.earningsLabel}>This month</Text>
              <Text style={styles.earningsAmount}>${earnings.thisMonth}</Text>
            </View>
          </View>
        </View>

        {/* Quick Stats */}
        <View style={styles.statsGrid}>
          {STAT_CONFIG.map((item) => {
            const value = stats[item.key];
            const display = item.key === 'averageRating' ? value.toFixed(1)
              : item.key === 'responseRate' ? `${value}%`
              : String(value);
            return (
              <View key={item.key} style={styles.statCard}>
                <View style={[styles.statIconCircle, { backgroundColor: item.bg }]}>
                  <Ionicons name={item.icon as never} size={20} color={item.iconColor} />
                </View>
                <Text style={styles.statValue}>{display}</Text>
                <Text style={styles.statLabel}>{item.label}</Text>
              </View>
            );
          })}
        </View>

        {/* Upcoming Bookings */}
        <View>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Upcoming bookings</Text>
            <Pressable>
              <Text style={styles.seeAll}>See all</Text>
            </Pressable>
          </View>
          <View style={[styles.bookingsList, { marginTop: 14 }]}>
            {upcomingBookings.length === 0 ? (
              <Text style={styles.statLabel}>No upcoming bookings</Text>
            ) : (
              upcomingBookings.map((booking) => (
                <View key={booking.id} style={styles.bookingCard}>
                  <Image source={{ uri: booking.parentPhoto }} style={styles.bookingAvatar} />
                  <View style={styles.bookingInfo}>
                    <Text style={styles.bookingName}>{booking.parentName}</Text>
                    <Text style={styles.bookingMeta}>{booking.date}</Text>
                    <Text style={styles.bookingMeta}>{booking.time}</Text>
                  </View>
                  <Text style={styles.bookingAmount}>${booking.totalAmount}</Text>
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>

      {/* Header */}
      <View style={styles.header} pointerEvents="box-none">
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Dashboard</Text>
          <Pressable style={styles.bellBtn}>
            <Ionicons name="notifications-outline" size={22} color={colors.textDark} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
