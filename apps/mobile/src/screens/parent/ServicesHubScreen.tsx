import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import BottomNav from '@mobile/components/BottomNav';
import { IconCircle, ScreenContainer, StackHeader } from '@mobile/components/ui';
import { useGuestGate } from '@mobile/hooks/useGuestGate';
import { useIdGate } from '@mobile/hooks/useIdGate';
import { useEmailGate } from '@mobile/hooks/useEmailGate';
import { colors } from '@mobile/theme';
import { styles } from './styles/services-hub-screen.styles';

// Uber-style services hub: one hero action plus a grid of everything else
// the app offers. Screen-specific tile config stays local (see CLAUDE.md).
const TILES: {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}[] = [
  { key: 'community', label: 'Community', icon: 'people-outline' },
  { key: 'marketplace', label: 'Marketplace', icon: 'storefront-outline' },
  { key: 'events', label: 'Events & Meetups', icon: 'calendar-outline' },
  { key: 'rewards', label: 'Care Points', icon: 'gift-outline' },
  { key: 'packages', label: 'Packages', icon: 'time-outline' },
];

export default function ServicesHubScreen() {
  const router = useRouter();
  const { gate } = useGuestGate();
  const { gate: idGate } = useIdGate();
  const { gate: emailGate } = useEmailGate();

  // Guest → email → ID, outermost first: register before anything, then the
  // quick ask (an address), then the heavier one (a government ID).
  const openBooking = gate(
    emailGate(idGate(() => router.push('/(parent)/book/booking-date-picker'))),
    'Create your free account to book trusted, vetted nannies.',
  );

  const openTile = (key: string) => {
    switch (key) {
      case 'community':
        router.push('/(parent)/community');
        break;
      case 'marketplace':
        router.push('/(parent)/marketplace');
        break;
      case 'events':
        router.push('/(parent)/events-meetups');
        break;
      case 'rewards':
        router.push({
          pathname: '/(parent)/rewards',
          params: { returnTo: 'services' },
        } as never);
        break;
      case 'packages':
        router.push('/(parent)/packages' as never);
        break;
      default:
        break;
    }
  };

  const GATED_TILE_COPY: Record<string, string> = {
    rewards: 'Create your free account to earn Care Points.',
    packages: 'Create your free account to buy care packages.',
  };

  const tileHandler = (key: string) => {
    const gateCopy = GATED_TILE_COPY[key];
    return gateCopy ? gate(() => openTile(key), gateCopy) : () => openTile(key);
  };

  return (
    <ScreenContainer useSafeArea={false}>
      <StackHeader title="Services" showBackButton={false} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          style={({ pressed }) => [styles.heroTile, pressed && styles.tilePressed]}
          onPress={openBooking}
        >
          <IconCircle icon="add" size="lg" backgroundColor={colors.primary} iconColor={colors.white} />
          <View style={styles.heroTextWrap}>
            <Text style={styles.heroTitle}>Book a Nanny</Text>
            <Text style={styles.heroSubtitle}>One request reaches every available nanny</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.primaryDark} />
        </Pressable>

        <View style={styles.grid}>
          {TILES.map((tile) => (
            <Pressable
              key={tile.key}
              style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
              onPress={tileHandler(tile.key)}
            >
              <Ionicons name={tile.icon} size={24} color={colors.textPrimary} />
              <Text style={styles.tileLabel}>{tile.label}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <BottomNav activeTab="services" />
    </ScreenContainer>
  );
}
