import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import type { CareLogResponse, CareLogType } from '@nanny-app/shared';

import { colors } from '@mobile/theme';
import { useBookingList } from '@mobile/hooks/useBookings';
import { useCareLogs, useCreateCareLog } from '@mobile/hooks/useCareLogs';
import { uploadImageToFirebase } from '@mobile/lib/storage';
import { styles } from './styles/care-log-screen.styles';

type IconName = keyof typeof Ionicons.glyphMap;

interface CategoryConfig {
  type: CareLogType;
  label: string;
  icon: IconName;
  bg: string;
}

const CATEGORIES: CategoryConfig[] = [
  { type: 'MEAL', label: 'Meal', icon: 'restaurant', bg: colors.warmLight },
  { type: 'NAP', label: 'Nap', icon: 'moon', bg: colors.tintPurple },
  { type: 'DIAPER', label: 'Diaper', icon: 'happy', bg: colors.successLight },
  { type: 'ACTIVITY', label: 'Activity', icon: 'game-controller', bg: colors.tintYellow },
  { type: 'CUSTOM', label: 'Custom', icon: 'add-circle', bg: colors.taupeLight },
];

const CATEGORY_BY_TYPE: Record<CareLogType, CategoryConfig> = CATEGORIES.reduce(
  (acc, c) => ({ ...acc, [c.type]: c }),
  {} as Record<CareLogType, CategoryConfig>,
);

const TODAY_LABEL = new Date().toLocaleDateString('en-US', {
  month: 'short',
  day: 'numeric',
});

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function entryTitle(entry: CareLogResponse): string {
  if (entry.type === 'CUSTOM' && entry.customLabel) return entry.customLabel;
  return CATEGORY_BY_TYPE[entry.type].label;
}

export default function CareLogScreen() {
  const router = useRouter();

  const { data: inProgressBookings = [] } = useBookingList('IN_PROGRESS');
  const activeBooking = inProgressBookings[0];
  const bookingId = activeBooking?.id;

  const { data: entries = [], isLoading: loadingEntries } = useCareLogs(bookingId);
  const createLog = useCreateCareLog(bookingId);

  const [sheetCategory, setSheetCategory] = useState<CategoryConfig | null>(null);
  const [customLabel, setCustomLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [evidenceUris, setEvidenceUris] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [occurredAt, setOccurredAt] = useState(new Date());
  const [showTimePicker, setShowTimePicker] = useState(false);

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
    [entries],
  );

  function openSheet(category: CategoryConfig) {
    if (!bookingId) {
      Alert.alert(
        'No active booking',
        'You need an in-progress booking to add care log entries.',
      );
      return;
    }
    setSheetCategory(category);
    setCustomLabel('');
    setNotes('');
    setEvidenceUris([]);
    setOccurredAt(new Date());
    setShowTimePicker(false);
  }

  function closeSheet() {
    setSheetCategory(null);
    setCustomLabel('');
    setNotes('');
    setEvidenceUris([]);
    setOccurredAt(new Date());
    setShowTimePicker(false);
  }

  function handleTimeChange(event: DateTimePickerEvent, selected?: Date) {
    if (event.type === 'dismissed' || !selected) return;
    setOccurredAt(selected);
  }

  function handleOpenTimePicker() {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: occurredAt,
        mode: 'time',
        is24Hour: false,
        onChange: handleTimeChange,
      });
      return;
    }
    setShowTimePicker(true);
  }

  async function pickFromCamera() {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Allow camera access to capture evidence.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.7,
      });
      if (!result.canceled && result.assets[0]) {
        setEvidenceUris((prev) => [...prev, result.assets[0]!.uri]);
      }
    } catch (err) {
      Alert.alert('Could not open camera', err instanceof Error ? err.message : 'Unknown error');
    }
  }

  async function pickFromLibrary() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Allow photo access to attach evidence.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
      });
      if (!result.canceled && result.assets[0]) {
        setEvidenceUris((prev) => [...prev, result.assets[0]!.uri]);
      }
    } catch (err) {
      Alert.alert('Could not open photos', err instanceof Error ? err.message : 'Unknown error');
    }
  }

  function handleAddEvidence() {
    Alert.alert(
      'Add evidence',
      'Where do you want to grab the photo from?',
      [
        { text: 'Take photo', onPress: pickFromCamera },
        { text: 'Choose from library', onPress: pickFromLibrary },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }

  function removeEvidence(uri: string) {
    setEvidenceUris((prev) => prev.filter((u) => u !== uri));
  }

  async function handleSave() {
    if (!sheetCategory || !bookingId) return;
    if (sheetCategory.type === 'CUSTOM' && !customLabel.trim()) {
      Alert.alert('Custom label required', 'Give this entry a short title.');
      return;
    }

    setIsUploading(true);
    try {
      const evidenceUrls = await Promise.all(
        evidenceUris.map((uri) => uploadImageToFirebase(uri, 'care-logs')),
      );

      await createLog.mutateAsync({
        type: sheetCategory.type,
        ...(sheetCategory.type === 'CUSTOM' ? { customLabel: customLabel.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        occurredAt: occurredAt.toISOString(),
        evidenceUrls,
      });

      closeSheet();
    } catch (err) {
      Alert.alert('Could not save entry', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Active booking banner */}
        {activeBooking ? (
          <View style={styles.childCard}>
            <View style={[styles.childAvatar, { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryMuted }]}>
              <Ionicons name="person" size={22} color={colors.primary} />
            </View>
            <View style={styles.childInfo}>
              <Text style={styles.childName}>
                {activeBooking.motherFirstName} {activeBooking.motherLastName}
              </Text>
              <View style={styles.lastActivityBadge}>
                <Text style={styles.lastActivityText}>On shift</Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={[styles.childCard, { justifyContent: 'center' }]}>
            <Text style={styles.logEntrySubtitle}>
              No in-progress booking — start a shift to log activities.
            </Text>
          </View>
        )}

        {/* Quick Entry Grid */}
        <View style={styles.quickGrid}>
          {CATEGORIES.map((entry) => (
            <Pressable
              key={entry.type}
              style={styles.quickEntry}
              onPress={() => openSheet(entry)}
              disabled={!activeBooking}
            >
              <View
                style={[
                  styles.quickIconBox,
                  { backgroundColor: entry.bg, opacity: activeBooking ? 1 : 0.5 },
                ]}
              >
                <Ionicons name={entry.icon} size={28} color={colors.textPrimary} />
              </View>
              <Text style={styles.quickLabel}>{entry.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Today's Log Section */}
        <View style={styles.logSection}>
          <View style={styles.logHeader}>
            <Text style={styles.logTitle}>Today&apos;s log</Text>
            <View style={styles.logCountBadge}>
              <Text style={styles.logCountText}>{sortedEntries.length}</Text>
            </View>
          </View>

          {loadingEntries ? (
            <ActivityIndicator color={colors.primary} />
          ) : sortedEntries.length === 0 ? (
            <Text style={styles.logEntrySubtitle}>
              No entries yet. Tap a category above to start logging.
            </Text>
          ) : (
            <View style={styles.logList}>
              {sortedEntries.map((entry) => {
                const cfg = CATEGORY_BY_TYPE[entry.type];
                return (
                  <Pressable key={entry.id} style={styles.logEntry}>
                    <View style={[styles.logIconCircle, { backgroundColor: cfg.bg }]}>
                      <Ionicons name={cfg.icon} size={20} color={colors.textPrimary} />
                    </View>
                    <View style={styles.logEntryInfo}>
                      <Text style={styles.logEntryTitle}>{entryTitle(entry)}</Text>
                      <Text style={styles.logEntrySubtitle} numberOfLines={1}>
                        {entry.notes ?? '—'}
                        {entry.evidenceUrls.length > 0 ? `  •  ${entry.evidenceUrls.length} photo${entry.evidenceUrls.length > 1 ? 's' : ''}` : ''}
                      </Text>
                    </View>
                    <View style={styles.logEntryRight}>
                      <Text style={styles.logEntryTime}>{fmtTime(entry.occurredAt)}</Text>
                      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Header */}
      <View style={styles.header} pointerEvents="box-none">
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Pressable style={styles.iconBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
            </Pressable>
            <View>
              <Text style={styles.headerTitle}>Care log</Text>
              <Text style={styles.headerSubtitle}>{TODAY_LABEL}</Text>
            </View>
          </View>
          <Pressable style={styles.iconBtn}>
            <Ionicons name="settings-outline" size={22} color={colors.textPrimary} />
          </Pressable>
        </View>
      </View>


      {/* Bottom Sheet */}
      <Modal
        visible={sheetCategory !== null}
        transparent
        animationType="slide"
        onRequestClose={closeSheet}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.sheetOverlay}
        >
          <Pressable style={{ flex: 1 }} onPress={closeSheet} />
          <View style={styles.sheet}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.sheetHandle} />

              <View style={styles.sheetHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  {sheetCategory && (
                    <View style={[styles.logIconCircle, { backgroundColor: sheetCategory.bg }]}>
                      <Ionicons name={sheetCategory.icon} size={20} color={colors.textPrimary} />
                    </View>
                  )}
                  <Text style={styles.sheetTitle}>
                    Log {sheetCategory?.label.toLowerCase()}
                  </Text>
                </View>
                <Pressable style={styles.iconBtn} onPress={closeSheet}>
                  <Ionicons name="close" size={22} color={colors.textPrimary} />
                </Pressable>
              </View>

              {/* Custom label (only for CUSTOM type) */}
              {sheetCategory?.type === 'CUSTOM' && (
                <View style={styles.timeSelector}>
                  <Text style={styles.timeSelectorLabel}>WHAT HAPPENED?</Text>
                  <TextInput
                    value={customLabel}
                    onChangeText={setCustomLabel}
                    placeholder="e.g. Tummy time, Story reading"
                    placeholderTextColor={colors.textPlaceholder}
                    style={[styles.timeSelectorValue, { paddingVertical: 4 }]}
                  />
                </View>
              )}

              {/* Notes */}
              <Pressable
                style={styles.timeSelector}
                onPress={handleOpenTimePicker}
                hitSlop={10}
              >
                <Text style={styles.timeSelectorLabel}>TIME</Text>
                <View style={styles.timeSelectorRow}>
                  <Text style={styles.timeSelectorValue}>
                    {occurredAt.toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </Text>
                  <Ionicons name="time-outline" size={18} color={colors.textMuted} />
                </View>
              </Pressable>

              {/* Notes */}
              <TextInput
                style={styles.notesInput}
                value={notes}
                onChangeText={setNotes}
                placeholder="Add notes..."
                placeholderTextColor={colors.textPlaceholder}
                multiline
                textAlignVertical="top"
              />

              {/* Evidence */}
              <View style={evidenceStyles.section}>
                <Text style={styles.timeSelectorLabel}>EVIDENCE</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={evidenceStyles.row}
                >
                  {evidenceUris.map((uri) => (
                    <View key={uri} style={evidenceStyles.thumbWrap}>
                      <Image source={{ uri }} style={evidenceStyles.thumb} />
                      <Pressable
                        style={evidenceStyles.thumbRemove}
                        onPress={() => removeEvidence(uri)}
                      >
                        <Ionicons name="close" size={14} color={colors.white} />
                      </Pressable>
                    </View>
                  ))}
                  <Pressable style={evidenceStyles.addBtn} onPress={handleAddEvidence}>
                    <Ionicons name="camera-outline" size={22} color={colors.textMuted} />
                    <Text style={evidenceStyles.addBtnText}>Add photo</Text>
                  </Pressable>
                </ScrollView>
              </View>

              {/* Save */}
              <Pressable
                style={[styles.saveBtn, isUploading && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={isUploading}
              >
                {isUploading ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.saveBtnText}>Save entry</Text>
                )}
              </Pressable>

              <Pressable style={styles.discardBtn} onPress={closeSheet} disabled={isUploading}>
                <Text style={styles.discardBtnText}>Discard</Text>
              </Pressable>
            </ScrollView>
          </View>

          {Platform.OS === 'ios' && showTimePicker && (
            <View style={styles.pickerOverlay}>
              <Pressable style={{ flex: 1 }} onPress={() => setShowTimePicker(false)} />
              <View style={styles.pickerSheet}>
                <View style={styles.pickerHeader}>
                  <Text style={styles.pickerTitle}>Log time</Text>
                  <Pressable onPress={() => setShowTimePicker(false)} hitSlop={12}>
                    <Text style={styles.pickerDone}>Done</Text>
                  </Pressable>
                </View>
                <DateTimePicker
                  value={occurredAt}
                  mode="time"
                  is24Hour={false}
                  display="spinner"
                  textColor={colors.textPrimary}
                  themeVariant="light"
                  onChange={handleTimeChange}
                  style={{ height: 200 }}
                />
              </View>
            </View>
          )}
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

const evidenceStyles = StyleSheet.create({
  section: {
    gap: 10,
    marginBottom: 20,
  },
  row: {
    gap: 10,
    paddingVertical: 4,
  },
  thumbWrap: {
    width: 80,
    height: 80,
    borderRadius: 12,
    overflow: 'hidden',
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  thumbRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    width: 80,
    height: 80,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.taupe,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: 'rgba(227,213,202,0.15)',
  },
  addBtnText: {
    fontSize: 11,
    color: colors.textMuted,
  },
});
