import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Share,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { ReferralListItem } from '@nanny-app/shared';

import { Button, Card, IconCircle } from '@mobile/components/ui';
import { colors } from '@mobile/theme';
import { useReferralSummary } from '@mobile/hooks/useReferrals';
import { useRefreshByUser } from '@mobile/hooks/useRefreshByUser';
import { getProfileReturnHref } from '@mobile/lib/profileUtils';
import { styles } from './styles/refer-a-friend-screen.styles';

/** How long the "Copied" confirmation stays up after tapping the code. */
const COPIED_FEEDBACK_MS = 2000;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function InviteRow({ item }: { item: ReferralListItem }) {
  const earned = item.status === 'CONVERTED';
  return (
    <View style={styles.row}>
      <View style={styles.rowAvatar}>
        <Text style={styles.rowAvatarText}>{item.firstName.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowName} numberOfLines={1}>
          {item.firstName}
        </Text>
        <Text style={styles.rowDate}>
          {earned && item.convertedAt
            ? `Booked ${formatDate(item.convertedAt)}`
            : `Joined ${formatDate(item.createdAt)}`}
        </Text>
      </View>
      <View
        style={[styles.statusChip, earned ? styles.statusChipEarned : styles.statusChipPending]}
      >
        <Text
          style={[styles.statusText, earned ? styles.statusTextEarned : styles.statusTextPending]}
        >
          {earned ? `+${item.points}` : 'Pending'}
        </Text>
      </View>
    </View>
  );
}

export default function ReferAFriendScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();

  const summary = useReferralSummary();
  const [copied, setCopied] = useState(false);

  const { isRefreshingByUser, refreshByUser } = useRefreshByUser(() => summary.refetch());

  // Clear the "Copied" confirmation after a moment, and on unmount.
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    return () => clearTimeout(id);
  }, [copied]);

  const data = summary.data;
  const handleBack = () => router.replace(getProfileReturnHref(returnTo) as never);

  const handleCopy = async () => {
    if (!data) return;
    await Clipboard.setStringAsync(data.code);
    setCopied(true);
  };

  const handleShare = async () => {
    if (!data) return;
    await Share.share({ message: data.shareMessage });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.headerIconBtn} onPress={handleBack} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Refer a friend</Text>
        <View style={styles.headerIconBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshingByUser}
            onRefresh={refreshByUser}
            tintColor={colors.primary}
          />
        }
      >
        {summary.isLoading && (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}
        {summary.isError && (
          <Text style={styles.errorText}>Couldn’t load your invites. Pull to refresh.</Text>
        )}

        {data && (
          <>
            {/* Hero — point values come from the server, so admin changes
                flow straight into this copy. */}
            <Card style={styles.hero} shadow="md" padding={0} radius={20}>
              <View style={styles.heroBadge}>
                <Ionicons name="gift" size={26} color={colors.goldWarm} />
              </View>
              <Text style={styles.heroTitle}>Give an hour, get two</Text>
              <Text style={styles.heroBody}>
                Invite a friend to NannyNow. They start with {data.refereePoints} Care Points,
                and you earn {data.referrerPoints} when they finish their first booking.
              </Text>
            </Card>

            {!data.enabled && (
              <Card style={styles.pausedCard}>
                <IconCircle
                  icon="pause-circle-outline"
                  size="sm"
                  backgroundColor={colors.surfaceMuted}
                  iconColor={colors.textTertiary}
                />
                <Text style={styles.pausedText}>
                  Referrals are paused right now. Your code will start working again once
                  they’re back on.
                </Text>
              </Card>
            )}

            {/* Code + share */}
            <Card style={styles.codeCard}>
              <Text style={styles.codeLabel}>Your code</Text>
              <Pressable
                style={styles.codeRow}
                onPress={() => void handleCopy()}
                accessibilityRole="button"
                accessibilityLabel={`Copy your referral code, ${data.code}`}
              >
                <Text style={styles.codeText}>{data.code}</Text>
                <Ionicons
                  name={copied ? 'checkmark-circle' : 'copy-outline'}
                  size={20}
                  color={copied ? colors.successDark : colors.primaryDark}
                />
              </Pressable>
              {copied ? (
                <View style={styles.copiedRow}>
                  <Ionicons name="checkmark" size={14} color={colors.successDark} />
                  <Text style={styles.copiedText}>Copied to clipboard</Text>
                </View>
              ) : (
                <Text style={styles.copyHint}>Tap the code to copy it</Text>
              )}
              <Button
                title="Share invite"
                onPress={() => void handleShare()}
                icon="share-social-outline"
                fullWidth
              />
            </Card>

            {/* How it works */}
            <Card style={styles.stepsCard}>
              <Text style={styles.stepsTitle}>How it works</Text>
              {[
                {
                  title: 'Share your code',
                  text: 'Send it to a friend who needs trusted childcare.',
                },
                {
                  title: 'They sign up and book',
                  text: `They enter your code when joining and start with ${data.refereePoints} Care Points.`,
                },
                {
                  title: 'You both earn',
                  text: `Once their first booking is complete, ${data.referrerPoints} Care Points land in your wallet.`,
                },
              ].map((step, index) => (
                <View key={step.title} style={styles.step}>
                  <View style={styles.stepIndex}>
                    <Text style={styles.stepIndexText}>{index + 1}</Text>
                  </View>
                  <View style={styles.stepBody}>
                    <Text style={styles.stepTitle}>{step.title}</Text>
                    <Text style={styles.stepText}>{step.text}</Text>
                  </View>
                </View>
              ))}
            </Card>

            {/* Stats */}
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{data.stats.invited}</Text>
                <Text style={styles.statLabel}>Invited</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{data.stats.joined}</Text>
                <Text style={styles.statLabel}>Booked</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{data.stats.pointsEarned.toLocaleString()}</Text>
                <Text style={styles.statLabel}>Points earned</Text>
              </View>
            </View>

            {/* Invites */}
            <Text style={styles.sectionTitle}>Your invites</Text>
            {data.referrals.length === 0 ? (
              <Card style={styles.emptyCard}>
                <IconCircle
                  icon="people-outline"
                  size="lg"
                  backgroundColor={colors.warmLight}
                  iconColor={colors.goldWarm}
                />
                <Text style={styles.emptyTitle}>No invites yet</Text>
                <Text style={styles.emptyBody}>
                  Share your code to start earning Care Points toward free care hours.
                </Text>
              </Card>
            ) : (
              data.referrals.map((item) => <InviteRow key={item.id} item={item} />)
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
