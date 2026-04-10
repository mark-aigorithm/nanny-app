import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { IMG_HEADER_AVATAR, IMG_PROFILE_PHOTO } from '@mobile/mocks/images';
import { MOCK_PROFILE, SETTINGS_ITEMS } from '@mobile/mocks';
import { colors } from '@mobile/theme';
import { styles } from './styles/mother-profile-wallet-screen.styles';

export default function MotherProfileWalletScreen() {
  const router = useRouter();
  const profile = MOCK_PROFILE;

  const handleSettingsPress = (id: string) => {
    switch (id) {
      case 'account':
        router.push('/(parent)/account-details' as never);
        break;
      case 'payment':
        router.push('/(parent)/payment-methods' as never);
        break;
      case 'notifications':
        router.push('/(parent)/notifications');
        break;
      case 'help':
        router.push('/(parent)/customer-support' as never);
        break;
      case 'nannies':
        router.push('/(parent)/search');
        break;
      case 'logout':
        router.replace('/(auth)/splash');
        break;
      default:
        break;
    }
  };

  return (
    <View style={styles.container}>
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
              <Ionicons name="camera" size={14} color={colors.white} />
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
            <Ionicons name="location-sharp" size={14} color={colors.textTertiary} />
            <Text style={styles.locationText}>{profile.location}</Text>
          </View>

          {/* Edit profile button */}
          <Pressable style={styles.editProfileBtn} onPress={() => router.push('/(parent)/account-details' as never)}>
            <Text style={styles.editProfileText}>Edit profile</Text>
          </Pressable>
        </View>

        {/* ── Wallet Row ── */}
        <View style={styles.walletRow}>
          {/* Balance card */}
          <View style={styles.walletCard}>
            <Ionicons name="wallet-outline" size={20} color={colors.primary} />
            <Text style={styles.walletAmount}>
              ${profile.walletBalance.toFixed(2)}
            </Text>
            <Text style={styles.walletLabel}>Available credit</Text>
          </View>

          {/* Rewards card */}
          <View style={styles.walletCard}>
            <Ionicons name="star-outline" size={20} color={colors.bronze} />
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
                  color={item.isDestructive ? colors.errorDark : colors.textPrimary}
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
                  <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                )}
              </View>
            </Pressable>
          ))}

          {/* Switch to Nanny View */}
          <Pressable
            style={styles.settingsItem}
            onPress={() => router.replace('/(nanny)/dashboard')}
          >
            <View style={styles.settingsItemLeft}>
              <Ionicons name="swap-horizontal-outline" size={20} color={colors.primary} />
              <Text style={[styles.settingsItemLabel, { color: colors.primary }]}>
                Switch to Nanny View
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.primary} />
          </Pressable>
        </View>
      </ScrollView>

      {/* ── Fixed: Header ── */}
      <View style={styles.header} pointerEvents="box-none">
        <View style={styles.headerRow}>
          <Pressable style={styles.headerIconBtn} onPress={() => router.back()}>
            <Ionicons name="menu" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Profile</Text>
          <Pressable onPress={() => router.push('/(parent)/account-details' as never)}>
            <Image source={{ uri: IMG_HEADER_AVATAR }} style={styles.headerAvatar} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

