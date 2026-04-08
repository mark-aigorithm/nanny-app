import React from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

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
        {/* Dark top-to-transparent gradient overlay — simulated with two Views */}
        <View style={styles.gradientOverlayTop} />
        <View style={styles.gradientOverlayMid} />

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
          {/* Gradient simulated: two-tone bg via overlapping views */}
          <View style={styles.ctaGradientLeft} />
          <View style={styles.ctaGradientRight} />
          <View style={styles.ctaContent}>
            <Text style={styles.ctaText}>Get started</Text>
            <Ionicons name="arrow-forward" size={18} color="#ffffff" />
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1b1c1b',
  },

  // ── Image section (top 55%) ──────────────────────────────────────────────────
  imageSection: {
    height: '55%',
    overflow: 'hidden',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  // Topmost dark band
  gradientOverlayTop: {
    ...StyleSheet.absoluteFillObject,
    height: '45%',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  // Fade band below that transitions to transparent
  gradientOverlayMid: {
    position: 'absolute',
    top: '35%',
    left: 0,
    right: 0,
    height: '25%',
    backgroundColor: 'rgba(0,0,0,0.0)',
  },
  skipButton: {
    position: 'absolute',
    top: 56,
    right: 24,
    backgroundColor: 'rgba(0,0,0,0.1)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 9999,
    // Frosted-glass effect approximated with a semi-transparent bg
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  skipText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 14,
    color: '#ffffff',
    lineHeight: 20,
  },

  // ── Bottom card (bottom 45%) ─────────────────────────────────────────────────
  card: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 32,
    paddingTop: 36,
    paddingBottom: 48,
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 12,
  },
  headline: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 28,
    letterSpacing: -0.7,
    color: '#1b1c1b',
    lineHeight: 36,
    marginBottom: 12,
  },
  body: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 16,
    lineHeight: 26,
    color: '#444842',
    marginBottom: 28,
  },

  // Pagination dots
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 32,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ebddd2',
  },
  dotActive: {
    width: 32,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#97a591',
  },

  // CTA button
  cta: {
    height: 56,
    borderRadius: 24,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPressed: {
    opacity: 0.88,
  },
  // Gradient: left half (#97a591) blending into right half (#7a8a75)
  ctaGradientLeft: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#97a591',
  },
  ctaGradientRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: '50%',
    backgroundColor: '#7a8a75',
  },
  ctaContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 1,
  },
  ctaText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
    color: '#ffffff',
    lineHeight: 24,
  },
});
