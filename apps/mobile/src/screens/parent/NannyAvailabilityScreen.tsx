import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { colors } from '@mobile/theme';
import { useNannyPublicProfile } from '@mobile/hooks/useNannies';
import { styles } from './styles/nanny-availability-screen.styles';
import type { WeeklySchedule } from '@nanny-app/shared';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_INDICES = [1, 2, 3, 4, 5, 6, 0]; // Mon=1 … Sat=6, Sun=0

function formatHour(t: string): string {
  const h = parseInt(t.split(':')[0] ?? '0', 10);
  if (h === 0) return '12AM';
  if (h === 12) return '12PM';
  return h > 12 ? `${h - 12}PM` : `${h}AM`;
}

function getDayAvailability(
  schedule: WeeklySchedule | null | undefined,
  dayOfWeek: number,
): { available: boolean; label: string } {
  if (!schedule) return { available: false, label: '--' };
  const day = schedule[String(dayOfWeek)];
  if (!day || !day.available) return { available: false, label: 'Unavailable' };
  return { available: true, label: `${formatHour(day.startTime)} – ${formatHour(day.endTime)}` };
}

export default function NannyAvailabilityScreen() {
  const router = useRouter();
  const { nannyId, nannyName, nannyPhoto, nannyRate } = useLocalSearchParams<{
    nannyId: string;
    nannyName?: string;
    nannyPhoto?: string;
    nannyRate?: string;
  }>();

  const { data: nanny, isLoading } = useNannyPublicProfile(nannyId);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.headerSafeArea}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={colors.textDark} />
          </Pressable>
          <Text style={styles.headerTitle}>Availability</Text>
        </View>
      </SafeAreaView>

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Grid */}
          <View style={styles.gridContainer}>
            <View style={styles.gridHeaderRow}>
              <View style={styles.gridHeaderDayCell}>
                <Text style={styles.gridHeaderDayText}>Day</Text>
              </View>
              <View style={[styles.gridHeaderSlotCell, { flex: 6 }]}>
                <Text style={styles.gridHeaderSlotText}>Available Hours</Text>
              </View>
            </View>

            {DAY_INDICES.map((dayIdx, i) => {
              const { available, label } = getDayAvailability(nanny?.schedule, dayIdx);
              const isLast = i === DAY_INDICES.length - 1;
              return (
                <View key={dayIdx} style={[styles.dayRow, isLast && styles.dayRowLast]}>
                  <View style={styles.dayLabelCell}>
                    <Text style={styles.dayLabel}>{DAY_NAMES[i]}</Text>
                  </View>
                  <View style={[styles.slotCell, { flex: 6 }]}>
                    <View
                      style={[
                        styles.slotPill,
                        available ? styles.slotAvailable : styles.slotUnavailable,
                      ]}
                    >
                      <Text
                        style={available ? styles.slotTimeText : styles.slotUnavailableText}
                      >
                        {label}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>

          {/* Legend */}
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={styles.legendDotAvailable} />
              <Text style={styles.legendText}>Available</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={styles.legendDotUnavailable} />
              <Text style={styles.legendText}>Unavailable</Text>
            </View>
          </View>

          {/* Book Button */}
          <Pressable
            style={styles.bookButton}
            onPress={() =>
              router.push({
                pathname: '/(parent)/book/booking-date-picker',
                params: {
                  nannyId: nannyId ?? nanny?.nannyProfileId ?? '',
                  nannyName: nannyName ?? `${nanny?.firstName ?? ''} ${nanny?.lastName ?? ''}`.trim(),
                  nannyPhoto: nannyPhoto ?? nanny?.avatarUrl ?? '',
                  nannyRate: nannyRate ?? String(nanny?.hourlyRate ?? 0),
                },
              } as never)
            }
          >
            <Text style={styles.bookButtonText}>Book available slot</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}
