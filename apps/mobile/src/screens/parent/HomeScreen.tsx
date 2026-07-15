import React from 'react';
import { View, Text, ScrollView, Pressable, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import BottomNav from '@mobile/components/BottomNav';
import ParentTabHeader from '@mobile/components/ParentTabHeader';
import ParentActiveBookingCard from '@mobile/components/ParentActiveBookingCard';
import { Button } from '@mobile/components/ui';
import { APP_NAME } from '@mobile/constants';
import { useGuestGate } from '@mobile/hooks/useGuestGate';
import { colors } from '@mobile/theme';
import { styles } from './styles/home-screen.styles';

// Uber-style flow: the parent orders care without picking a nanny. Home is a
// single clear call to action plus a short explanation of what happens next —
// no nanny cards, no browsing.
const STEPS: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  body: string;
}[] = [
  {
    icon: 'paper-plane-outline',
    title: 'Request care',
    body: 'Tell us the day, time and how long. No need to choose a nanny.',
  },
  {
    icon: 'people-outline',
    title: 'We find a nanny',
    body: 'Your request goes to every available nanny. The first to accept is yours.',
  },
  {
    icon: 'card-outline',
    title: 'Pay & relax',
    body: 'Pay once a nanny accepts, then track the visit from start to finish.',
  },
];

export default function HomeScreen() {
  const router = useRouter();
  const { isGuest, gate } = useGuestGate();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor={colors.transparent} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Live order: finding a nanny / pay now / upcoming / in progress.
            Guests have no bookings — they get the welcome card instead. */}
        {isGuest ? (
          <View style={styles.guestWelcomeCard}>
            <Text style={styles.guestWelcomeTitle}>Welcome to {APP_NAME}</Text>
            <Text style={styles.guestWelcomeBody}>
              You&apos;re browsing as a guest. Look around, meet our vetted nannies and
              explore the community — then create a free account to book care.
            </Text>
            <Button
              title="Create free account"
              variant="primary"
              fullWidth
              onPress={() => router.push('/(auth)/role-selection')}
            />
          </View>
        ) : (
          <ParentActiveBookingCard />
        )}

        {/* Primary action: request care (broadcast to all available nannies) */}
        <Pressable
          style={styles.bookCareCard}
          onPress={gate(
            () => router.push('/(parent)/book/booking-date-picker'),
            'Create your free account to book trusted, vetted nannies.',
          )}
        >
          <View style={styles.bookCareIcon}>
            <Ionicons name="add" size={24} color={colors.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bookCareTitle}>Book care</Text>
            <Text style={styles.bookCareSubtitle}>One request reaches every available nanny</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.primary} />
        </Pressable>

        {/* Guest teaser: the nanny directory is the strongest conversion hook,
            so surface it where a signed-in mother sees her live booking. */}
        {isGuest && (
          <Pressable
            style={styles.meetNanniesCard}
            onPress={() => router.push('/(parent)/search')}
          >
            <View style={styles.meetNanniesIcon}>
              <Ionicons name="people-outline" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.bookCareTitle}>Meet our nannies</Text>
              <Text style={styles.bookCareSubtitle}>
                Browse trusted, vetted profiles near you
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.primary} />
          </Pressable>
        )}

        {/* How it works */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How it works</Text>
          <View style={styles.stepsCard}>
            {STEPS.map((step, i) => (
              <View
                key={step.title}
                style={[styles.stepRow, i < STEPS.length - 1 && styles.stepRowBorder]}
              >
                <View style={styles.stepIcon}>
                  <Ionicons name={step.icon} size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  <Text style={styles.stepBody}>{step.body}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <ParentTabHeader />

      <BottomNav activeTab="home" />
    </View>
  );
}
