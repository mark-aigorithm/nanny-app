import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';

import { IdDocumentType, IdVerificationStatus } from '@shared/nanny';
import { APP_NAME } from '@mobile/constants';
import { Button } from '@mobile/components/ui';
import IdCaptureFields from '@mobile/components/IdCaptureFields';
import { useIdSubmit } from '@mobile/hooks/useIdSubmit';
import { useSignOut } from '@mobile/hooks/useAuth';
import { pickImageFromLibrary } from '@mobile/lib/pickImage';
import { useUserProfileStore } from '@mobile/store/userProfileStore';
import { styles } from './styles/upload-id-screen.styles';

/**
 * Forced ID (re)upload for a nanny whose identity isn't on file — status
 * PENDING_ID (never uploaded) or REJECTED (admin cleared her images). The root
 * router sends her here instead of the app; she can only proceed by submitting
 * a new ID (→ PENDING_REVIEW) or signing out. Non-dismissable by design.
 */
export default function UploadIdScreen() {
  const router = useRouter();
  const profile = useUserProfileStore((s) => s.profile);
  const signOut = useSignOut();

  const [idType, setIdType] = useState<IdDocumentType | null>(null);
  const [frontUri, setFrontUri] = useState<string | null>(null);
  const [backUri, setBackUri] = useState<string | null>(null);
  const { submit, isSubmitting, error } = useIdSubmit();

  const status = profile?.idVerificationStatus ?? null;

  // Once the ID is submitted (or approved in the background), leave this screen.
  useEffect(() => {
    if (status === IdVerificationStatus.APPROVED) {
      router.replace('/(nanny)/dashboard');
    } else if (status === IdVerificationStatus.PENDING_REVIEW) {
      router.replace('/(auth)/pending-review');
    }
  }, [status, router]);

  const pickFront = async () => {
    const uri = await pickImageFromLibrary();
    if (uri) setFrontUri(uri);
  };
  const pickBack = async () => {
    const uri = await pickImageFromLibrary();
    if (uri) setBackUri(uri);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.headerBar}>
        <Text style={styles.brandText}>{APP_NAME}</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.stepLabel}>VERIFY YOUR IDENTITY</Text>
        <Text style={styles.title}>Upload your ID</Text>
        <Text style={styles.subtitle}>
          {profile?.idRejectionReason
            ? `Your previous ID wasn't approved: ${profile.idRejectionReason}. Please upload a new one so our team can verify you.`
            : 'Families trust verified nannies. Upload a clear photo of your government ID so our review team can verify your identity.'}
        </Text>

        <IdCaptureFields
          idType={idType}
          onChangeType={setIdType}
          frontUri={frontUri}
          backUri={backUri}
          onPickFront={pickFront}
          onPickBack={pickBack}
          error={error}
        />
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title={isSubmitting ? 'Submitting…' : 'Submit for review'}
          onPress={() => void submit({ idType, frontUri, backUri })}
          disabled={isSubmitting}
        />
        <Button
          title="Sign out"
          variant="outline"
          onPress={() =>
            signOut.mutate(undefined, {
              onSuccess: () => router.replace('/(auth)/splash'),
            })
          }
          loading={signOut.isPending}
        />
      </View>
    </View>
  );
}
