import React, { useMemo } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { RewardLedgerEntry } from '@nanny-app/shared';

import { Card, IconCircle } from '@mobile/components/ui';
import { colors } from '@mobile/theme';
import { useRewardConfig, useRewardHistory, useRewardWallet } from '@mobile/hooks/useRewards';
import { useRefreshByUser } from '@mobile/hooks/useRefreshByUser';
import { getProfileReturnHref } from '@mobile/lib/profileUtils';
import { styles } from './styles/rewards-screen.styles';

type EntryVisual = { icon: keyof typeof Ionicons.glyphMap; bg: string; fg: string; label: string };

function entryVisual(type: RewardLedgerEntry['type']): EntryVisual {
  switch (type) {
    case 'EARN':
      return { icon: 'sparkles', bg: colors.successLight, fg: colors.successDark, label: 'Earned from booking' };
    case 'REDEEM':
      return { icon: 'gift', bg: colors.warmLight, fg: colors.goldWarm, label: 'Redeemed at checkout' };
    case 'REFUND':
      return { icon: 'arrow-undo', bg: colors.successLight, fg: colors.successDark, label: 'Points refunded' };
    case 'ADMIN_GRANT':
      return { icon: 'gift', bg: colors.primaryMuted, fg: colors.primary, label: 'Gift from NannyApp' };
    case 'ADMIN_REVOKE':
      return { icon: 'remove-circle', bg: colors.errorLight, fg: colors.error, label: 'Adjustment' };
    default:
      return { icon: 'ellipse', bg: colors.surfaceMuted, fg: colors.textTertiary, label: 'Activity' };
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function RewardsScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();

  const wallet = useRewardWallet();
  const config = useRewardConfig();
  const history = useRewardHistory();

  const { isRefreshingByUser, refreshByUser } = useRefreshByUser(() =>
    Promise.all([wallet.refetch(), history.refetch(), config.refetch()]),
  );

  const entries = useMemo(
    () => history.data?.pages.flatMap((p) => p.entries) ?? [],
    [history.data],
  );

  const balance = wallet.data?.pointsBalance ?? 0;
  const pointsPerHour = config.data?.redemptionPointsPerHour ?? 0;

  const handleBack = () => router.replace(getProfileReturnHref(returnTo) as never);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.headerIconBtn} onPress={handleBack} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Care Points</Text>
        <View style={styles.headerIconBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshingByUser} onRefresh={refreshByUser} tintColor={colors.primary} />
        }
      >
        {/* Balance hero */}
        <Card style={styles.hero} shadow="md" padding={0} radius={20}>
          <View style={styles.heroTop}>
            <View style={styles.heroBadge}>
              <Ionicons name="sparkles" size={18} color={colors.goldWarm} />
            </View>
            <Text style={styles.heroLabel}>Your Care Points</Text>
          </View>
          <Text style={styles.heroBalance}>{balance.toLocaleString()}</Text>
          {pointsPerHour > 0 && (
            <Text style={styles.heroConversion}>
              {pointsPerHour.toLocaleString()} points = 1 free care hour
            </Text>
          )}
        </Card>

        {/* How it works */}
        <Card style={styles.infoCard}>
          <View style={styles.infoRow}>
            <IconCircle icon="add-circle-outline" size="sm" backgroundColor={colors.successLight} iconColor={colors.successDark} />
            <Text style={styles.infoText}>Earn points every time a booking is completed.</Text>
          </View>
          <View style={styles.infoRow}>
            <IconCircle icon="gift-outline" size="sm" backgroundColor={colors.warmLight} iconColor={colors.goldWarm} />
            <Text style={styles.infoText}>
              Redeem them at checkout to knock free hours off what you pay.
            </Text>
          </View>
        </Card>

        {/* Activity */}
        <Text style={styles.sectionTitle}>Activity</Text>

        {history.isLoading && (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}
        {history.isError && (
          <Text style={styles.errorText}>Couldn’t load your history. Pull to refresh.</Text>
        )}
        {!history.isLoading && entries.length === 0 && (
          <Card style={styles.emptyCard}>
            <IconCircle icon="sparkles" size="lg" backgroundColor={colors.warmLight} iconColor={colors.goldWarm} />
            <Text style={styles.emptyTitle}>No points yet</Text>
            <Text style={styles.emptyBody}>
              Complete a booking to start earning Care Points toward free care hours.
            </Text>
          </Card>
        )}

        {entries.map((entry) => {
          const v = entryVisual(entry.type);
          const positive = entry.points >= 0;
          return (
            <View key={entry.id} style={styles.row}>
              <IconCircle icon={v.icon} size="md" backgroundColor={v.bg} iconColor={v.fg} />
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>{v.label}</Text>
                {entry.reason ? <Text style={styles.rowReason}>{entry.reason}</Text> : null}
                <Text style={styles.rowDate}>{formatDate(entry.createdAt)}</Text>
              </View>
              <Text style={[styles.rowPoints, positive ? styles.pointsPos : styles.pointsNeg]}>
                {positive ? '+' : ''}
                {entry.points.toLocaleString()}
              </Text>
            </View>
          );
        })}

        {history.hasNextPage && (
          <Pressable
            style={styles.loadMore}
            onPress={() => void history.fetchNextPage()}
            disabled={history.isFetchingNextPage}
          >
            <Text style={styles.loadMoreText}>
              {history.isFetchingNextPage ? 'Loading…' : 'Show more'}
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}
