import React from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { PackagePurchase } from '@nanny-app/shared';

import { Card, IconCircle } from '@mobile/components/ui';
import { colors } from '@mobile/theme';
import { usePackageHours } from '@mobile/hooks/usePackages';
import { useRefreshByUser } from '@mobile/hooks/useRefreshByUser';
import { getApiErrorMessage } from '@mobile/lib/api';
import { styles } from './styles/package-hours-screen.styles';

type StatusVisual = { label: string; bg: string; fg: string };

const STATUS_VISUALS: Record<PackagePurchase['status'], StatusVisual> = {
  ACTIVE: { label: 'Active', bg: colors.successLight, fg: colors.successDark },
  PENDING_PAYMENT: { label: 'Payment pending', bg: colors.warmLight, fg: colors.goldWarm },
  EXPIRED: { label: 'Expired', bg: colors.taupe, fg: colors.textMuted },
  REFUNDED: { label: 'Refunded', bg: colors.errorLight, fg: colors.error },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function PackageBucketRow({ bucket }: { bucket: PackagePurchase }) {
  const visual = STATUS_VISUALS[bucket.status];

  return (
    <Card style={styles.bucketCard}>
      <View style={styles.bucketHeaderRow}>
        <Text style={styles.bucketName}>{bucket.packageName}</Text>
        <View style={[styles.statusChip, { backgroundColor: visual.bg }]}>
          <Text style={[styles.statusChipText, { color: visual.fg }]}>{visual.label}</Text>
        </View>
      </View>

      <Text style={styles.bucketHours}>
        {bucket.hoursRemaining}h of {bucket.hoursPurchased}h left
      </Text>

      {bucket.expiresAt ? (
        <Text style={styles.bucketExpiry}>Expires {formatDate(bucket.expiresAt)}</Text>
      ) : null}
    </Card>
  );
}

export default function PackageHoursScreen() {
  const hours = usePackageHours();

  const { isRefreshingByUser, refreshByUser } = useRefreshByUser(() => hours.refetch());

  const availableHours = hours.data?.availableHours ?? 0;
  const buckets = hours.data?.buckets ?? [];

  const handleBack = () => router.back();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.headerIconBtn} onPress={handleBack} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>My Hours</Text>
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
              <Ionicons name="time" size={18} color={colors.primaryDark} />
            </View>
            <Text style={styles.heroLabel}>Prepaid Hours</Text>
          </View>
          <Text style={styles.heroBalance}>{availableHours}h available</Text>
        </Card>

        <Text style={styles.sectionTitle}>Your packages</Text>

        {hours.isLoading && (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}

        {hours.isError && (
          <Text style={styles.errorText}>{getApiErrorMessage(hours.error)}</Text>
        )}

        {!hours.isLoading && !hours.isError && buckets.length === 0 && (
          <Card style={styles.emptyCard}>
            <IconCircle icon="time-outline" size="lg" backgroundColor={colors.warmLight} iconColor={colors.goldWarm} />
            <Text style={styles.emptyTitle}>No packages yet</Text>
            <Text style={styles.emptyBody}>Buy a prepaid hour bundle to see it here.</Text>
          </Card>
        )}

        {buckets.map((bucket) => (
          <PackageBucketRow key={bucket.id} bucket={bucket} />
        ))}
      </ScrollView>
    </View>
  );
}
