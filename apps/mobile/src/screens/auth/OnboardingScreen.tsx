import React from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '@mobile/theme';
import { styles } from './styles/onboarding-screen.styles';

// ASSUMPTION: Image sourced from Figma CDN — expires in 7 days.
// Replace with a bundled local asset or stable S3/CDN URL before production.
const IMG_EDITORIAL =
  'https://www.figma.com/api/mcp/asset/703c73b4-05ef-44cc-b830-9db4211cad35';

interface Props {
  onSkip?: () => void;
  onGetStarted?: () => void;
}

export default function OnboardingScreen({ onSkip, onGetStarted }: Props) {
  const router = useRouter();

  const handleSkip = () => {
    if (onSkip) {
      onSkip();
    } else {
      router.push('/(auth)/role-selection');
    }
  };

  const handleGetStarted = () => {
    if (onGetStarted) {
      onGetStarted();
    } else {
      router.push('/(auth)/role-selection');
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* ── Top 55%: editorial photo ── */}
      <View style={styles.imageSection}>
        <Image
          source={{ uri: IMG_EDITORIAL }}
          style={styles.heroImage}
          resizeMode="cover"
        />

        {/* Skip pill — top-right */}
        <Pressable style={styles.skipButton} onPress={handleSkip}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </View>

      {/* ── Bottom 45%: white rounded card ── */}
      <View style={styles.card}>
        {/* Headline */}
        <Text style={styles.headline}>Find trusted childcare, nearby</Text>

        {/* Body */}
        <Text style={styles.body}>
          Connect with premium, verified caregivers designed for the modern
          family's lifestyle and schedule.
        </Text>

        {/* Pagination dots */}
        <View style={styles.dotsRow}>
          <View style={[styles.dot, styles.dotActive]} />
          <View style={styles.dot} />
          <View style={styles.dot} />
        </View>

        {/* Get started button */}
        <Pressable
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
          onPress={handleGetStarted}
        >
            <View style={styles.ctaContent}>
            <Text style={styles.ctaText}>Get started</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.white} />
          </View>
        </Pressable>
      </View>
    </View>
  );
}
