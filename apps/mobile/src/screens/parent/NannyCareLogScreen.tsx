import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  StyleSheet,
  Platform,
  StatusBar,
  TextInput,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

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
  { label: 'Meal', icon: 'restaurant', bg: '#f5dec8' },
  { label: 'Nap', icon: 'moon', bg: '#ddd6ec' },
  { label: 'Diaper', icon: 'happy', bg: '#d4e8d4' },
  { label: 'Activity', icon: 'game-controller', bg: '#f5eac8' },
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
    iconBg: '#d4e8d4',
    icon: 'happy',
  },
  {
    id: '2',
    type: 'meal',
    title: 'Meal',
    subtitle: '150ml Formula',
    time: '12:45 PM',
    iconBg: '#f5dec8',
    icon: 'restaurant',
  },
  {
    id: '3',
    type: 'nap',
    title: 'Nap',
    subtitle: '45 minutes',
    time: '11:30 AM',
    iconBg: '#ddd6ec',
    icon: 'moon',
  },
];

// ASSUMPTION: Font 'Manrope' is loaded at the app root via expo-font / useFonts.

export default function NannyCareLogScreen() {
  const router = useRouter();
  const [activeToggle, setActiveToggle] = useState<'falling-asleep' | 'woke-up'>('falling-asleep');
  const [bottomSheetVisible, setBottomSheetVisible] = useState(false);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

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
                <Ionicons name={entry.icon} size={28} color="#292524" />
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
                  <Ionicons name={entry.icon} size={20} color="#292524" />
                </View>
                <View style={styles.logEntryInfo}>
                  <Text style={styles.logEntryTitle}>{entry.title}</Text>
                  <Text style={styles.logEntrySubtitle}>{entry.subtitle}</Text>
                </View>
                <View style={styles.logEntryRight}>
                  <Text style={styles.logEntryTime}>{entry.time}</Text>
                  <Ionicons name="chevron-forward" size={16} color="#78716c" />
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
              <Ionicons name="arrow-back" size={22} color="#292524" />
            </Pressable>
            <View>
              <Text style={styles.headerTitle}>Care log</Text>
              <Text style={styles.headerSubtitle}>Apr 12</Text>
            </View>
          </View>
          <Pressable style={styles.iconBtn}>
            <Ionicons name="settings-outline" size={22} color="#292524" />
          </Pressable>
        </View>
      </View>

      {/* ── Sticky Footer ── */}
      <View style={styles.footer}>
        <Pressable style={styles.sendUpdateBtn}>
          <Ionicons name="send-outline" size={18} color="#6a9b6a" />
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
                <Ionicons name="close" size={22} color="#292524" />
              </Pressable>
            </View>

            {/* Time selector */}
            <View style={styles.timeSelector}>
              <Text style={styles.timeSelectorLabel}>START TIME</Text>
              <View style={styles.timeSelectorRow}>
                <Text style={styles.timeSelectorValue}>2:30 PM</Text>
                <Ionicons name="time-outline" size={20} color="#78716c" />
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
              placeholderTextColor="#a8a29e"
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

// ─── Layout constants ─────────────────────────────────────────────────────────

const STATUS_BAR_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44;
const HEADER_HEIGHT = STATUS_BAR_HEIGHT + 64;
const FOOTER_HEIGHT = 88;

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fdfaf8',
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: HEADER_HEIGHT + 16,
    paddingBottom: FOOTER_HEIGHT + 24,
    paddingHorizontal: 24,
    gap: 24,
  },

  // Header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(253,250,248,0.92)',
    zIndex: 100,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: STATUS_BAR_HEIGHT + 8,
    paddingBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 18,
    lineHeight: 24,
    color: '#292524',
  },
  headerSubtitle: {
    fontFamily: 'Manrope',
    fontWeight: '500',
    fontSize: 13,
    lineHeight: 18,
    color: '#78716c',
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Child Banner Card
  childCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  childAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f0edeb',
  },
  childInfo: {
    flex: 1,
    gap: 6,
  },
  childName: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 16,
    lineHeight: 22,
    color: '#292524',
  },
  lastActivityBadge: {
    backgroundColor: '#d4e8d4',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 9999,
  },
  lastActivityText: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 11,
    lineHeight: 16,
    color: '#3d6b3d',
  },

  // Quick Entry Grid
  quickGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  quickEntry: {
    flex: 1,
    alignItems: 'center',
    gap: 7,
  },
  quickIconBox: {
    width: 64,
    height: 64,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  quickLabel: {
    fontFamily: 'Manrope',
    fontWeight: '600',
    fontSize: 11,
    lineHeight: 16,
    color: '#78716c',
    textAlign: 'center',
  },

  // Today's Log
  logSection: {
    gap: 16,
  },
  logHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logTitle: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 18,
    lineHeight: 24,
    color: '#292524',
  },
  logCountBadge: {
    backgroundColor: '#e3d5ca',
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 9999,
  },
  logCountText: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 12,
    lineHeight: 18,
    color: '#6b6158',
  },
  logList: {
    gap: 12,
  },
  logEntry: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  logIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logEntryInfo: {
    flex: 1,
    gap: 2,
  },
  logEntryTitle: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 14,
    lineHeight: 20,
    color: '#292524',
  },
  logEntrySubtitle: {
    fontFamily: 'Manrope',
    fontWeight: '400',
    fontSize: 13,
    lineHeight: 18,
    color: '#78716c',
  },
  logEntryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logEntryTime: {
    fontFamily: 'Manrope',
    fontWeight: '500',
    fontSize: 13,
    lineHeight: 18,
    color: '#78716c',
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(252,249,247,0.9)',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
    zIndex: 100,
  },
  sendUpdateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 56,
    borderRadius: 9999,
    borderWidth: 2,
    borderColor: '#6a9b6a',
    backgroundColor: 'transparent',
  },
  sendUpdateText: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 15,
    lineHeight: 22,
    color: '#6a9b6a',
  },

  // Bottom Sheet
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  sheetHandle: {
    width: 40,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#e3d5ca',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 20,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  sheetTitle: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 18,
    lineHeight: 24,
    color: '#292524',
  },

  // Time selector
  timeSelector: {
    backgroundColor: 'rgba(227,213,202,0.5)',
    borderRadius: 12,
    padding: 16,
    gap: 6,
    marginBottom: 16,
  },
  timeSelectorLabel: {
    fontFamily: 'Manrope',
    fontWeight: '600',
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.8,
    color: '#78716c',
    textTransform: 'uppercase',
  },
  timeSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeSelectorValue: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 18,
    lineHeight: 24,
    color: '#292524',
  },

  // Toggle
  toggleRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  toggleBtn: {
    flex: 1,
    height: 44,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(227,213,202,0.3)',
  },
  toggleBtnActive: {
    backgroundColor: '#6a9b6a',
  },
  toggleText: {
    fontFamily: 'Manrope',
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 20,
    color: '#78716c',
  },
  toggleTextActive: {
    color: '#ffffff',
  },

  // Notes
  notesInput: {
    backgroundColor: 'rgba(227,213,202,0.2)',
    borderRadius: 12,
    padding: 16,
    height: 88,
    fontFamily: 'Manrope',
    fontWeight: '400',
    fontSize: 14,
    lineHeight: 20,
    color: '#292524',
    marginBottom: 20,
  },

  // Save / Discard
  saveBtn: {
    backgroundColor: '#6a9b6a',
    height: 56,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6a9b6a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 12,
  },
  saveBtnText: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 16,
    lineHeight: 22,
    color: '#ffffff',
  },
  discardBtn: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discardBtnText: {
    fontFamily: 'Manrope',
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 20,
    color: '#78716c',
  },
});
