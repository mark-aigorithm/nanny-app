import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { PaymentStatus } from '@nanny-app/shared';

import { colors } from '@mobile/theme';
import { useSyncPackagePayment, usePackageHours } from '@mobile/hooks/usePackages';
import type { PackageFlowParams } from '@mobile/lib/packagePurchaseDraft';
import { styles } from './styles/package-payment-result-screen.styles';

type Outcome = 'loading' | 'success' | 'failure' | 'pending' | 'stalled';

// If the sync/settlement never resolves within this window we stop blocking
// the user and point them at their hours, so this screen can never trap them
// on the spinner (mirrors BookingPaymentResultScreen).
const LOADING_TIMEOUT_MS = 12_000;
// How long to keep polling a not-yet-activated purchase before treating it as
// a failure the user can retry (their card was not charged).
const PENDING_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 3_000;

export default function PackagePaymentResultScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<PackageFlowParams>();
  const purchaseId = params.purchaseId;
  const packageId = params.packageId;

  const sync = useSyncPackagePayment();
  const hours = usePackageHours();
  const syncedRef = useRef(false);
  const [outcome, setOutcome] = useState<Outcome>('loading');
  const [syncFailed, setSyncFailed] = useState(false);
  const [hasSynced, setHasSynced] = useState(false);

  const bucket = hours.data?.buckets.find((b) => b.id === Number(purchaseId));

  // Sync the Paymob capture once, then fall back to polling the hours balance.
  useEffect(() => {
    if (!purchaseId || syncedRef.current) return;
    syncedRef.current = true;

    (async () => {
      try {
        const res = await sync.mutateAsync({ purchaseId: Number(purchaseId) });
        if (res.status === PaymentStatus.FAILED) setSyncFailed(true);
      } catch {
        // Ignore — we still poll the hours balance we already have below.
      } finally {
        await hours.refetch();
        setHasSynced(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchaseId]);

  // Resolve the outcome from the purchase's bucket. A bucket that has flipped
  // to ACTIVE is the terminal success (hours are only credited once payment is
  // captured); a synced FAILED payment is the terminal failure. Do NOT infer
  // success from availableHours going up — that races with any other credit.
  useEffect(() => {
    if (!hasSynced || !hours.data) return;

    if (bucket?.status === 'ACTIVE') {
      setOutcome('success');
      return;
    }

    if (syncFailed) {
      setOutcome('failure');
      return;
    }

    // Still awaiting settlement: move off the initial spinner into the
    // pending state without overriding a resolved outcome.
    setOutcome((current) => (current === 'loading' ? 'pending' : current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hours.data, syncFailed, hasSynced]);

  // Escape hatch for the initial load: if the balance never resolves (slow or
  // failing query) flip to a graceful "still processing" state with a way out.
  useEffect(() => {
    if (outcome !== 'loading' || !purchaseId) return;

    const poll = setInterval(() => {
      void hours.refetch();
    }, POLL_INTERVAL_MS);

    const timeout = setTimeout(() => {
      setOutcome((current) => (current === 'loading' ? 'stalled' : current));
    }, LOADING_TIMEOUT_MS);

    return () => {
      clearInterval(poll);
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchaseId, outcome]);

  // A hard query error must not keep the user pinned on the spinner.
  useEffect(() => {
    if (!hours.isError || outcome !== 'loading') return;
    setOutcome('stalled');
  }, [hours.isError, outcome]);

  // While pending, keep polling; if it never activates, surface a failure.
  useEffect(() => {
    if (outcome !== 'pending' || !purchaseId) return;

    const timer = setInterval(() => {
      void hours.refetch();
    }, POLL_INTERVAL_MS);

    const timeout = setTimeout(() => {
      setOutcome((current) => (current === 'pending' ? 'failure' : current));
    }, PENDING_TIMEOUT_MS);

    return () => {
      clearInterval(timer);
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchaseId, outcome]);

  // Success → hand off to the package hours screen.
  useEffect(() => {
    if (outcome !== 'success') return;

    const timer = setTimeout(() => {
      router.replace('/(parent)/package-hours' as never);
    }, 1200);

    return () => clearTimeout(timer);
  }, [outcome, router]);

  const handleTryAgain = () => {
    router.replace({
      pathname: '/(parent)/packages/checkout',
      params: { packageId },
    } as never);
  };

  const handleViewHours = () => {
    router.replace('/(parent)/package-hours' as never);
  };

  const handleBackHome = () => {
    router.replace('/(parent)/home');
  };

  if (purchaseId && (outcome === 'loading' || outcome === 'pending')) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loaderText}>
          {outcome === 'pending' ? 'Still processing your payment…' : 'Confirming your payment…'}
        </Text>
      </View>
    );
  }

  if (outcome === 'success') {
    const expiresAtLabel = bucket?.expiresAt
      ? new Date(bucket.expiresAt).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : null;

    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={[styles.iconCircle, styles.iconCircleSuccess]}>
            <Ionicons name="checkmark" size={28} color={colors.success} />
          </View>
          <Text style={styles.heading}>Payment successful</Text>
          <Text style={styles.subtitle}>
            {bucket ? `${bucket.hoursPurchased} hours added` : 'Your hours have been added'}
            {expiresAtLabel ? ` — valid until ${expiresAtLabel}` : ''}
          </Text>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.primaryButton}
              activeOpacity={0.85}
              onPress={handleViewHours}
            >
              <Ionicons name="time-outline" size={20} color={colors.white} />
              <Text style={styles.primaryButtonText}>View my hours</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // Graceful escape when we can't confirm in time (or there's no purchase to
  // resolve) — never leave the user stuck, always give them a way out.
  if (outcome === 'stalled' || !purchaseId) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={[styles.iconCircle, styles.iconCirclePending]}>
            <Ionicons name="time-outline" size={28} color={colors.primary} />
          </View>
          <Text style={styles.heading}>Still processing</Text>
          <Text style={styles.subtitle}>
            This is taking longer than expected. Your payment may still go through — check your
            package hours in a moment.
          </Text>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.primaryButton}
              activeOpacity={0.85}
              onPress={handleViewHours}
            >
              <Ionicons name="time-outline" size={20} color={colors.white} />
              <Text style={styles.primaryButtonText}>View my hours</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              activeOpacity={0.85}
              onPress={handleBackHome}
            >
              <Text style={styles.secondaryButtonText}>Back to home</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={[styles.iconCircle, styles.iconCircleFailure]}>
          <Ionicons name="close" size={28} color={colors.error} />
        </View>
        <Text style={styles.heading}>Payment failed</Text>
        <Text style={styles.subtitle}>
          Your card was not charged, or the payment was declined. You can try again.
        </Text>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.primaryButton} activeOpacity={0.85} onPress={handleTryAgain}>
            <Ionicons name="card-outline" size={20} color={colors.white} />
            <Text style={styles.primaryButtonText}>Try again</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            activeOpacity={0.85}
            onPress={handleBackHome}
          >
            <Text style={styles.secondaryButtonText}>Back to home</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
