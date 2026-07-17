import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { CareLogResponse } from '@nanny-app/shared';
import { colors } from '@mobile/theme';
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
import { styles } from './styles/booking-care-log-section.styles';

interface BookingCareLogSectionProps {
  bookingId: number;
}

export default function BookingCareLogSection({ bookingId }: BookingCareLogSectionProps) {
  const [activeFilter, setActiveFilter] = useState<CareLogFilterPill>('All');
  const { data: careLogs = [], isLoading } = useCareLogs(bookingId);

  const filteredLogs = useMemo(
    () => filterCareLogs(careLogs, activeFilter),
    [careLogs, activeFilter],
  );
  const sections = useMemo(() => groupCareLogsByDay(filteredLogs), [filteredLogs]);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Care log</Text>

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
        <ActivityIndicator color={colors.primary} />
      ) : sections.length === 0 ? (
        <Text style={styles.emptyText}>
          {activeFilter === 'All'
            ? 'No care updates yet. Check back once the shift starts.'
            : `No ${activeFilter.toLowerCase()} updates yet.`}
        </Text>
      ) : (
        sections.map((section) => (
          <View key={section.title} style={styles.dayGroup}>
            <Text style={styles.dayLabel}>{section.title}</Text>
            <View style={styles.entryList}>
              {section.items.map((entry) => (
                <CareLogEntry key={entry.id} entry={entry} />
              ))}
            </View>
          </View>
        ))
      )}
    </View>
  );
}

function CareLogEntry({ entry }: { entry: CareLogResponse }) {
  const icon = careLogIcon(entry.type);
  const thumbnail = entry.evidenceUrls[0];

  return (
    <View style={styles.entry}>
      <View style={[styles.iconCircle, { backgroundColor: icon.backgroundColor }]}>
        <Ionicons name={icon.name} size={18} color={colors.textSecondary} />
      </View>
      <View style={styles.entryBody}>
        <View style={styles.entryHeader}>
          <Text style={styles.entryType}>
            {careLogTypeLabel(entry.type, entry.customLabel)}
          </Text>
          <Text style={styles.entryTime}>{formatCareLogTime(entry.occurredAt)}</Text>
        </View>
        {entry.notes ? (
          <Text style={styles.entryNotes}>{entry.notes}</Text>
        ) : null}
      </View>
      {thumbnail ? (
        <Image source={{ uri: thumbnail }} style={styles.thumbnail} resizeMode="cover" />
      ) : null}
    </View>
  );
}
