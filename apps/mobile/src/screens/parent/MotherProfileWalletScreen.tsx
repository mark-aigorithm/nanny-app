import React from 'react';
import { View, Text, ScrollView, Pressable, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import BottomNav from '@mobile/components/BottomNav';
import { Avatar, IconCircle } from '@mobile/components/ui';
import { useSignOut } from '@mobile/hooks/useAuth';
import { useGuestGate } from '@mobile/hooks/useGuestGate';
import { useUnreadMessageCount } from '@mobile/hooks/useMessaging';
import { useUserProfileStore } from '@mobile/store/userProfileStore';
import { colors } from '@mobile/theme';
import { styles } from './styles/mother-profile-wallet-screen.styles';

// Uber-style Account tab: name header, 2x2 quick tiles, promo cards, list.
// Screen-specific config stays local (see CLAUDE.md).
const QUICK_TILES: {
  key: 'help' | 'wallet' | 'inbox' | 'notifications';
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}[] = [
  { key: 'help', label: 'Help', icon: 'help-buoy-outline' },
  { key: 'wallet', label: 'Wallet', icon: 'wallet-outline' },
  { key: 'inbox', label: 'Inbox', icon: 'mail-outline' },
  { key: 'notifications', label: 'Notifications', icon: 'notifications-outline' },
];

export default function MotherProfileWalletScreen() {
  const router = useRouter();
  const profile = useUserProfileStore((s) => s.profile);
  const signOut = useSignOut();
  const { isGuest } = useGuestGate();
  const { data: unreadData } = useUnreadMessageCount(!isGuest);
  const hasUnread = (unreadData?.unreadCount ?? 0) > 0;

  const displayName = profile
    ? `${profile.firstName} ${profile.lastName}`.trim()
    : '';
  const isVerified = profile?.idVerificationStatus === 'APPROVED';
  const memberYear = profile ? new Date(profile.createdAt).getFullYear() : null;

  const handleTilePress = (key: (typeof QUICK_TILES)[number]['key']) => {
    switch (key) {
      case 'help':
        router.push({
          pathname: '/(parent)/customer-support',
          params: { returnTo: 'mother-profile' },
        } as never);
        break;
      case 'wallet':
        router.push('/(parent)/payment-methods' as never);
        break;
      case 'inbox':
        router.push('/(parent)/messages' as never);
        break;
      case 'notifications':
        router.push('/(parent)/notifications' as never);
        break;
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor={colors.transparent} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Name header */}
        <View style={styles.headerRow}>
          <Text style={styles.name} numberOfLines={1}>
            {displayName}
          </Text>
          <Avatar
            uri={profile?.avatarUrl ?? undefined}
            size="xl"
            fallbackInitial={profile?.firstName?.[0]}
          />
        </View>
        <View style={styles.statusPill}>
          {isVerified ? (
            <>
              <Ionicons name="shield-checkmark" size={12} color={colors.primaryDark} />
              <Text style={styles.statusPillText}>Verified</Text>
            </>
          ) : (
            <Text style={styles.statusPillText}>
              {memberYear ? `Member since ${memberYear}` : 'Member'}
            </Text>
          )}
        </View>

        {/* 2x2 quick tiles */}
        <View style={styles.tileGrid}>
          {QUICK_TILES.map((tile) => (
            <Pressable
              key={tile.key}
              style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
              onPress={() => handleTilePress(tile.key)}
            >
              <View style={styles.tileIconWrap}>
                <Ionicons name={tile.icon} size={22} color={colors.textPrimary} />
                {tile.key === 'inbox' && hasUnread && <View style={styles.tileBadge} />}
              </View>
              <Text style={styles.tileLabel}>{tile.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Promo cards */}
        <Pressable
          style={({ pressed }) => [styles.promoCard, pressed && styles.tilePressed]}
          onPress={() =>
            router.push({
              pathname: '/(parent)/rewards',
              params: { returnTo: 'mother-profile' },
            } as never)
          }
        >
          <View style={styles.promoTextWrap}>
            <Text style={styles.promoTitle}>Care Points</Text>
            <Text style={styles.promoSubtitle}>Earn rewards on every booking</Text>
          </View>
          <IconCircle
            icon="gift-outline"
            size="lg"
            backgroundColor={colors.tintYellow}
            iconColor={colors.tintAmber}
          />
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.promoCard, pressed && styles.tilePressed]}
          onPress={() =>
            router.push({
              pathname: '/(parent)/refer-a-friend',
              params: { returnTo: 'mother-profile' },
            } as never)
          }
        >
          <View style={styles.promoTextWrap}>
            <Text style={styles.promoTitle}>Refer a friend</Text>
            <Text style={styles.promoSubtitle}>You each get a discount</Text>
          </View>
          <IconCircle icon="people-outline" size="lg" />
        </Pressable>

        {/* List section */}
        <View style={styles.listSection}>
          <Pressable
            style={styles.listItem}
            onPress={() =>
              router.push({
                pathname: '/(parent)/account-details',
                params: { returnTo: 'mother-profile' },
              } as never)
            }
          >
            <Ionicons name="person-circle-outline" size={22} color={colors.textPrimary} />
            <Text style={styles.listItemLabel}>Account details</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </Pressable>

          <View style={styles.listDivider} />

          <Pressable
            style={styles.listItem}
            disabled={signOut.isPending}
            onPress={() =>
              signOut.mutate(undefined, {
                onSuccess: () => router.replace('/'),
              })
            }
          >
            <Ionicons name="log-out-outline" size={22} color={colors.errorDark} />
            <Text style={[styles.listItemLabel, styles.listItemDestructive]}>
              {signOut.isPending ? 'Signing out…' : 'Sign out'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      <BottomNav activeTab="account" />
    </View>
  );
}
