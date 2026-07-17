import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { CareLogResponse } from '@nanny-app/shared';
import { colors } from '@mobile/theme';
import BottomNav from '@mobile/components/BottomNav';
import { useBooking } from '@mobile/hooks/useBookings';
import { useCareLogs } from '@mobile/hooks/useCareLogs';
import {
  CARE_LOG_FILTER_PILLS,
  type CareLogFilterPill,
  careLogIcon,
  careLogTypeLabel,
  filterCareLogs,
  formatCareLogTime,
  groupCareLogsByDay,
} from '@mobile/lib/careLogUtils';
import { styles } from './styles/care-activity-feed-screen.styles';

export default function CareActivityFeedScreen() {
  const router = useRouter();
  const { bookingId, returnTo } = useLocalSearchParams<{ bookingId?: string; returnTo?: string }>();
  const [activeFilter, setActiveFilter] = useState<CareLogFilterPill>('All');

  const numericBookingId = bookingId ? Number(bookingId) : undefined;
  const { data: booking, isLoading: bookingLoading } = useBooking(numericBookingId);
  const { data: careLogs = [], isLoading: logsLoading } = useCareLogs(numericBookingId);

  const filteredLogs = useMemo(
    () => filterCareLogs(careLogs, activeFilter),
    [careLogs, activeFilter],
  );
  const sections = useMemo(() => groupCareLogsByDay(filteredLogs), [filteredLogs]);

  const headerTitle = booking?.nanny
    ? `${booking.nanny.firstName}'s care log`
    : 'Care log';

  const handleBack = () => {
    if (returnTo === 'booking-detail' && bookingId) {
      router.replace({
        pathname: '/(parent)/book/booking-detail',
        params: { bookingId, returnTo: 'bookings' },
      } as never);
      return;
    }
    if (returnTo === 'bookings') {
      router.replace('/(parent)/bookings' as never);
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(parent)/bookings' as never);
  };

  const isLoading = bookingLoading || logsLoading;

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filtersScroll}
          contentContainerStyle={styles.filtersContent}
        >
          {CARE_LOG_FILTER_PILLS.map((pill) => (
            <Pressable
              key={pill}
              style={[styles.pill, activeFilter === pill ? styles.pillActive : styles.pillInactive]}
              onPress={() => setActiveFilter(pill)}
            >
              <Text
                style={[
                  styles.pillText,
                  activeFilter === pill ? styles.pillTextActive : styles.pillTextInactive,
                ]}
              >
                {pill}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
        ) : !bookingId ? (
          <Text style={styles.emptyText}>Missing booking.</Text>
        ) : sections.length === 0 ? (
          <Text style={styles.emptyText}>
            {activeFilter === 'All'
              ? 'No care updates yet for this booking.'
              : `No ${activeFilter.toLowerCase()} updates yet.`}
          </Text>
        ) : (
          sections.map((section) => (
            <View key={section.title} style={styles.section}>
              <Text style={styles.sectionDate}>{section.title.toUpperCase()}</Text>
              <View style={styles.activityList}>
                {section.items.map((entry) => (
                  <CareLogCard key={entry.id} entry={entry} />
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <View style={styles.header} pointerEvents="box-none">
        <View style={styles.headerRow}>
          <Pressable style={styles.iconBtn} onPress={handleBack}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {headerTitle}
          </Text>
          <View style={styles.iconBtn} />
        </View>
      </View>

      <BottomNav activeTab="bookings" />
    </View>
  );
}

function CareLogCard({ entry }: { entry: CareLogResponse }) {
  const icon = careLogIcon(entry.type);
  const label = careLogTypeLabel(entry.type, entry.customLabel);
  const description = entry.notes?.trim() || 'No additional notes.';
  const thumbnail = entry.evidenceUrls[0];

  return (
    <View style={styles.card}>
      <View style={[styles.iconCircle, { backgroundColor: icon.backgroundColor }]}>
        <Ionicons name={icon.name} size={22} color={colors.textSecondary} />
      </View>
      <View style={styles.cardContent}>
        <Text style={styles.cardType}>{label}</Text>
        <Text style={styles.cardTime}>{formatCareLogTime(entry.occurredAt)}</Text>
        <Text style={styles.cardDescription}>{description}</Text>
      </View>
      {thumbnail ? (
        <Image source={{ uri: thumbnail }} style={styles.cardThumbnail} resizeMode="cover" />
      ) : null}
    </View>
  );
}
