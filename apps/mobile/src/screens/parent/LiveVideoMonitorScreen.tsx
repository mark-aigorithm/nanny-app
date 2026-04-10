import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors } from '@mobile/theme';
import { styles } from './styles/live-video-monitor-screen.styles';

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
    borderColor: colors.primary,
    iconBg: colors.primaryMuted,
    iconColor: colors.primary,
  },
  {
    id: '2',
    title: 'Feeding started 6oz',
    subtitle: '09:30 AM \u2022 Kitchen',
    icon: 'restaurant-outline' as const,
    borderColor: colors.bronze,
    iconBg: 'rgba(184,157,120,0.1)',
    iconColor: colors.bronze,
  },
  {
    id: '3',
    title: 'Nap started',
    subtitle: '08:15 AM \u2022 Nursery',
    icon: 'moon-outline' as const,
    borderColor: colors.primaryDark,
    iconBg: 'rgba(85,98,81,0.1)',
    iconColor: colors.primaryDark,
  },
];

export default function LiveVideoMonitorScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
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
            <Ionicons name="home-outline" size={14} color={colors.textPrimary} />
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
              <Ionicons name="expand-outline" size={16} color={colors.white} />
            </Pressable>
          </View>
        </View>

        {/* Awareness Banner */}
        <View style={styles.awarenessBanner}>
          <Ionicons name="eye-outline" size={20} color={colors.textPrimary} />
          <Text style={styles.awarenessText}>Elena has been notified you are watching</Text>
        </View>

        {/* Control Buttons Grid */}
        <View style={styles.controlsGrid}>
          <Pressable style={styles.controlBtn}>
            <Ionicons name="mic-outline" size={24} color={colors.textPrimary} />
            <Text style={styles.controlLabel}>Speak</Text>
          </Pressable>
          <Pressable style={styles.controlBtn}>
            <Ionicons name="camera-outline" size={24} color={colors.textPrimary} />
            <Text style={styles.controlLabel}>Photo</Text>
          </Pressable>
          <Pressable style={styles.controlBtn}>
            <Ionicons name="radio-button-on" size={24} color={colors.textPrimary} />
            <Text style={styles.controlLabel}>Record</Text>
          </Pressable>
        </View>

        {/* Timer Row */}
        <View style={styles.timerRow}>
          <View style={styles.timerLeft}>
            <Ionicons name="time-outline" size={20} color={colors.textPrimary} />
            <Text style={styles.timerText}>01:23:45</Text>
          </View>
          <View style={styles.timerRight}>
            <Pressable style={styles.historyBtn}>
              <Ionicons name="time-outline" size={18} color={colors.textPrimary} />
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
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {/* ── Fixed: Header ── */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Pressable style={styles.backBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.headerTitle}>Live monitor</Text>
          </View>
          <Pressable style={styles.settingsBtn}>
            <Ionicons name="settings-outline" size={22} color={colors.textPrimary} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

