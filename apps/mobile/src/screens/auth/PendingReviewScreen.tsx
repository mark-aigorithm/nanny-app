import React, { useEffect } from 'react';
import { View, Text, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';

import { IdVerificationStatus } from '@shared/nanny';
import { useMe } from '@mobile/hooks/useMe';
import { useSignOut } from '@mobile/hooks/useAuth';
import { useUserProfileStore } from '@mobile/store/userProfileStore';
import { colors } from '@mobile/theme';
import { Button, IconCircle } from '@mobile/components/ui';
import { styles } from './styles/pending-review-screen.styles';

/**
 * Shown to nannies whose ID is PENDING_REVIEW. The root router redirects here
 * until an admin approves them — approval flips /auth/me's idVerificationStatus
 * and "Check status" lets them through. A rejection instead routes to the
 * forced re-upload screen (the images were cleared), so it isn't handled here.
 */
export default function PendingReviewScreen() {
  const meQuery = useMe();
  const signOut = useSignOut();
  const profile = useUserProfileStore((s) => s.profile);

  const router = useRouter();

  // Status changed (via "Check status" refetch or a background /me refresh):
  // approval lets the nanny in; a rejection sends her to re-upload her ID.
  useEffect(() => {
    if (profile?.idVerificationStatus === IdVerificationStatus.APPROVED) {
      router.replace('/(nanny)/dashboard');
    } else if (
      profile?.idVerificationStatus === IdVerificationStatus.REJECTED ||
      profile?.idVerificationStatus === IdVerificationStatus.PENDING_ID
    ) {
      router.replace('/(auth)/upload-id');
    }
  }, [profile?.idVerificationStatus, router]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.content}>
        <IconCircle
          icon="hourglass-outline"
          size="xl"
          backgroundColor={colors.warmSubtle}
          iconColor={colors.primaryDark}
          style={styles.iconCircle}
        />
        <Text style={styles.headline}>Your profile is under review</Text>
        <Text style={styles.body}>
          Thanks for signing up! Our team is reviewing your information and may contact you to
          verify your identity. You will get a notification as soon as you are approved.
        </Text>
      </View>

      <View style={styles.footer}>
        <Button
          title="Check status"
          onPress={() => void meQuery.refetch()}
          loading={meQuery.isFetching}
        />
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
