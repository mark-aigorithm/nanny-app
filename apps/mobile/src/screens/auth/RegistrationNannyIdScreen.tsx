import React, { useState } from 'react';
import { View, Text, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';

import { IdDocumentType, idTypeRequiresBack } from '@shared/nanny';
import Button from '@mobile/components/ui/button';
import IdCaptureFields from '@mobile/components/IdCaptureFields';
import RegistrationHeader from '@mobile/components/RegistrationHeader';
import { pickImageFromLibrary } from '@mobile/lib/pickImage';
import { nextStep, stepInfo } from '@mobile/lib/registrationSteps';
import { uploadImageToFirebase } from '@mobile/lib/storage';
import { uploadFor, useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import { styles } from './styles/registration-nanny-id-screen.styles';

const ID_UPLOAD_FAILED_MESSAGE =
  "Couldn't upload your ID. Check your connection and try again.";

/**
 * Nanny-only, the step before Finish: capture the government ID so an admin
 * can verify identity (KYC) before approving the profile. She is signed in
 * ("Your number" did that), so Continue uploads the images here — only the
 * sides that changed since the last upload — and Finish sends their URLs.
 */
export default function RegistrationNannyIdScreen() {
  const router = useRouter();
  const draft = useRegistrationDraftStore();
  const patch = useRegistrationDraftStore((s) => s.patch);
  const step = stepInfo('id', draft);

  const [formError, setFormError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  function clearErrors() {
    setFormError(null);
    setUploadError(null);
  }

  function handleChangeType(idDocumentType: IdDocumentType) {
    patch({ idDocumentType });
    clearErrors();
  }

  async function handlePickId(side: 'front' | 'back') {
    const uri = await pickImageFromLibrary();
    if (uri) {
      patch(side === 'front' ? { idFrontUri: uri } : { idBackUri: uri });
      clearErrors();
    }
  }

  async function handleContinue() {
    clearErrors();
    const { idDocumentType, idFrontUri, idBackUri } = draft;
    if (!idDocumentType) {
      setFormError('Please choose your ID type.');
      return;
    }
    if (!idFrontUri) {
      setFormError('Please upload the front of your ID.');
      return;
    }
    const needsBack = idTypeRequiresBack(idDocumentType);
    if (needsBack && !idBackUri) {
      setFormError('Please upload the back of your ID.');
      return;
    }

    setIsUploading(true);
    try {
      if (!uploadFor(draft.idFrontUpload, idFrontUri)) {
        const url = await uploadImageToFirebase(idFrontUri, 'nanny-ids');
        patch({ idFrontUpload: { uri: idFrontUri, url } });
      }
      if (needsBack && idBackUri && !uploadFor(draft.idBackUpload, idBackUri)) {
        const url = await uploadImageToFirebase(idBackUri, 'nanny-ids');
        patch({ idBackUpload: { uri: idBackUri, url } });
      }
    } catch {
      setUploadError(ID_UPLOAD_FAILED_MESSAGE);
      return;
    } finally {
      setIsUploading(false);
    }

    const next = nextStep('id', useRegistrationDraftStore.getState());
    if (next) router.push(next);
  }

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoid}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        <RegistrationHeader step={step} />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.stepLabel}>{step.label}</Text>

          <View style={styles.headlineGroup}>
            <Text style={styles.headline}>Upload your ID</Text>
            <Text style={styles.subtitle}>
              Families trust verified nannies. Choose your ID type and upload a clear
              photo of your government ID. Only our review team can see it.
            </Text>
          </View>

          <IdCaptureFields
            idType={draft.idDocumentType}
            onChangeType={handleChangeType}
            frontUri={draft.idFrontUri}
            backUri={draft.idBackUri}
            onPickFront={() => handlePickId('front')}
            onPickBack={() => handlePickId('back')}
            error={formError}
          />

          {uploadError && (
            <View style={styles.formErrorBanner}>
              <Text style={styles.formErrorText}>{uploadError}</Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Button
            title={isUploading ? 'Uploading…' : 'Continue'}
            onPress={() => void handleContinue()}
            disabled={isUploading}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
