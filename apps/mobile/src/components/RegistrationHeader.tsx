import React from 'react';
import { Pressable, StatusBar, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { colors } from '@mobile/theme';
import type { StepInfo } from '@mobile/lib/registrationSteps';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import { styles } from './styles/registration-header.styles';

type RegistrationHeaderProps = {
  /** From `stepInfo` — fills the progress bar. */
  step: StepInfo;
  /** Custom back handler; falls back to router.back(). */
  onBack?: () => void;
};

/**
 * The fixed top of every registration wizard screen: back, the title, and a
 * progress bar filled to this step's share of the journey (see
 * lib/registrationSteps). The screen pads its content by
 * `REGISTRATION_HEADER_HEIGHT` to start below it.
 */
export default function RegistrationHeader({ step, onBack }: RegistrationHeaderProps) {
  const router = useRouter();
  const isResume = useRegistrationDraftStore((s) => s.isResume);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.titleRow}>
        <Pressable
          style={styles.backButton}
          onPress={onBack ?? (() => router.back())}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>{isResume ? 'Finish setting up' : 'Create account'}</Text>
        <View style={styles.spacer} />
      </View>
      <View
        style={styles.progressTrack}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(step.progress * 100) }}
      >
        <View style={[styles.progressFill, { width: step.width }]} />
      </View>
    </View>
  );
}
