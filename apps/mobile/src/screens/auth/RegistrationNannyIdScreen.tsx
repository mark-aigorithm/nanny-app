import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { colors } from '@mobile/theme';
import { APP_NAME } from '@mobile/constants';
import Button from '@mobile/components/ui/button';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import { styles } from './styles/registration-nanny-id-screen.styles';

type IdSide = 'front' | 'back';

// Nanny-only step: capture both sides of the government ID so an admin can
// verify identity (KYC) before approving the profile. The images are only
// local URIs here — they're uploaded to Firebase Storage at final submit
// (RegistrationStep3Screen), once the Firebase account exists.
export default function RegistrationNannyIdScreen() {
  const router = useRouter();
  const { role } = useLocalSearchParams<{ role?: string }>();

  const draft = useRegistrationDraftStore();
  const patch = useRegistrationDraftStore((s) => s.patch);

  const [formError, setFormError] = useState<string | null>(null);

  function handleBack() {
    router.back();
  }

  async function handlePickId(side: IdSide) {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Permission needed',
          'Please allow photo library access to upload your ID.',
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].uri;
        patch(side === 'front' ? { idFrontUri: uri } : { idBackUri: uri });
        if (formError) setFormError(null);
      }
    } catch (err) {
      Alert.alert(
        'Could not open photos',
        err instanceof Error ? err.message : 'Something went wrong.',
      );
    }
  }

  function handleContinue() {
    if (!draft.idFrontUri || !draft.idBackUri) {
      setFormError('Please upload both the front and back of your ID.');
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
            Families trust verified nannies. Upload clear photos of the front and
            back of your government ID. Only our review team can see them.
          </Text>

          {/* Upload cards */}
          <View style={styles.uploadGroup}>
            <IdUploadCard
              label="Front of ID"
              uri={draft.idFrontUri}
              onPress={() => handlePickId('front')}
            />
            <IdUploadCard
              label="Back of ID"
              uri={draft.idBackUri}
              onPress={() => handlePickId('back')}
            />
          </View>

          {formError && <Text style={styles.errorText}>{formError}</Text>}
        </ScrollView>

        {/* Fixed footer */}
        <View style={styles.footer}>
          <Button title="Continue" onPress={handleContinue} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function IdUploadCard({
  label,
  uri,
  onPress,
}: {
  label: string;
  uri: string | null;
  onPress: () => void;
}) {
  if (uri) {
    return (
      <Pressable
        style={[styles.uploadCard, styles.uploadCardFilled]}
        onPress={onPress}
      >
        <Image source={{ uri }} style={styles.previewImage} resizeMode="cover" />
        <View style={styles.previewBadge}>
          <Ionicons name="checkmark-circle" size={14} color={colors.success} />
          <Text style={styles.previewBadgeText}>{label}</Text>
        </View>
        <View style={styles.previewOverlay}>
          <Ionicons name="camera-outline" size={14} color={colors.white} />
          <Text style={styles.previewOverlayText}>Change</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable style={styles.uploadCard} onPress={onPress}>
      <View style={styles.uploadIconCircle}>
        <Ionicons name="card-outline" size={24} color={colors.primaryDark} />
      </View>
      <Text style={styles.uploadTitle}>{label}</Text>
      <Text style={styles.uploadHint}>Tap to upload a photo</Text>
    </Pressable>
  );
}
