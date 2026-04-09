import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  StyleSheet,
  Platform,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

// ASSUMPTION: Images sourced from Figma CDN — expire in 7 days.
// Replace with S3/CDN URLs or bundled assets before production.
const IMG_HEADER_AVATAR = 'https://www.figma.com/api/mcp/asset/3fcb7428-8e0f-4525-8142-e2358dfa4082';
const IMG_PROFILE_PHOTO = 'https://www.figma.com/api/mcp/asset/07ae7b45-0147-4684-bac1-5564fb715bc5';

// ASSUMPTION: Profile data will come from GET /users/me.
// Using hardcoded mock data until the backend service is ready.
// TODO: Replace with useProfile() React Query hook
const MOCK_PROFILE = {
  name: 'Sarah Johnson',
  location: 'Brooklyn, NY',
  memberTier: 'Pro Member',
  walletBalance: 47.5,
  rewardPoints: 320,
  rewardValue: 3.2,
  favouriteNanniesCount: 5,
};

// ASSUMPTION: Font 'Manrope' is loaded at the app root via expo-font / useFonts.
// For native builds, add useFonts({ Manrope_400Regular, Manrope_600SemiBold, Manrope_700Bold })
// from @expo-google-fonts/manrope in the root _layout.tsx.

type SettingsItem = {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  badge?: string;
  isDestructive?: boolean;
};

const SETTINGS_ITEMS: SettingsItem[] = [
  { id: 'account', label: 'Account details', icon: 'person-outline' },
  { id: 'nannies', label: 'My nannies', icon: 'heart-outline', badge: '5' },
  { id: 'payment', label: 'Payment methods', icon: 'card-outline' },
  { id: 'notifications', label: 'Notifications', icon: 'notifications-outline' },
  { id: 'help', label: 'Help & support', icon: 'help-circle-outline' },
  { id: 'logout', label: 'Log out', icon: 'log-out-outline', isDestructive: true },
];

const STATUS_BAR_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44;
const HEADER_HEIGHT = STATUS_BAR_HEIGHT + 56;

export default function MotherProfileWalletScreen() {
  const router = useRouter();
  const profile = MOCK_PROFILE;

  const handleSettingsPress = (id: string) => {
    // TODO: Wire up navigation to individual settings screens
    switch (id) {
      case 'notifications':
        router.push('/(parent)/notifications' as any);
        break;
      case 'logout':
        // TODO: Call auth sign-out via useAuth hook
        break;
      default:
        break;
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      {/* ── Scrollable main content ── */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero Section ── */}
        <View style={styles.heroSection}>
          {/* Profile photo with camera badge */}
          <Pressable style={styles.profilePhotoWrap}>
            <Image
              source={{ uri: IMG_PROFILE_PHOTO }}
              style={styles.profilePhoto}
              resizeMode="cover"
            />
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={14} color="#ffffff" />
            </View>
          </Pressable>

          {/* Pro Member badge */}
          <View style={styles.memberBadge}>
            <Text style={styles.memberBadgeText}>{profile.memberTier}</Text>
          </View>

          {/* Name */}
          <Text style={styles.profileName}>{profile.name}</Text>

          {/* Location */}
          <View style={styles.locationRow}>
            <Ionicons name="location-sharp" size={14} color="#675d54" />
            <Text style={styles.locationText}>{profile.location}</Text>
          </View>

          {/* Edit profile button */}
          <Pressable style={styles.editProfileBtn}>
            <Text style={styles.editProfileText}>Edit profile</Text>
          </Pressable>
        </View>

        {/* ── Wallet Row ── */}
        <View style={styles.walletRow}>
          {/* Balance card */}
          <View style={styles.walletCard}>
            <Ionicons name="wallet-outline" size={20} color="#97a591" />
            <Text style={styles.walletAmount}>
              ${profile.walletBalance.toFixed(2)}
            </Text>
            <Text style={styles.walletLabel}>Available credit</Text>
          </View>

          {/* Rewards card */}
          <View style={styles.walletCard}>
            <Ionicons name="star-outline" size={20} color="#b89d78" />
            <Text style={styles.rewardsAmount}>
              {profile.rewardPoints}
              <Text style={styles.rewardsPts}> pts</Text>
            </Text>
            <Text style={styles.walletLabel}>
              {'\u2248'} ${profile.rewardValue.toFixed(2)} value
            </Text>
            <Pressable>
              <Text style={styles.earnMore}>Earn more</Text>
            </Pressable>
          </View>
        </View>

        {/* ── Settings List ── */}
        <View style={styles.settingsList}>
          {SETTINGS_ITEMS.map((item) => (
            <Pressable
              key={item.id}
              style={styles.settingsItem}
              onPress={() => handleSettingsPress(item.id)}
            >
              <View style={styles.settingsItemLeft}>
                <Ionicons
                  name={item.icon}
                  size={20}
                  color={item.isDestructive ? '#ba1a1a' : '#1b1c1b'}
                />
                <Text
                  style={[
                    styles.settingsItemLabel,
                    item.isDestructive && styles.settingsItemLabelDestructive,
                  ]}
                >
                  {item.label}
                </Text>
              </View>
              <View style={styles.settingsItemRight}>
                {item.badge != null && (
                  <View style={styles.settingsBadge}>
                    <Text style={styles.settingsBadgeText}>{item.badge}</Text>
                  </View>
                )}
                {!item.isDestructive && (
                  <Ionicons name="chevron-forward" size={18} color="#675d54" />
                )}
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {/* ── Fixed: Header ── */}
      <View style={styles.header} pointerEvents="box-none">
        <View style={styles.headerRow}>
          <Pressable style={styles.headerIconBtn}>
            <Ionicons name="menu" size={22} color="#1b1c1b" />
          </Pressable>
          <Text style={styles.headerTitle}>Profile</Text>
          <Image source={{ uri: IMG_HEADER_AVATAR }} style={styles.headerAvatar} />
        </View>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fcf9f7',
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: HEADER_HEIGHT + 16,
    // TODO: Update bottom padding once BottomNav is updated with
    // the correct tabs for this screen (Home, Bookings, Support, Profile)
    paddingBottom: 128,
    paddingHorizontal: 24,
    gap: 24,
  },

  // Header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(253,250,248,0.8)',
    zIndex: 100,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: STATUS_BAR_HEIGHT + 8,
    paddingBottom: 16,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: -1,
    color: '#1b1c1b',
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0edeb',
    borderWidth: 1,
    borderColor: 'rgba(196,200,191,0.2)',
  },

  // Hero section
  heroSection: {
    backgroundColor: '#ebddd2',
    borderRadius: 16,
    height: 305,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  profilePhotoWrap: {
    width: 96,
    height: 96,
    marginBottom: 4,
  },
  profilePhoto: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#97a591',
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberBadge: {
    backgroundColor: '#b89d78',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  memberBadgeText: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 12,
    lineHeight: 16,
    color: '#ffffff',
  },
  profileName: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 20,
    lineHeight: 28,
    color: '#1b1c1b',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationText: {
    fontFamily: 'Manrope',
    fontWeight: '400',
    fontSize: 14,
    lineHeight: 20,
    color: '#675d54',
  },
  editProfileBtn: {
    borderWidth: 1.5,
    borderColor: '#97a591',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginTop: 4,
  },
  editProfileText: {
    fontFamily: 'Manrope',
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 20,
    color: '#97a591',
  },

  // Wallet row
  walletRow: {
    flexDirection: 'row',
    gap: 16,
  },
  walletCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    gap: 4,
  },
  walletAmount: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 24,
    lineHeight: 32,
    color: '#97a591',
  },
  rewardsAmount: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 24,
    lineHeight: 32,
    color: '#1b1c1b',
  },
  rewardsPts: {
    fontFamily: 'Manrope',
    fontWeight: '600',
    fontSize: 12,
    color: '#1b1c1b',
  },
  walletLabel: {
    fontFamily: 'Manrope',
    fontWeight: '400',
    fontSize: 12,
    lineHeight: 16,
    color: '#675d54',
  },
  earnMore: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 12,
    lineHeight: 16,
    color: '#97a591',
    marginTop: 2,
  },

  // Settings list
  settingsList: {
    gap: 8,
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    height: 56,
    paddingHorizontal: 16,
  },
  settingsItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingsItemLabel: {
    fontFamily: 'Manrope',
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 20,
    color: '#1b1c1b',
  },
  settingsItemLabelDestructive: {
    color: '#ba1a1a',
    fontWeight: '700',
  },
  settingsItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  settingsBadge: {
    backgroundColor: '#ebddd2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
  },
  settingsBadgeText: {
    fontFamily: 'Manrope',
    fontWeight: '600',
    fontSize: 12,
    lineHeight: 16,
    color: '#6b6158',
  },
});
