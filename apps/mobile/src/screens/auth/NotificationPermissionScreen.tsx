import React from 'react';
import { View, Pressable, ScrollView, StatusBar } from 'react-native';
import { Text } from '@mobile/components/ui/text';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import { requestPushPermissionAndRegister } from '@mobile/hooks/usePushNotifications';
import { useBottomBarPadding } from '@mobile/hooks/useBottomInset';
import { colors, spacing } from '@mobile/theme';
import IconCircle from '@mobile/components/ui/icon-circle';
import { styles } from './styles/notification-permission-screen.styles';

const BENEFITS = [
  'Real-time care updates from your nanny',
  'Booking confirmations and reminders',
  'Local community and event alerts',
] as const;

export default function NotificationPermissionScreen() {
  const bottomPadding = useBottomBarPadding(spacing['4xl']);
  const router = useRouter();
  const { role } = useLocalSearchParams<{ role?: string }>();

  // A freshly-registered nanny is always PENDING_REVIEW — she lands on the
  // pending screen until an admin approves her.
  const homeRoute = role === 'nanny' ? '/(auth)/pending-review' : '/(parent)/(tabs)/home';

  async function handleEnable() {
    try {
      await requestPushPermissionAndRegister();
    } catch {
      // Permission denied or native module unavailable — still continue onboarding.
    }
    router.replace(homeRoute);
  }

  function handleSkip() {
    router.replace(homeRoute);
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Decorative blurred corners */}
      <View style={styles.blobTopRight} />
      <View style={styles.blobBottomLeft} />

      {/* Centred when the screen has room; scrolls on a short phone or with a
          large font, instead of squashing the content into the buttons. */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Content */}
        <View style={styles.content}>
          {/* Bell icon */}
          <IconCircle
            icon="notifications-outline"
            size="xl"
            backgroundColor={colors.warmSubtle}
            iconColor={colors.primaryDark}
            style={styles.iconCircle}
          />

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
                <IconCircle
                  icon="checkmark"
                  size="sm"
                  backgroundColor={colors.successLight}
                  iconColor={colors.primaryDark}
                />
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
              colors={[colors.primary, colors.primaryDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.gradientFill}
            >
              <Text style={styles.primaryButtonText}>Enable notifications</Text>
            </LinearGradient>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.secondaryButtonPressed,
            ]}
            onPress={handleSkip}
          >
            <Text style={styles.secondaryButtonText}>Not now</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
