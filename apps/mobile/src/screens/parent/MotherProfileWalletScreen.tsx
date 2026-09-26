import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import {
  Avatar,
  FadeInView,
  IconCircle,
  PressableScale,
  ScreenContainer,
  StackHeader,
} from '@mobile/components/ui';
import { useSignOut } from '@mobile/hooks/useAuth';
import { useConfirmDeleteAccount } from '@mobile/hooks/useConfirmDeleteAccount';
import { useGuestGate } from '@mobile/hooks/useGuestGate';
import { useUnreadMessageCount } from '@mobile/hooks/useMessaging';
import { usePackageHours } from '@mobile/hooks/usePackages';
import { useRewardWallet } from '@mobile/hooks/useRewards';
import { useUserProfileStore } from '@mobile/store/userProfileStore';
import { colors } from '@mobile/theme';
import { styles } from './styles/mother-profile-wallet-screen.styles';

// Uber-style Account tab: name header, 2x2 quick tiles, promo cards, list.
// Screen-specific config stays local (see CLAUDE.md).
const QUICK_TILES: {
  key: 'account' | 'help' | 'inbox' | 'notifications';
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}[] = [
  { key: 'account', label: 'Account details', icon: 'person-circle-outline' },
  { key: 'help', label: 'Help', icon: 'help-buoy-outline' },
  { key: 'inbox', label: 'Inbox', icon: 'mail-outline' },
  { key: 'notifications', label: 'Notifications', icon: 'notifications-outline' },
];

export default function MotherProfileWalletScreen() {
  const router = useRouter();
  const profile = useUserProfileStore((s) => s.profile);
  const signOut = useSignOut();
  const { confirmDeleteAccount, isDeleting } = useConfirmDeleteAccount();
  const { isGuest } = useGuestGate();
  const { data: unreadData } = useUnreadMessageCount(!isGuest);
  const hasUnread = (unreadData?.unreadCount ?? 0) > 0;
  const { data: packageHours } = usePackageHours(!isGuest);
  const { data: rewardWallet } = useRewardWallet(!isGuest);
  const hoursValue = packageHours ? `${packageHours.availableHours}h` : '—';
  const pointsValue = rewardWallet ? rewardWallet.pointsBalance.toLocaleString() : '—';

  const displayName = profile
    ? `${profile.firstName} ${profile.lastName}`.trim()
    : '';
  const isVerified = profile?.approvalStatus === 'APPROVED';
  const memberYear = profile ? new Date(profile.createdAt).getFullYear() : null;

  const handleTilePress = (key: (typeof QUICK_TILES)[number]['key']) => {
    switch (key) {
      case 'account':
        router.push({
          pathname: '/(parent)/account-details',
          params: { returnTo: 'mother-profile' },
        } as never);
        break;
      case 'help':
        router.push({
          pathname: '/(parent)/customer-support',
          params: { returnTo: 'mother-profile' },
        } as never);
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
    <ScreenContainer useSafeArea={false}>
      <StackHeader
        title={displayName || 'Account'}
        showBackButton={false}
        rightElement={
          <Avatar
            uri={profile?.avatarUrl ?? undefined}
            size="lg"
            fallbackInitial={profile?.firstName?.[0]}
          />
        }
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
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
        <FadeInView index={0} style={styles.tileGrid}>
          {QUICK_TILES.map((tile) => (
            <PressableScale
              key={tile.key}
              style={styles.tile}
              onPress={() => handleTilePress(tile.key)}
            >
              <View style={styles.tileIconWrap}>
                <Ionicons name={tile.icon} size={22} color={colors.textPrimary} />
                {tile.key === 'inbox' && hasUnread && <View style={styles.tileBadge} />}
              </View>
              <Text style={styles.tileLabel}>{tile.label}</Text>
            </PressableScale>
          ))}
        </FadeInView>

        {/* Wallet: what she holds. Buying lives on the Services tab. */}
        {!isGuest && (
          <FadeInView index={1} style={styles.walletCard}>
            <Text style={styles.walletTitle}>Wallet</Text>
            <View style={styles.walletRow}>
              <PressableScale
                style={styles.walletHalf}
                onPress={() => router.push('/(parent)/package-hours' as never)}
              >
                <IconCircle icon="time-outline" size="sm" />
                <Text style={styles.walletLabel}>Care hours</Text>
                <Text style={styles.walletValue}>{hoursValue}</Text>
                <Text style={styles.walletCaption}>available</Text>
              </PressableScale>
              <View style={styles.walletDivider} />
              <PressableScale
                style={styles.walletHalf}
                onPress={() => router.push('/(parent)/rewards' as never)}
              >
                <IconCircle
                  icon="gift-outline"
                  size="sm"
                  backgroundColor={colors.tintYellow}
                  iconColor={colors.tintAmber}
                />
                <Text style={styles.walletLabel}>Care Points</Text>
                <Text style={styles.walletValue}>{pointsValue}</Text>
                <Text style={styles.walletCaption}>points</Text>
              </PressableScale>
            </View>
          </FadeInView>
        )}

        {/* Promo cards */}
        <FadeInView index={2}>
          <PressableScale
            style={styles.promoCard}
            onPress={() =>
              router.push({
                pathname: '/(parent)/addresses',
                params: { returnTo: 'mother-profile' },
              } as never)
            }
          >
            <View style={styles.promoTextWrap}>
              <Text style={styles.promoTitle}>Addresses</Text>
              <Text style={styles.promoSubtitle}>Where your nanny comes to</Text>
            </View>
            <IconCircle icon="location-outline" size="lg" />
          </PressableScale>
        </FadeInView>

        <FadeInView index={3}>
          <PressableScale
            style={styles.promoCard}
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
          </PressableScale>
        </FadeInView>

        {/* List section */}
        <FadeInView index={4} style={styles.listSection}>
          <PressableScale
            style={styles.listItem}
            disabled={signOut.isPending || isDeleting}
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
          </PressableScale>
          <PressableScale
            style={styles.listItem}
            disabled={isDeleting || signOut.isPending}
            onPress={confirmDeleteAccount}
          >
            <Ionicons name="trash-outline" size={22} color={colors.errorDark} />
            <Text style={[styles.listItemLabel, styles.listItemDestructive]}>
              {isDeleting ? 'Deleting…' : 'Delete account'}
            </Text>
          </PressableScale>
        </FadeInView>
      </ScrollView>
    </ScreenContainer>
  );
}
