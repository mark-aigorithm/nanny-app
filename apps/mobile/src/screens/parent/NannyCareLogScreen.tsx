import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  TextInput,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors } from '@mobile/theme';
import { styles } from './styles/nanny-care-log-screen.styles';

// ASSUMPTION: Images sourced from Figma CDN — expire in 7 days.
// Replace with S3/CDN URLs or bundled assets before production.
const IMG_BABY = 'https://www.figma.com/api/mcp/asset/dd892144-8adb-4fbb-b53c-a456b48cc568';

// ASSUMPTION: Care log data will come from GET /bookings/:id/care-log.
// Using hardcoded mock data until the backend service is ready.
const MOCK_CHILD = {
  name: 'Baby Liam',
  age: '8 months',
  lastActivity: 'Nap ended 45m ago',
};

type QuickEntry = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  bg: string;
};

const QUICK_ENTRIES: QuickEntry[] = [
  { label: 'Meal', icon: 'restaurant', bg: colors.warmLight },
  { label: 'Nap', icon: 'moon', bg: colors.tintPurple },
  { label: 'Diaper', icon: 'happy', bg: colors.successLight },
  { label: 'Activity', icon: 'game-controller', bg: colors.tintYellow },
];

type LogEntry = {
  id: string;
  type: 'diaper' | 'meal' | 'nap';
  title: string;
  subtitle: string;
  time: string;
  iconBg: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const MOCK_LOG_ENTRIES: LogEntry[] = [
  {
    id: '1',
    type: 'diaper',
    title: 'Diaper Change',
    subtitle: 'Wet \u2022 Soft',
    time: '2:15 PM',
    iconBg: colors.successLight,
    icon: 'happy',
  },
  {
    id: '2',
    type: 'meal',
    title: 'Meal',
    subtitle: '150ml Formula',
    time: '12:45 PM',
    iconBg: colors.warmLight,
    icon: 'restaurant',
  },
  {
    id: '3',
    type: 'nap',
    title: 'Nap',
    subtitle: '45 minutes',
    time: '11:30 AM',
    iconBg: colors.tintPurple,
    icon: 'moon',
  },
];

export default function NannyCareLogScreen() {
  const router = useRouter();
  const [activeToggle, setActiveToggle] = useState<'falling-asleep' | 'woke-up'>('falling-asleep');
  const [bottomSheetVisible, setBottomSheetVisible] = useState(false);

  return (
    <View style={styles.container}>
      {/* ── Scrollable main content ── */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Child Banner Card */}
        <View style={styles.childCard}>
          <Image source={{ uri: IMG_BABY }} style={styles.childAvatar} />
          <View style={styles.childInfo}>
            <Text style={styles.childName}>
              {MOCK_CHILD.name}, {MOCK_CHILD.age}
            </Text>
            <View style={styles.lastActivityBadge}>
              <Text style={styles.lastActivityText}>Last: {MOCK_CHILD.lastActivity}</Text>
            </View>
          </View>
        </View>

        {/* Quick Entry Grid */}
        <View style={styles.quickGrid}>
          {QUICK_ENTRIES.map((entry) => (
            <Pressable
              key={entry.label}
              style={styles.quickEntry}
              onPress={() => {
                if (entry.label === 'Nap') setBottomSheetVisible(true);
              }}
            >
              <View style={[styles.quickIconBox, { backgroundColor: entry.bg }]}>
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
              <Text style={styles.logCountText}>12</Text>
            </View>
          </View>

          <View style={styles.logList}>
            {MOCK_LOG_ENTRIES.map((entry) => (
              <Pressable key={entry.id} style={styles.logEntry}>
                <View style={[styles.logIconCircle, { backgroundColor: entry.iconBg }]}>
                  <Ionicons name={entry.icon} size={20} color={colors.textPrimary} />
                </View>
                <View style={styles.logEntryInfo}>
                  <Text style={styles.logEntryTitle}>{entry.title}</Text>
                  <Text style={styles.logEntrySubtitle}>{entry.subtitle}</Text>
                </View>
                <View style={styles.logEntryRight}>
                  <Text style={styles.logEntryTime}>{entry.time}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* ── Fixed: Header ── */}
      <View style={styles.header} pointerEvents="box-none">
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Pressable style={styles.iconBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
            </Pressable>
            <View>
              <Text style={styles.headerTitle}>Care log</Text>
              <Text style={styles.headerSubtitle}>Apr 12</Text>
            </View>
          </View>
          <Pressable style={styles.iconBtn}>
            <Ionicons name="settings-outline" size={22} color={colors.textPrimary} />
          </Pressable>
        </View>
      </View>

      {/* ── Sticky Footer ── */}
      <View style={styles.footer}>
        <Pressable style={styles.sendUpdateBtn}>
          <Ionicons name="send-outline" size={18} color={colors.success} />
          <Text style={styles.sendUpdateText}>Send daily update to mom</Text>
        </Pressable>
      </View>

      {/* ── Bottom Sheet (Modal) ── */}
      <Modal
        visible={bottomSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setBottomSheetVisible(false)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setBottomSheetVisible(false)}>
          <Pressable style={styles.sheet} onPress={() => { /* prevent close */ }}>
            {/* Drag handle */}
            <View style={styles.sheetHandle} />

            {/* Sheet header */}
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Log nap</Text>
              <Pressable style={styles.iconBtn} onPress={() => setBottomSheetVisible(false)}>
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </Pressable>
            </View>

            {/* Time selector */}
            <View style={styles.timeSelector}>
              <Text style={styles.timeSelectorLabel}>START TIME</Text>
              <View style={styles.timeSelectorRow}>
                <Text style={styles.timeSelectorValue}>2:30 PM</Text>
                <Ionicons name="time-outline" size={20} color={colors.textMuted} />
              </View>
            </View>

            {/* Toggle */}
            <View style={styles.toggleRow}>
              <Pressable
                style={[
                  styles.toggleBtn,
                  activeToggle === 'falling-asleep' && styles.toggleBtnActive,
                ]}
                onPress={() => setActiveToggle('falling-asleep')}
              >
                <Text
                  style={[
                    styles.toggleText,
                    activeToggle === 'falling-asleep' && styles.toggleTextActive,
                  ]}
                >
                  Falling asleep
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.toggleBtn,
                  activeToggle === 'woke-up' && styles.toggleBtnActive,
                ]}
                onPress={() => setActiveToggle('woke-up')}
              >
                <Text
                  style={[
                    styles.toggleText,
                    activeToggle === 'woke-up' && styles.toggleTextActive,
                  ]}
                >
                  Woke up
                </Text>
              </Pressable>
            </View>

            {/* Notes */}
            <TextInput
              style={styles.notesInput}
              placeholder="Add notes..."
              placeholderTextColor={colors.textPlaceholder}
              multiline
              textAlignVertical="top"
            />

            {/* Save button */}
            <Pressable style={styles.saveBtn}>
              <Text style={styles.saveBtnText}>Save entry</Text>
            </Pressable>

            {/* Discard button */}
            <Pressable style={styles.discardBtn} onPress={() => setBottomSheetVisible(false)}>
              <Text style={styles.discardBtnText}>Discard</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

