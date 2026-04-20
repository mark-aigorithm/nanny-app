import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@mobile/theme';
import { useBookingList, fmtBookingDate, fmtBookingTime } from '@mobile/hooks/useBookings';
import { useNannyDashboard } from '@mobile/hooks/useNannies';
import { styles } from './styles/nanny-dashboard-screen.styles';

type StatKey = 'totalBookings' | 'repeatClients' | 'averageRating' | 'responseRate';

const STAT_CONFIG: { key: StatKey; label: string; icon: string; bg: string; iconColor: string }[] = [
  { key: 'totalBookings', label: 'Total bookings', icon: 'calendar', bg: colors.primaryMuted, iconColor: colors.primary },
  { key: 'repeatClients', label: 'Repeat clients', icon: 'people', bg: colors.taupeLight, iconColor: colors.textTertiary },
  { key: 'averageRating', label: 'Avg. rating', icon: 'star', bg: colors.warmLight, iconColor: colors.goldWarm },
  { key: 'responseRate', label: 'Response rate', icon: 'flash', bg: colors.successLight, iconColor: colors.success },
];

export default function NannyDashboardScreen() {
  const { data: dashboard, isLoading: loadingDashboard } = useNannyDashboard();
  const { data: upcomingBookings = [], isLoading: loadingBookings } = useBookingList('CONFIRMED,IN_PROGRESS');

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Earnings Card */}
        <View style={styles.earningsCard}>
          <Text style={styles.earningsTitle}>Your earnings</Text>
          {loadingDashboard ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 8 }} />
          ) : (
            <View style={styles.earningsRow}>
              <View style={styles.earningsItem}>
                <Text style={styles.earningsLabel}>This week</Text>
                <Text style={styles.earningsAmount}>${dashboard?.earningsThisWeek.toFixed(2) ?? '—'}</Text>
              </View>
              <View style={styles.earningsDivider} />
              <View style={styles.earningsItem}>
                <Text style={styles.earningsLabel}>This month</Text>
                <Text style={styles.earningsAmount}>${dashboard?.earningsThisMonth.toFixed(2) ?? '—'}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Quick Stats */}
        <View style={styles.statsGrid}>
          {STAT_CONFIG.map((item) => {
            const value = dashboard?.[item.key as keyof typeof dashboard] as number | undefined;
            const display = loadingDashboard || value === undefined ? '—'
              : item.key === 'averageRating' ? value.toFixed(1)
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
            {loadingBookings ? (
              <ActivityIndicator color={colors.primary} />
            ) : upcomingBookings.length === 0 ? (
              <Text style={styles.statLabel}>No upcoming bookings</Text>
            ) : (
              upcomingBookings.map((booking) => (
                <View key={booking.id} style={styles.bookingCard}>
                  <View style={[styles.bookingAvatar, { backgroundColor: colors.primaryMuted, justifyContent: 'center', alignItems: 'center' }]}>
                    <Ionicons name="person" size={16} color={colors.primary} />
                  </View>
                  <View style={styles.bookingInfo}>
                    <Text style={styles.bookingName}>
                      {booking.motherFirstName} {booking.motherLastName}
                    </Text>
                    <Text style={styles.bookingMeta}>{fmtBookingDate(booking.date)}</Text>
                    <Text style={styles.bookingMeta}>{fmtBookingTime(booking.startTime, booking.endTime)}</Text>
                  </View>
                  <Text style={styles.bookingAmount}>${booking.totalAmount.toFixed(2)}</Text>
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
