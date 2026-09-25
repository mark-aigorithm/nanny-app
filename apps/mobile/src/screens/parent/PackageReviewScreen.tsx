import React from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';

import { Button, Card, IconCircle, ScreenContainer, StackHeader } from '@mobile/components/ui';
import { colors } from '@mobile/theme';
import { usePackages, usePackageHours, useCancelPackageCheckout } from '@mobile/hooks/usePackages';
import { usePricingConfig } from '@mobile/hooks/useBookings';
import { getApiErrorMessage } from '@mobile/lib/api';
import { formatMoney } from '@mobile/lib/formatMoney';
import type { PackageFlowParams } from '@mobile/lib/packagePurchaseDraft';
import { styles } from './styles/package-review-screen.styles';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function IncludedRow({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={styles.includedRow}>
      <Ionicons name={icon} size={18} color={colors.primaryDark} />
      <Text style={styles.includedText}>{text}</Text>
    </View>
  );
}

function SummaryRow({ label, value, tone }: { label: string; value: string; tone?: 'muted' | 'saving' }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text
        style={[
          styles.summaryValue,
          tone === 'muted' && styles.summaryValueMuted,
          tone === 'saving' && styles.summaryValueSaving,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

/**
 * The step between "Buy package" and Paymob. Nothing is created until the
 * parent confirms here, so a mis-tap on Buy costs nothing — and if a checkout
 * for another package is still open, this is where they finish or drop it.
 */
export default function PackageReviewScreen() {
  const { packageId } = useLocalSearchParams<PackageFlowParams>();
  const packages = usePackages();
  const packageHours = usePackageHours();
  const pricing = usePricingConfig();
  const cancelCheckout = useCancelPackageCheckout();

  const pkg = (packages.data ?? []).find((p) => String(p.id) === packageId);
  // The backend only lists a pending purchase while its checkout is still open.
  const openCheckout = (packageHours.data?.buckets ?? []).find((b) => b.status === 'PENDING_PAYMENT');
  const blockingCheckout = openCheckout && String(openCheckout.packageId) !== packageId ? openCheckout : null;
  const resuming = !!openCheckout && !blockingCheckout;

  const goToCheckout = (id: number | string) =>
    router.push({ pathname: '/(parent)/packages/checkout', params: { packageId: String(id) } } as never);

  if (packages.isLoading) {
    return (
      <ScreenContainer useSafeArea={false}>
        <StackHeader title="Review package" />
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  if (!pkg) {
    return (
      <ScreenContainer useSafeArea={false}>
        <StackHeader title="Review package" />
        <View style={styles.center}>
          <Text style={styles.missingText}>This package is no longer available.</Text>
          <Button title="Back to packages" variant="outline" onPress={() => router.back()} />
        </View>
      </ScreenContainer>
    );
  }

  const perHour = pkg.hours > 0 ? pkg.price / pkg.hours : 0;
  const standardRate = pricing.data?.standardHourlyRate ?? null;
  const payAsYouGo = standardRate != null ? standardRate * pkg.hours : null;
  const saving = payAsYouGo != null && payAsYouGo > pkg.price ? payAsYouGo - pkg.price : 0;

  return (
    <ScreenContainer useSafeArea={false}>
      <StackHeader title="Review package" subtitle="Check the details before you pay" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {blockingCheckout && (
          <Card style={styles.blockingCard}>
            <View style={styles.blockingHeader}>
              <IconCircle
                icon="hourglass-outline"
                size="sm"
                backgroundColor={colors.warmLight}
                iconColor={colors.goldWarm}
              />
              <Text style={styles.blockingTitle}>You have an unfinished checkout</Text>
            </View>
            <Text style={styles.blockingBody}>
              {blockingCheckout.packageName} is waiting for payment. Finish it, or cancel it to buy{' '}
              {pkg.name} instead.
            </Text>
            <Button
              title={`Continue with ${blockingCheckout.packageName}`}
              onPress={() => goToCheckout(blockingCheckout.packageId)}
            />
            <Button
              title="Cancel that checkout"
              variant="outline"
              loading={cancelCheckout.isPending}
              onPress={() => cancelCheckout.mutate({ purchaseId: blockingCheckout.id })}
            />
            {cancelCheckout.isError && (
              <Text style={styles.errorText}>{getApiErrorMessage(cancelCheckout.error)}</Text>
            )}
          </Card>
        )}

        <Card style={styles.packageCard}>
          <View style={styles.packageHeaderRow}>
            <View style={styles.packageHeaderText}>
              <Text style={styles.packageName}>{pkg.name}</Text>
              {pkg.description ? <Text style={styles.packageDescription}>{pkg.description}</Text> : null}
            </View>
            <View style={styles.hoursBadge}>
              <Text style={styles.hoursBadgeValue}>{pkg.hours}</Text>
              <Text style={styles.hoursBadgeUnit}>hours</Text>
            </View>
          </View>

          <Text style={styles.rateValue}>
            {formatMoney(perHour, { fractionDigits: 0 })}
            <Text style={styles.rateUnit}> / hour</Text>
          </Text>

          <View style={styles.divider} />

          <Text style={styles.sectionLabel}>What’s included</Text>
          <IncludedRow icon="time-outline" text={`${pkg.hours} hours of care`} />
          <IncludedRow icon="calendar-outline" text={`Valid for ${pkg.validityDays} days after payment`} />
          {pkg.maxSkills > 0 && <IncludedRow icon="sparkles-outline" text={`${pkg.maxSkills} free skills`} />}
          <IncludedRow icon="flash-outline" text="Applied automatically when you book" />
        </Card>

        <Card style={styles.summaryCard}>
          <Text style={styles.sectionLabel}>Order summary</Text>
          <SummaryRow
            label={`${pkg.hours} h × ${formatMoney(perHour, { fractionDigits: 0 })}`}
            value={formatMoney(pkg.price)}
          />
          {saving > 0 && payAsYouGo != null && (
            <>
              <SummaryRow label="Pay-as-you-go price" value={formatMoney(payAsYouGo)} tone="muted" />
              <SummaryRow label="You save" value={formatMoney(saving)} tone="saving" />
            </>
          )}
          <View style={styles.divider} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatMoney(pkg.price)}</Text>
          </View>
        </Card>

        <View style={styles.noteRow}>
          <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
          <Text style={styles.noteText}>
            You’ll pay securely on the next screen. Nothing is charged until you confirm there, and
            going back cancels the checkout.
          </Text>
        </View>

        <Button
          title={resuming ? 'Resume payment' : 'Continue to payment'}
          icon="arrow-forward"
          iconPosition="right"
          disabled={!!blockingCheckout || packageHours.isLoading}
          onPress={() => goToCheckout(pkg.id)}
        />
      </ScrollView>
    </ScreenContainer>
  );
}
