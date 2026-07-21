import React, { useMemo } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { PublicPackage } from '@nanny-app/shared';

import { Card, Button, IconCircle } from '@mobile/components/ui';
import { colors } from '@mobile/theme';
import { usePackages, usePackageHours } from '@mobile/hooks/usePackages';
import { useRefreshByUser } from '@mobile/hooks/useRefreshByUser';
import { getApiErrorMessage } from '@mobile/lib/api';
import { formatMoney } from '@mobile/lib/formatMoney';
import { styles } from './styles/packages-screen.styles';

function PackageCard({ pkg, buyDisabled }: { pkg: PublicPackage; buyDisabled: boolean }) {
  return (
    <Card style={styles.packageCard}>
      <View style={styles.packageHeaderRow}>
        <Text style={styles.packageName}>{pkg.name}</Text>
        <Text style={styles.packageHours}>{pkg.hours}h</Text>
      </View>

      {pkg.description ? <Text style={styles.packageDescription}>{pkg.description}</Text> : null}

      <View style={styles.packageMetaRow}>
        <Text style={styles.packageMeta}>Valid {pkg.validityDays} days</Text>
        <Text style={styles.packageMeta}>·</Text>
        <Text style={styles.packageMeta}>{pkg.maxSkills} free skills</Text>
      </View>

      <Button
        title={`Buy · ${formatMoney(pkg.price)}`}
        onPress={() =>
          router.push({
            pathname: '/(parent)/packages/checkout',
            params: { packageId: String(pkg.id) },
          } as never)
        }
        disabled={buyDisabled}
      />
    </Card>
  );
}

export default function PackagesScreen() {
  const packages = usePackages();
  const packageHours = usePackageHours();

  const { isRefreshingByUser, refreshByUser } = useRefreshByUser(() =>
    Promise.all([packages.refetch(), packageHours.refetch()]),
  );

  const hasActivePackage = useMemo(
    () => (packageHours.data?.buckets ?? []).some((b) => b.status === 'ACTIVE' && b.hoursRemaining > 0),
    [packageHours.data],
  );

  const availableHours = packageHours.data?.availableHours ?? 0;
  const list = packages.data ?? [];

  const handleBack = () => router.back();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.headerIconBtn} onPress={handleBack} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Packages</Text>
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
        <Pressable onPress={() => router.push('/(parent)/package-hours' as never)}>
          <Card shadow="md">
            <View style={styles.hoursRow}>
              <IconCircle icon="time-outline" size="md" backgroundColor={colors.primaryMuted} iconColor={colors.primary} />
              <Text style={styles.hoursText}>You have {availableHours}h prepaid</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </View>
          </Card>
        </Pressable>

        {hasActivePackage && (
          <Card style={styles.banner}>
            <View style={styles.bannerRow}>
              <IconCircle
                icon="alert-circle-outline"
                size="sm"
                backgroundColor={colors.surface}
                iconColor={colors.goldWarm}
              />
              <Text style={styles.bannerText}>
                You have an active package — use it up or wait for it to expire before buying another
              </Text>
            </View>
          </Card>
        )}

        <Text style={styles.sectionTitle}>Available packages</Text>

        {packages.isLoading && (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}

        {packages.isError && (
          <Text style={styles.errorText}>{getApiErrorMessage(packages.error)}</Text>
        )}

        {!packages.isLoading && !packages.isError && list.length === 0 && (
          <Card style={styles.emptyCard}>
            <IconCircle icon="cube-outline" size="lg" backgroundColor={colors.warmLight} iconColor={colors.goldWarm} />
            <Text style={styles.emptyTitle}>No packages available</Text>
            <Text style={styles.emptyBody}>Check back later for prepaid hour bundles.</Text>
          </Card>
        )}

        {list.map((pkg) => (
          <PackageCard key={pkg.id} pkg={pkg} buyDisabled={hasActivePackage} />
        ))}
      </ScrollView>
    </View>
  );
}
