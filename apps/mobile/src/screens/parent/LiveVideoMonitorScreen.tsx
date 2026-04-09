import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  StyleSheet,
  Platform,
  StatusBar,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

// ASSUMPTION: Video feed URL will come from a real RTSP/HLS stream service.
// Using a placeholder Figma asset until the live streaming backend is ready.
const IMG_VIDEO_FEED = 'https://www.figma.com/api/mcp/asset/34497713-eb8c-45c7-b74a-3d6e83988202';

// ASSUMPTION: Activity data will come from GET /bookings/:id/activity or a realtime feed.
// Using hardcoded mock data until the backend service is ready.
const MOCK_ACTIVITIES = [
  {
    id: '1',
    title: 'Motion detected',
    subtitle: '10:45 AM \u2022 Nursery Cam',
    icon: 'notifications-outline' as const,
    borderColor: '#97a591',
    iconBg: 'rgba(151,165,145,0.1)',
    iconColor: '#97a591',
  },
  {
    id: '2',
    title: 'Feeding started 6oz',
    subtitle: '09:30 AM \u2022 Kitchen',
    icon: 'restaurant-outline' as const,
    borderColor: '#b89d78',
    iconBg: 'rgba(184,157,120,0.1)',
    iconColor: '#b89d78',
  },
  {
    id: '3',
    title: 'Nap started',
    subtitle: '08:15 AM \u2022 Nursery',
    icon: 'moon-outline' as const,
    borderColor: '#556251',
    iconBg: 'rgba(85,98,81,0.1)',
    iconColor: '#556251',
  },
];

// ASSUMPTION: Font 'Manrope' is loaded at the app root via expo-font / useFonts.

export default function LiveVideoMonitorScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      {/* ── Scrollable main content ── */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Video Player Section */}
        <View style={styles.videoContainer}>
          <Image source={{ uri: IMG_VIDEO_FEED }} style={styles.videoFeed} resizeMode="cover" />

          {/* LIVE badge — top-left */}
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>

          {/* Camera selector — top-right */}
          <View style={styles.cameraSelector}>
            <Ionicons name="home-outline" size={14} color="#1b1c1b" />
            <Text style={styles.cameraSelectorText}>Nursery</Text>
          </View>

          {/* Status bar — bottom-left */}
          <View style={styles.statusBar}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>Elena Martinez is on duty</Text>
          </View>

          {/* Quality + fullscreen — bottom-right */}
          <View style={styles.qualityRow}>
            <Text style={styles.qualityText}>1080p HD</Text>
            <Pressable style={styles.fullscreenBtn}>
              <Ionicons name="expand-outline" size={16} color="#ffffff" />
            </Pressable>
          </View>
        </View>

        {/* Awareness Banner */}
        <View style={styles.awarenessBanner}>
          <Ionicons name="eye-outline" size={20} color="#1b1c1b" />
          <Text style={styles.awarenessText}>Elena has been notified you are watching</Text>
        </View>

        {/* Control Buttons Grid */}
        <View style={styles.controlsGrid}>
          <Pressable style={styles.controlBtn}>
            <Ionicons name="mic-outline" size={24} color="#1b1c1b" />
            <Text style={styles.controlLabel}>Speak</Text>
          </Pressable>
          <Pressable style={styles.controlBtn}>
            <Ionicons name="camera-outline" size={24} color="#1b1c1b" />
            <Text style={styles.controlLabel}>Photo</Text>
          </Pressable>
          <Pressable style={styles.controlBtn}>
            <Ionicons name="radio-button-on" size={24} color="#1b1c1b" />
            <Text style={styles.controlLabel}>Record</Text>
          </Pressable>
        </View>

        {/* Timer Row */}
        <View style={styles.timerRow}>
          <View style={styles.timerLeft}>
            <Ionicons name="time-outline" size={20} color="#1b1c1b" />
            <Text style={styles.timerText}>01:23:45</Text>
          </View>
          <View style={styles.timerRight}>
            <Pressable style={styles.historyBtn}>
              <Ionicons name="time-outline" size={18} color="#1b1c1b" />
            </Pressable>
            <Pressable style={styles.stopBtn}>
              <View style={styles.stopIcon} />
              <Text style={styles.stopBtnText}>Stop</Text>
            </Pressable>
          </View>
        </View>

        {/* Recent Activity Section */}
        <View style={styles.activitySection}>
          <Text style={styles.activityHeading}>Recent activity</Text>
          {MOCK_ACTIVITIES.map((item) => (
            <Pressable key={item.id} style={[styles.activityCard, { borderLeftColor: item.borderColor }]}>
              <View style={styles.activityLeft}>
                <View style={[styles.activityIconCircle, { backgroundColor: item.iconBg }]}>
                  <Ionicons name={item.icon} size={20} color={item.iconColor} />
                </View>
                <View style={styles.activityTextCol}>
                  <Text style={styles.activityTitle}>{item.title}</Text>
                  <Text style={styles.activitySubtitle}>{item.subtitle}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#999" />
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {/* ── Fixed: Header ── */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Pressable style={styles.backBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={22} color="#1b1c1b" />
            </Pressable>
            <Text style={styles.headerTitle}>Live monitor</Text>
          </View>
          <Pressable style={styles.settingsBtn}>
            <Ionicons name="settings-outline" size={22} color="#1b1c1b" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ─── Layout constants ─────────────────────────────────────────────────────────

const STATUS_BAR_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44;
const HEADER_HEIGHT = STATUS_BAR_HEIGHT + 64;

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
    paddingBottom: 40,
    paddingHorizontal: 24,
    gap: 16,
  },

  // Header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fdfaf8',
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
    gap: 16,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 18,
    lineHeight: 24,
    color: '#1b1c1b',
  },
  settingsBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Video Player
  videoContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#f0edeb',
    aspectRatio: 342 / 256.5,
  },
  videoFeed: {
    width: '100%',
    height: '100%',
  },
  liveBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#c0634a',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ffffff',
  },
  liveText: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 10,
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  cameraSelector: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
  },
  cameraSelectorText: {
    fontFamily: 'Manrope',
    fontWeight: '600',
    fontSize: 12,
    color: '#1b1c1b',
  },
  statusBar: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4ade80',
  },
  statusText: {
    fontFamily: 'Manrope',
    fontWeight: '500',
    fontSize: 13,
    color: '#ffffff',
  },
  qualityRow: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qualityText: {
    fontFamily: 'Manrope',
    fontWeight: '600',
    fontSize: 11,
    color: '#ffffff',
  },
  fullscreenBtn: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Awareness Banner
  awarenessBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: '#e3d5ca',
    borderRadius: 16,
    padding: 16,
  },
  awarenessText: {
    flex: 1,
    fontFamily: 'Manrope',
    fontWeight: '500',
    fontSize: 14,
    lineHeight: 20,
    color: '#1b1c1b',
  },

  // Controls Grid
  controlsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  controlBtn: {
    flex: 1,
    height: 72,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e3d5ca',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  controlLabel: {
    fontFamily: 'Manrope',
    fontWeight: '600',
    fontSize: 12,
    color: '#1b1c1b',
  },

  // Timer Row
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timerText: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 18,
    lineHeight: 24,
    color: '#1b1c1b',
  },
  timerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  historyBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#f0edeb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#c0634a',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 9999,
  },
  stopIcon: {
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: '#ffffff',
  },
  stopBtnText: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 14,
    color: '#ffffff',
  },

  // Recent Activity
  activitySection: {
    gap: 12,
    marginTop: 8,
  },
  activityHeading: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 18,
    lineHeight: 24,
    color: '#1b1c1b',
  },
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  activityLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  activityIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityTextCol: {
    flex: 1,
    gap: 2,
  },
  activityTitle: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 14,
    lineHeight: 20,
    color: '#1b1c1b',
  },
  activitySubtitle: {
    fontFamily: 'Manrope',
    fontWeight: '400',
    fontSize: 12,
    lineHeight: 16,
    color: '#444842',
  },
});
