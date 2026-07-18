import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { IdDocumentType, idTypeRequiresBack } from '@shared/nanny';
import { colors } from '@mobile/theme';
import { APP_NAME } from '@mobile/constants';
import Button from '@mobile/components/ui/button';
import IdCaptureFields from '@mobile/components/IdCaptureFields';
import { pickImageFromLibrary } from '@mobile/lib/pickImage';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import { styles } from './styles/registration-nanny-id-screen.styles';

// Nanny-only step: capture the government ID so an admin can verify identity
// (KYC) before approving the profile. The images are only local URIs here —
// they're uploaded to Firebase Storage at final submit (RegistrationStep3Screen),
// once the Firebase account exists.
export default function RegistrationNannyIdScreen() {
  const router = useRouter();
  const { role } = useLocalSearchParams<{ role?: string }>();

  const draft = useRegistrationDraftStore();
  const patch = useRegistrationDraftStore((s) => s.patch);

  const [formError, setFormError] = useState<string | null>(null);

  function handleBack() {
    router.back();
  }

  function handleChangeType(idDocumentType: IdDocumentType) {
    patch({ idDocumentType });
    if (formError) setFormError(null);
  }

  async function handlePickId(side: 'front' | 'back') {
    const uri = await pickImageFromLibrary();
    if (uri) {
      patch(side === 'front' ? { idFrontUri: uri } : { idBackUri: uri });
      if (formError) setFormError(null);
    }
  }

  function handleContinue() {
    if (!draft.idDocumentType) {
      setFormError('Please choose your ID type.');
      return;
    }
    if (!draft.idFrontUri) {
      setFormError('Please upload the front of your ID.');
      return;
    }
    if (idTypeRequiresBack(draft.idDocumentType) && !draft.idBackUri) {
      setFormError('Please upload the back of your ID.');
      return;
    }
    setFormError(null);
    router.push({ pathname: '/(auth)/register-step-3', params: { role } });
  }

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoid}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" />

        {/* Fixed header bar */}
        <View style={styles.headerBar}>
          <View style={styles.headerLeft}>
            <Pressable style={styles.backButton} onPress={handleBack} hitSlop={8}>
              <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.brandText}>{APP_NAME}</Text>
          </View>
          <View style={styles.miniProgressTrack}>
            <View style={styles.miniProgressFill} />
          </View>
        </View>

        {/* Full-width progress bar */}
        <View style={styles.progressBarTrack}>
          <View style={styles.progressBarFill} />
        </View>

        {/* Scrollable body */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Step label */}
          <Text style={styles.stepLabel}>VERIFY YOUR IDENTITY</Text>

          {/* Section title */}
          <Text style={styles.sectionTitle}>Upload your ID</Text>
          <Text style={styles.sectionSubtitle}>
            Families trust verified nannies. Choose your ID type and upload a clear
            photo of your government ID. Only our review team can see it.
          </Text>

          <IdCaptureFields
            idType={draft.idDocumentType}
            onChangeType={handleChangeType}
            frontUri={draft.idFrontUri}
            backUri={draft.idBackUri}
            onPickFront={() => handlePickId('front')}
            onPickBack={() => handlePickId('back')}
            error={formError}
          />
        </ScrollView>

        {/* Fixed footer */}
        <View style={styles.footer}>
          <Button title="Continue" onPress={handleContinue} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
