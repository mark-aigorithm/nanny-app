import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { NannyAvailabilitySlot } from '@mobile/types';
import { MOCK_NANNY_AVAILABILITY } from '@mobile/mocks';
import { colors } from '@mobile/theme';
import { styles } from './styles/nanny-availability-screen.styles';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_INDICES = [1, 2, 3, 4, 5, 6, 0]; // Mon=1..Sat=6, Sun=0

function getWeekRange(offset: number): { label: string; start: Date } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset + offset * 7);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  const label = `${months[monday.getMonth()]} ${monday.getDate()} - ${months[sunday.getMonth()]} ${sunday.getDate()}`;
  return { label, start: monday };
}

function formatSlotTime(startTime: string, endTime: string): string {
  const formatHour = (t: string) => {
    const [h] = t.split(':').map(Number);
    if (h === 0) return '12AM';
    if (h === 12) return '12PM';
    return h > 12 ? `${h - 12}PM` : `${h}AM`;
  };
  return `${formatHour(startTime)}-${formatHour(endTime)}`;
}

function getSlotForDay(
  slots: NannyAvailabilitySlot[],
  dayOfWeek: number,
  period: 'morning' | 'afternoon',
): NannyAvailabilitySlot | undefined {
  return slots.find(s => {
    if (s.dayOfWeek !== dayOfWeek) return false;
    const hour = parseInt(s.startTime.split(':')[0], 10);
    return period === 'morning' ? hour < 12 : hour >= 12;
  });
}

export default function NannyAvailabilityScreen() {
  const router = useRouter();
  const { nannyId: _nannyId } = useLocalSearchParams<{ nannyId: string }>();
  const [weekOffset, setWeekOffset] = useState(0);

  // In production, fetch availability by nannyId and week
  const availability = MOCK_NANNY_AVAILABILITY;
  const weekRange = getWeekRange(weekOffset);

  return (
    <View style={styles.container}>
      {/* Header */}
      <SafeAreaView style={styles.headerSafeArea}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={colors.textDark} />
          </Pressable>
          <Text style={styles.headerTitle}>Availability</Text>
        </View>
      </SafeAreaView>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Week Selector */}
        <View style={styles.weekSelector}>
          <Pressable
            style={styles.weekArrowButton}
            onPress={() => setWeekOffset(prev => prev - 1)}
          >
            <Ionicons name="chevron-back" size={18} color={colors.textDark} />
          </Pressable>
          <Text style={styles.weekLabel}>{weekRange.label}</Text>
          <Pressable
            style={styles.weekArrowButton}
            onPress={() => setWeekOffset(prev => prev + 1)}
          >
            <Ionicons name="chevron-forward" size={18} color={colors.textDark} />
          </Pressable>
        </View>

        {/* Availability Grid */}
        <View style={styles.gridContainer}>
          {/* Grid Header */}
          <View style={styles.gridHeaderRow}>
            <View style={styles.gridHeaderDayCell}>
              <Text style={styles.gridHeaderDayText}>Day</Text>
            </View>
            <View style={styles.gridHeaderSlotCell}>
              <Text style={styles.gridHeaderSlotText}>Morning</Text>
            </View>
            <View style={styles.gridHeaderSlotCell}>
              <Text style={styles.gridHeaderSlotText}>Afternoon</Text>
            </View>
          </View>

          {/* Day Rows */}
          {DAY_INDICES.map((dayIdx, i) => {
            const morningSlot = getSlotForDay(availability, dayIdx, 'morning');
            const afternoonSlot = getSlotForDay(availability, dayIdx, 'afternoon');
            const isLast = i === DAY_INDICES.length - 1;

            return (
              <View
                key={dayIdx}
                style={[styles.dayRow, isLast && styles.dayRowLast]}
              >
                <View style={styles.dayLabelCell}>
                  <Text style={styles.dayLabel}>{DAY_NAMES[i]}</Text>
                </View>

                {/* Morning Slot */}
                <View style={styles.slotCell}>
                  {morningSlot ? (
                    <View
                      style={[
                        styles.slotPill,
                        morningSlot.available
                          ? styles.slotAvailable
                          : styles.slotUnavailable,
                      ]}
                    >
                      <Text
                        style={
                          morningSlot.available
                            ? styles.slotTimeText
                            : styles.slotUnavailableText
                        }
                      >
                        {morningSlot.available
                          ? formatSlotTime(morningSlot.startTime, morningSlot.endTime)
                          : 'Unavailable'}
                      </Text>
                    </View>
                  ) : (
                    <View style={[styles.slotPill, styles.slotUnavailable]}>
                      <Text style={styles.slotUnavailableText}>--</Text>
                    </View>
                  )}
                </View>

                {/* Afternoon Slot */}
                <View style={styles.slotCell}>
                  {afternoonSlot ? (
                    <View
                      style={[
                        styles.slotPill,
                        afternoonSlot.available
                          ? styles.slotAvailable
                          : styles.slotUnavailable,
                      ]}
                    >
                      <Text
                        style={
                          afternoonSlot.available
                            ? styles.slotTimeText
                            : styles.slotUnavailableText
                        }
                      >
                        {afternoonSlot.available
                          ? formatSlotTime(
                              afternoonSlot.startTime,
                              afternoonSlot.endTime,
                            )
                          : 'Unavailable'}
                      </Text>
                    </View>
                  ) : (
                    <View style={[styles.slotPill, styles.slotUnavailable]}>
                      <Text style={styles.slotUnavailableText}>--</Text>
                    </View>
                  )}
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
        <Pressable style={styles.bookButton}>
          <Text style={styles.bookButtonText}>Book available slot</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
