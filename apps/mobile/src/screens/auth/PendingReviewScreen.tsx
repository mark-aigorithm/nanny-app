import React, { useEffect } from 'react';
import { View, Text, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';

import { NannyApprovalStatus } from '@shared/nanny';
import { useMe } from '@mobile/hooks/useMe';
import { useSignOut } from '@mobile/hooks/useAuth';
import { useUserProfileStore } from '@mobile/store/userProfileStore';
import { colors } from '@mobile/theme';
import { Button, IconCircle } from '@mobile/components/ui';
import { styles } from './styles/pending-review-screen.styles';

/**
 * Shown to nannies whose profile is still PENDING_REVIEW (or REJECTED).
 * The root router redirects here until an admin approves them — approval
 * flips /auth/me's nannyApprovalStatus and "Check status" lets them through.
 */
export default function PendingReviewScreen() {
  const meQuery = useMe();
  const signOut = useSignOut();
  const profile = useUserProfileStore((s) => s.profile);

  const router = useRouter();

  const rejected = profile?.nannyApprovalStatus === NannyApprovalStatus.REJECTED;

  // Approval arrived (via "Check status" refetch or a background /me refresh)
  // — let the nanny straight into the app.
  useEffect(() => {
    if (profile?.nannyApprovalStatus === NannyApprovalStatus.APPROVED) {
      router.replace('/(nanny)/dashboard');
    }
  }, [profile?.nannyApprovalStatus, router]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.content}>
        <IconCircle
          icon={rejected ? 'close-circle-outline' : 'hourglass-outline'}
          size="xl"
          backgroundColor={colors.warmSubtle}
          iconColor={colors.primaryDark}
          style={styles.iconCircle}
        />
        <Text style={styles.headline}>
          {rejected ? 'Application not approved' : 'Your profile is under review'}
        </Text>
        <Text style={styles.body}>
          {rejected
            ? 'Unfortunately your application was not approved. Please contact support if you believe this is a mistake.'
            : 'Thanks for signing up! Our team is reviewing your information and may contact you to verify your identity. You will get a notification as soon as you are approved.'}
        </Text>
      </View>

      <View style={styles.footer}>
        {!rejected && (
          <Button
            title="Check status"
            onPress={() => void meQuery.refetch()}
            loading={meQuery.isFetching}
          />
        )}
        <Button
          title="Sign out"
          variant="outline"
          onPress={() =>
            signOut.mutate(undefined, {
              onSuccess: () => {
                router.replace('/(auth)/splash');
              },
            })
          }
          loading={signOut.isPending}
        />
      </View>
    </View>
  );
}
