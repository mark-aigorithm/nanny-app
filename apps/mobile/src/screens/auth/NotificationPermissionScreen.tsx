import React from 'react';
import {
  View,
  Text,
  Pressable,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import { colors } from '@mobile/theme';
import IconCircle from '@mobile/components/ui/icon-circle';
import { styles } from './styles/notification-permission-screen.styles';

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
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
          onPress={handleSkip}
        >
          <Text style={styles.secondaryButtonText}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}

