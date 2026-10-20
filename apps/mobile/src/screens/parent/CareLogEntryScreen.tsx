import React, { useState } from 'react';
import { ActivityIndicator, Image, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { formatChildNames } from '@nanny-app/shared';

import { CarePhotoViewer } from '@mobile/components/booking/CarePhotoViewer';
import { PressableScale, ScreenContainer, StackHeader } from '@mobile/components/ui';
import { Text } from '@mobile/components/ui/text';
import { useBooking } from '@mobile/hooks/useBookings';
import { useCareLogs } from '@mobile/hooks/useCareLogs';
import {
  careLogIcon,
  careLogTypeLabel,
  formatCareLogTime,
  getCareLogDayLabel,
} from '@mobile/lib/careLogUtils';
import { colors } from '@mobile/theme';
import { styles } from './styles/care-log-entry-screen.styles';

/**
 * One care-log entry, opened from the timeline on the mother's Booking details:
 * the nanny's notes in full and her photos at full width, each of which opens
 * full screen.
 */
export default function CareLogEntryScreen() {
  const { bookingId: bookingIdParam, entryId: entryIdParam } = useLocalSearchParams<{
    bookingId?: string;
    entryId?: string;
  }>();
  const bookingId = Number(bookingIdParam) || undefined;
  const entryId = Number(entryIdParam);
  const { data: careLogs, isLoading } = useCareLogs(bookingId);
  const { data: booking } = useBooking(bookingId);
  const [photoIndex, setPhotoIndex] = useState<number | null>(null);

  const entry = careLogs?.find((log) => log.id === entryId);

  if (isLoading) {
    return (
      <ScreenContainer useSafeArea={false}>
        <StackHeader title="Care update" />
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primaryDark} />
        </View>
      </ScreenContainer>
    );
  }

  if (!entry) {
    return (
      <ScreenContainer useSafeArea={false}>
        <StackHeader title="Care update" />
        <View style={styles.missing}>
          <Ionicons name="document-text-outline" size={28} color={colors.textMuted} />
          <Text style={styles.muted}>This update isn't available any more.</Text>
        </View>
      </ScreenContainer>
    );
  }

  const icon = careLogIcon(entry.type);
  const nannyFirstName = booking?.nanny?.firstName;
  const photos = entry.evidenceUrls;

  return (
    <ScreenContainer useSafeArea={false}>
      <StackHeader
        title={careLogTypeLabel(entry.type, entry.customLabel)}
        subtitle={`${getCareLogDayLabel(entry.occurredAt)} · ${formatCareLogTime(entry.occurredAt)}`}
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={[styles.icon, { backgroundColor: icon.backgroundColor }]}>
              <Ionicons name={icon.name} size={20} color={colors.textSecondary} />
            </View>
            <View style={styles.cardHeadText}>
              {entry.childNames.length > 0 ? (
                <Text style={styles.children}>{formatChildNames(entry.childNames)}</Text>
              ) : null}
              <Text style={styles.loggedBy}>
                {`Logged by ${nannyFirstName ?? 'your nanny'} at ${formatCareLogTime(entry.createdAt)}`}
              </Text>
            </View>
          </View>
          {entry.notes ? (
            <Text style={styles.notes}>{entry.notes}</Text>
          ) : (
            <Text style={styles.muted}>No notes with this update.</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{photos.length > 1 ? 'Photos' : 'Photo'}</Text>
          {photos.length === 0 ? (
            <Text style={styles.muted}>No photo with this update.</Text>
          ) : (
            photos.map((uri, i) => (
              <PressableScale
                key={uri}
                onPress={() => setPhotoIndex(i)}
                accessibilityRole="imagebutton"
                accessibilityLabel={
                  photos.length > 1
                    ? `Photo ${i + 1} of ${photos.length}. Open full screen`
                    : 'Photo. Open full screen'
                }
              >
                <Image source={{ uri }} style={styles.photo} resizeMode="cover" />
              </PressableScale>
            ))
          )}
        </View>
      </ScrollView>

      <CarePhotoViewer photos={photos} index={photoIndex} onClose={() => setPhotoIndex(null)} />
    </ScreenContainer>
  );
}
