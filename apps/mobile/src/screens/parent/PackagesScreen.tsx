import React, { useMemo } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { PublicPackage } from '@nanny-app/shared';

import { Card, Button, IconCircle } from '@mobile/components/ui';
import { colors } from '@mobile/theme';
import { usePackages, usePackageHours } from '@mobile/hooks/usePackages';
import { usePricingConfig } from '@mobile/hooks/useBookings';
import { useRefreshByUser } from '@mobile/hooks/useRefreshByUser';
import { getApiErrorMessage } from '@mobile/lib/api';
import { formatMoney } from '@mobile/lib/formatMoney';
import { styles } from './styles/packages-screen.styles';

/** What one prepaid hour costs under this package. */
function hourlyRateOf(pkg: PublicPackage): number {
  return pkg.hours > 0 ? pkg.price / pkg.hours : 0;
}

function PackageCard({
  pkg,
  buyDisabled,
  disabledReason,
  standardRate,
  bestValue,
}: {
  pkg: PublicPackage;
  buyDisabled: boolean;
  disabledReason: string | null;
  standardRate: number | null;
  bestValue: boolean;
}) {
  const perHour = hourlyRateOf(pkg);
  // Only claim a saving when there's a rate to compare against and it's real.
  const percentOff =
    standardRate != null && standardRate > 0 && perHour < standardRate
      ? Math.round((1 - perHour / standardRate) * 100)
      : 0;

  return (
    <Card style={[styles.packageCard, bestValue && styles.packageCardFeatured]}>
      {bestValue && (
        <View style={styles.featuredBadge}>
          <Ionicons name="star" size={11} color={colors.white} />
          <Text style={styles.featuredBadgeText}>Best value</Text>
        </View>
      )}

      <View style={styles.packageHeaderRow}>
        <View style={styles.packageHeaderText}>
          <Text style={styles.packageName}>{pkg.name}</Text>
          {pkg.description ? (
            <Text style={styles.packageDescription}>{pkg.description}</Text>
          ) : null}
        </View>
        <View style={styles.packageHoursBadge}>
          <Text style={styles.packageHoursValue}>{pkg.hours}</Text>
          <Text style={styles.packageHoursUnit}>hours</Text>
        </View>
      </View>

      {/* The number that actually drives the decision. */}
      <View style={styles.rateRow}>
        <Text style={styles.rateValue}>
          {formatMoney(perHour, { fractionDigits: 0 })}
          <Text style={styles.rateUnit}> / hour</Text>
        </Text>
        {percentOff > 0 && (
          <View style={styles.savingPill}>
            <Text style={styles.savingPillText}>Save {percentOff}%</Text>
          </View>
        )}
      </View>

      <View style={styles.packageMetaRow}>
        <View style={styles.metaChip}>
          <Ionicons name="calendar-outline" size={13} color={colors.textTertiary} />
          <Text style={styles.metaChipText}>Valid {pkg.validityDays} days</Text>
        </View>
        <View style={styles.metaChip}>
          <Ionicons name="sparkles-outline" size={13} color={colors.textTertiary} />
          <Text style={styles.metaChipText}>{pkg.maxSkills} free skills</Text>
        </View>
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

      {/* Kept on the card rather than only in a banner up top: a mother who
          scrolled straight here would otherwise meet a dead button. */}
      {buyDisabled && disabledReason && (
        <Text style={styles.disabledReason}>{disabledReason}</Text>
      )}
    </Card>
  );
}

export default function PackagesScreen() {
  const packages = usePackages();
  const packageHours = usePackageHours();
  const pricing = usePricingConfig();

  const { isRefreshingByUser, refreshByUser } = useRefreshByUser(() =>
    Promise.all([packages.refetch(), packageHours.refetch()]),
  );

  const hasActivePackage = useMemo(
    () => (packageHours.data?.buckets ?? []).some((b) => b.status === 'ACTIVE' && b.hoursRemaining > 0),
    [packageHours.data],
  );

  // Fail safe: while the hours balance is loading or errored, we cannot confirm
  // whether an active package exists — treat Buy as blocked rather than allowed.
  const hoursUnconfirmed = packageHours.isLoading || packageHours.isError;
  const buyDisabled = hasActivePackage || hoursUnconfirmed;
  const disabledReason = hasActivePackage
    ? 'Use up or wait out your current package before buying another.'
    : packageHours.isError
      ? 'Couldn’t check your prepaid balance — pull to refresh.'
      : null;

  const availableHours = packageHours.data?.availableHours ?? 0;
  const list = packages.data ?? [];
  const standardRate = pricing.data?.standardHourlyRate ?? null;

  /** The cheapest per-hour package, badged so the choice isn't arithmetic. */
  const bestValueId = useMemo(() => {
    if (list.length < 2) return null;
    return list.reduce((best, pkg) => (hourlyRateOf(pkg) < hourlyRateOf(best) ? pkg : best)).id;
  }, [list]);

  /** Soonest expiry across active buckets — the thing worth nudging about. */
  const soonestExpiry = useMemo(() => {
    const dates = (packageHours.data?.buckets ?? [])
      .filter((b) => b.status === 'ACTIVE' && b.hoursRemaining > 0 && b.expiresAt)
      .map((b) => b.expiresAt as string)
      .sort();
    return dates[0] ?? null;
  }, [packageHours.data]);

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
              <View style={styles.hoursTextWrap}>
                <Text style={styles.hoursText}>
                  {availableHours > 0
                    ? `${availableHours}h prepaid available`
                    : 'No prepaid hours yet'}
                </Text>
                <Text style={styles.hoursSubtext}>
                  {availableHours > 0
                    ? soonestExpiry
                      ? `Expires ${new Date(soonestExpiry).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}`
                      : 'Applied automatically to your next booking'
                    : 'Buy a bundle below to lower your hourly rate'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </View>
          </Card>
        </Pressable>

        <Text style={styles.sectionTitle}>Available packages</Text>
        {standardRate != null && (
          <Text style={styles.sectionHint}>
            Pay-as-you-go is {formatMoney(standardRate, { fractionDigits: 0 })}/hour. Prepaid hours
            are applied to your bookings automatically.
          </Text>
        )}

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
          <PackageCard
            key={pkg.id}
            pkg={pkg}
            buyDisabled={buyDisabled}
            disabledReason={disabledReason}
            standardRate={standardRate}
            bestValue={pkg.id === bestValueId}
          />
        ))}
      </ScrollView>
    </View>
  );
}
