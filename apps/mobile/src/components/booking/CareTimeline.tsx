import React, { useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '@mobile/components/ui/text';
import { Ionicons } from '@expo/vector-icons';
import { formatChildNames, type CareLogResponse } from '@nanny-app/shared';

import { Chip, PressableScale } from '@mobile/components/ui';
import { useCareLogs } from '@mobile/hooks/useCareLogs';
import {
  CARE_LOG_FILTER_PILLS,
  type CareLogFilterPill,
  careLogIcon,
  careLogTypeLabel,
  filterCareLogs,
  formatCareLogTime,
  getCareLogDayLabel,
} from '@mobile/lib/careLogUtils';
import { colors, borderRadius, spacing, typeScale } from '@mobile/theme';

interface Props {
  bookingId: number;
  /** "Today so far" while the shift runs, "Care log" once it is over. */
  title: string;
  nannyFirstName: string | null;
}

/** Enough to answer "how is it going" without pushing the rest off screen. */
const PREVIEW_COUNT = 3;

/**
 * The nanny's updates as a timeline, newest first, on the mother's Booking
 * details. It shows the latest few and opens in place to show the rest — no
 * separate screen to lose her way back from.
 *
 * Tapping an entry opens it on its own screen (CareLogEntryScreen) with the
 * notes in full and the photos large enough to see.
 *
 * The nanny's own booking screen keeps BookingCareLogSection: she is writing
 * the log, not reading it.
 */
export function CareTimeline({ bookingId, title, nannyFirstName }: Props) {
  const [filter, setFilter] = useState<CareLogFilterPill>('All');
  const [expanded, setExpanded] = useState(false);
  const { data: careLogs = [], isLoading } = useCareLogs(bookingId);

  const entries = useMemo(() => filterCareLogs(careLogs, filter), [careLogs, filter]);
  const shown = expanded ? entries : entries.slice(0, PREVIEW_COUNT);

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text style={styles.title}>{title}</Text>
        {entries.length > PREVIEW_COUNT ? (
          <Pressable onPress={() => setExpanded((v) => !v)} hitSlop={8} accessibilityRole="button">
            <Text style={styles.toggle}>
              {expanded ? 'Show less' : `See all ${entries.length}`}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {careLogs.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          style={styles.chipsScroll}
        >
          {CARE_LOG_FILTER_PILLS.map((pill) => (
            <Chip
              key={pill}
              label={pill}
              active={filter === pill}
              onPress={() => {
                setFilter(pill);
                setExpanded(false);
              }}
            />
          ))}
        </ScrollView>
      ) : null}

      {isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : entries.length === 0 ? (
        <Text style={styles.empty}>
          {careLogs.length === 0
            ? `No updates yet. ${nannyFirstName ?? 'Your nanny'}'s notes on meals, naps and play will appear here.`
            : `No ${filter.toLowerCase()} updates yet.`}
        </Text>
      ) : (
        <View>
          {/* The rail the entries hang from. */}
          <View style={styles.rail} />
          {shown.map((entry, i) => (
            <TimelineEntry
              key={entry.id}
              entry={entry}
              // A day label only where the day changes — a booking can run past midnight.
              day={
                i === 0 ||
                getCareLogDayLabel(shown[i - 1]!.occurredAt) !==
                  getCareLogDayLabel(entry.occurredAt)
                  ? getCareLogDayLabel(entry.occurredAt)
                  : null
              }
              last={i === shown.length - 1}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function TimelineEntry({
  entry,
  day,
  last,
}: {
  entry: CareLogResponse;
  day: string | null;
  last: boolean;
}) {
  const router = useRouter();
  const icon = careLogIcon(entry.type);
  const showDay = day !== null && day !== 'Today';
  const label = careLogTypeLabel(entry.type, entry.customLabel);
  const time = formatCareLogTime(entry.occurredAt);

  return (
    <>
      {showDay ? <Text style={styles.day}>{day}</Text> : null}
      <PressableScale
        style={[styles.entry, last && styles.entryLast]}
        onPress={() =>
          router.push({
            pathname: '/(parent)/book/care-log-entry',
            params: { bookingId: String(entry.bookingId), entryId: String(entry.id) },
          })
        }
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${time}. See details`}
      >
        <View style={[styles.icon, { backgroundColor: icon.backgroundColor }]}>
          <Ionicons name={icon.name} size={18} color={colors.textSecondary} />
        </View>
        <View style={styles.body}>
          <View style={styles.entryHead}>
            <Text style={styles.type}>{label}</Text>
            <Text style={styles.time}>{time}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </View>
          {entry.childNames.length > 0 ? (
            <Text style={styles.children}>{formatChildNames(entry.childNames)}</Text>
          ) : null}
          {entry.notes ? <Text style={styles.notes}>{entry.notes}</Text> : null}
          {entry.evidenceUrls.length > 0 ? (
            <View style={styles.photos}>
              {entry.evidenceUrls.slice(0, 4).map((uri) => (
                <Image key={uri} source={{ uri }} style={styles.photo} resizeMode="cover" />
              ))}
            </View>
          ) : null}
        </View>
      </PressableScale>
    </>
  );
}

const ICON = 36;

const styles = StyleSheet.create({
  section: {
    gap: spacing.md,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  title: {
    ...typeScale.headingMd,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  toggle: {
    ...typeScale.labelMd,
    color: colors.primaryDark,
  },
  // Let the chips run to the screen edge instead of clipping at the padding.
  chipsScroll: {
    marginHorizontal: -spacing['2xl'],
  },
  chips: {
    gap: spacing.sm,
    paddingHorizontal: spacing['2xl'],
  },
  empty: {
    ...typeScale.bodyMd,
    color: colors.textMuted,
  },
  rail: {
    position: 'absolute',
    left: ICON / 2 - 1,
    top: ICON / 2,
    bottom: ICON / 2,
    width: 2,
    backgroundColor: colors.warmBorder,
  },
  day: {
    ...typeScale.captionBold,
    color: colors.textTertiary,
    marginLeft: ICON + spacing.md,
    marginBottom: spacing.sm,
  },
  entry: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
  entryLast: {
    paddingBottom: 0,
  },
  icon: {
    width: ICON,
    height: ICON,
    borderRadius: ICON / 2,
    alignItems: 'center',
    justifyContent: 'center',
    // A ring of page colour so the rail reads as passing behind each icon.
    borderWidth: 3,
    borderColor: colors.background,
  },
  body: {
    flex: 1,
    gap: spacing.xxs,
  },
  entryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  type: {
    ...typeScale.labelLg,
    color: colors.textPrimary,
    flex: 1,
  },
  time: {
    ...typeScale.caption,
    color: colors.textMuted,
  },
  children: {
    ...typeScale.labelMd,
    color: colors.primaryDark,
  },
  notes: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
  },
  photos: {
    flexDirection: 'row',
    // Four 64dp photos are wider than the entry body on a 320dp phone.
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  photo: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surfaceMuted,
  },
});
