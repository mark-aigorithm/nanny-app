import React from 'react';
import { View, Text, Pressable, Linking, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BookingLocation } from '@nanny-app/shared';

import { colors, spacing, borderRadius, typeScale, shadows } from '@mobile/theme';

interface Props {
  /** `BookingResponse.address` — null on a booking with no address on file. */
  address: BookingLocation | null;
}

/** "Building B7 · Floor 3 · Apt 12" — only the parts she filled in. */
function doorLine(details: NonNullable<BookingLocation['details']>): string | null {
  const parts = [
    details.building ? `Building ${details.building}` : null,
    details.floor ? `Floor ${details.floor}` : null,
    details.apartment ? `Apt ${details.apartment}` : null,
  ].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function mapsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;
}

/**
 * Where the booking happens, on a booking detail screen. The mother reads
 * back the address she chose; the nanny sees the area until the booking is
 * confirmed, then the whole address with the door details and the landmark
 * — and a button that hands the pin to the maps app.
 */
export function BookingAddressCard({ address }: Props) {
  if (!address) return null;
  const { area, details } = address;
  const door = details ? doorLine(details) : null;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Ionicons name="location-outline" size={18} color={colors.primary} />
        <Text style={styles.title}>{details ? details.label : 'Where'}</Text>
      </View>

      {details ? (
        <>
          <Text style={styles.line}>{details.formattedAddress}</Text>
          {door ? <Text style={styles.line}>{door}</Text> : null}
          {details.landmark ? <Text style={styles.landmark}>{details.landmark}</Text> : null}
          <Pressable
            style={styles.mapsButton}
            onPress={() => void Linking.openURL(mapsUrl(details.latitude, details.longitude))}
            accessibilityRole="button"
          >
            <Ionicons name="navigate-outline" size={16} color={colors.primaryDark} />
            <Text style={styles.mapsText}>Open in Maps</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.line}>{area}</Text>
          <Text style={styles.withheld}>Full address once the booking is confirmed</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.warmBorder,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    ...typeScale.labelMd,
    color: colors.textPrimary,
  },
  line: {
    ...typeScale.bodyMd,
    color: colors.textPrimary,
  },
  landmark: {
    ...typeScale.bodySm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  withheld: {
    ...typeScale.caption,
    color: colors.textMuted,
  },
  mapsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    paddingTop: spacing.xs,
  },
  mapsText: {
    ...typeScale.labelSm,
    color: colors.primaryDark,
  },
});
