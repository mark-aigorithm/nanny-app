import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const BENEFITS = [
  'Real-time care updates from your nanny',
  'Booking confirmations and reminders',
  'Local community and event alerts',
] as const;

export default function NotificationPermissionScreen() {
  const router = useRouter();

  async function handleEnable() {
    // TODO: Wire up expo-notifications permission request at runtime
    // await Notifications.requestPermissionsAsync();
    router.replace('/(parent)/home');
  }

  function handleSkip() {
    router.replace('/(parent)/home');
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Decorative blurred corners */}
      <View style={styles.blobTopRight} />
      <View style={styles.blobBottomLeft} />

      {/* Content */}
      <View style={styles.content}>
        {/* Bell icon */}
        <View style={styles.iconContainer}>
          <Ionicons name="notifications-outline" size={32} color="#556251" />
        </View>

        {/* Headline */}
        <Text style={styles.headline}>Stay in the loop</Text>

        {/* Body */}
        <Text style={styles.body}>
          Receive important updates about your childcare and community happenings.
        </Text>

        {/* Benefit rows */}
        <View style={styles.benefitsList}>
          {BENEFITS.map((text) => (
            <View key={text} style={styles.benefitRow}>
              <View style={styles.checkCircle}>
                <Ionicons name="checkmark" size={16} color="#556251" />
              </View>
              <Text style={styles.benefitText}>{text}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Footer CTAs */}
      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
          onPress={handleEnable}
        >
          <LinearGradient
            colors={['#97a591', '#556251']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gradientFill}
          >
            <Text style={styles.primaryButtonText}>Enable notifications</Text>
          </LinearGradient>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
          onPress={handleSkip}
        >
          <Text style={styles.secondaryButtonText}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fdfaf8',
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 48,
  },

  // Decorative blurred blobs
  blobTopRight: {
    position: 'absolute',
    top: -60,
    right: -60,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: '#ebddd2',
    opacity: 0.4,
  },
  blobBottomLeft: {
    position: 'absolute',
    bottom: -60,
    left: -60,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: '#97a591',
    opacity: 0.18,
  },

  // Content
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },

  // Bell icon circle
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#f0e9df',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },

  headline: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 26,
    letterSpacing: -0.5,
    color: '#1b1c1b',
    textAlign: 'center',
  },

  body: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 16,
    lineHeight: 24,
    color: '#675d54',
    textAlign: 'center',
    paddingHorizontal: 8,
    marginBottom: 8,
  },

  // Benefits
  benefitsList: {
    width: '100%',
    gap: 14,
    marginTop: 8,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#d8e7d1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitText: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 15,
    lineHeight: 22,
    color: '#1b1c1b',
    flex: 1,
  },

  // Footer
  footer: {
    gap: 16,
    alignItems: 'center',
  },

  // Primary CTA
  primaryButton: {
    width: '100%',
    height: 56,
    borderRadius: 9999,
    overflow: 'hidden',
    shadowColor: '#556251',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonPressed: {
    opacity: 0.88,
  },
  gradientFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
  },
  primaryButtonText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
    color: '#ffffff',
  },

  // Secondary CTA
  secondaryButton: {
    paddingVertical: 8,
  },
  secondaryButtonPressed: {
    opacity: 0.6,
  },
  secondaryButtonText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 15,
    color: '#675d54',
  },
});
