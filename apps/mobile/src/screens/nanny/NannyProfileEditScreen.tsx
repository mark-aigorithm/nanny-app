import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@mobile/components/ui';
import { colors } from '@mobile/theme';
import { formatTimeDisplay } from '@mobile/components/TimeSelectSheet';
import ProfileVisibilityBanner from '@mobile/components/ProfileVisibilityBanner';
import NannyBottomNav from '@mobile/components/NannyBottomNav';
import NannyTabHeader from '@mobile/components/NannyTabHeader';
import { styles } from './styles/nanny-profile-edit-screen.styles';
import { useNannyProfile } from '@mobile/hooks/useNannyProfile';
import { useSignOut } from '@mobile/hooks/useAuth';
import { AvailabilityType } from '@nanny-app/shared';
import type { AvailabilityType as AvailabilityTypeValue, WeeklySchedule } from '@nanny-app/shared';

// ─── Working hours types & helpers ───────────────────────────────────────────

type DaySchedule = { available: boolean; startTime: string; endTime: string };

const DAY_NAMES: Record<number, string> = {
  1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 0: 'Sun',
};
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const DEFAULT_SCHEDULE: Record<number, DaySchedule> = {
  1: { available: true, startTime: '08:00', endTime: '18:00' },
  2: { available: true, startTime: '08:00', endTime: '18:00' },
  3: { available: true, startTime: '08:00', endTime: '18:00' },
  4: { available: true, startTime: '08:00', endTime: '18:00' },
  5: { available: true, startTime: '08:00', endTime: '18:00' },
  6: { available: false, startTime: '08:00', endTime: '18:00' },
  0: { available: false, startTime: '08:00', endTime: '18:00' },
};

function apiScheduleToUi(schedule: WeeklySchedule | null | undefined): Record<number, DaySchedule> {
  if (!schedule) return structuredClone(DEFAULT_SCHEDULE);
  const result = structuredClone(DEFAULT_SCHEDULE);
  for (const [key, value] of Object.entries(schedule)) {
    const day = parseInt(key, 10);
    if (!isNaN(day) && day >= 0 && day <= 6) {
      result[day] = value;
    }
  }
  return result;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const AVAILABILITY_OPTIONS: { label: string; value: AvailabilityTypeValue }[] = [
  { label: 'Full-time', value: AvailabilityType.FULL_TIME },
  { label: 'Part-time', value: AvailabilityType.PART_TIME },
  { label: 'Occasional', value: AvailabilityType.OCCASIONAL },
];

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function NannyProfileEditScreen() {
  const router = useRouter();
  const { data: nannyProfile, isLoading } = useNannyProfile();
  const signOut = useSignOut();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [experience, setExperience] = useState('');
  const [selectedAgeRanges, setSelectedAgeRanges] = useState<string[]>([]);
  const [availabilityType, setAvailabilityType] = useState<AvailabilityTypeValue>(AvailabilityType.OCCASIONAL);

  const [schedule, setSchedule] = useState<Record<number, DaySchedule>>(
    () => structuredClone(DEFAULT_SCHEDULE),
  );

  // Populate display state from the loaded profile (read-only — there is no
  // edit mode to sync back from).
  useEffect(() => {
    if (!nannyProfile) return;
    setFirstName(nannyProfile.firstName);
    setLastName(nannyProfile.lastName);
    setBio(nannyProfile.bio ?? '');
    setLocation(nannyProfile.location ?? '');
    setExperience(nannyProfile.yearsOfExperience?.toString() ?? '');
    setSelectedAgeRanges(nannyProfile.ageRanges);
    setAvailabilityType(nannyProfile.availabilityType);
    setSchedule(apiScheduleToUi(nannyProfile.schedule));
  }, [nannyProfile]);

  if (isLoading) {
    return (
      <ScreenContainer useSafeArea={false} style={styles.loadingCenter}>
        <ActivityIndicator size="large" color={colors.primary} />
      </ScreenContainer>
    );
  }

  // ── Read-only view helpers ─────────────────────────────────────────────────

  const fullName = `${firstName} ${lastName}`.trim();
  const experienceValue = experience ? Number(experience) : null;
  const availabilityLabel =
    AVAILABILITY_OPTIONS.find((o) => o.value === availabilityType)?.label ?? '';

  const stats: { value: string; label: string }[] = [];
  if (experienceValue != null) {
    stats.push({ value: String(experienceValue), label: experienceValue === 1 ? 'year' : 'years' });
  }
  if (availabilityLabel) stats.push({ value: availabilityLabel, label: 'availability' });

  return (
    <ScreenContainer useSafeArea={false}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Photo + identity */}
        <View style={styles.photoSection}>
          <View style={styles.photoWrapper}>
            {nannyProfile?.avatarUrl ? (
              <Image source={{ uri: nannyProfile.avatarUrl }} style={styles.photo} resizeMode="cover" />
            ) : (
              <View style={[styles.photo, { backgroundColor: colors.taupe, alignItems: 'center', justifyContent: 'center' }]}>
                <Ionicons name="person" size={40} color={colors.textPlaceholder} />
              </View>
            )}
          </View>

          {fullName ? <Text style={styles.viewName}>{fullName}</Text> : null}
          {location ? (
            <View style={styles.viewLocationRow}>
              <Ionicons name="location-outline" size={15} color={colors.textTertiary} />
              <Text style={styles.viewLocationText}>{location}</Text>
            </View>
          ) : null}
        </View>

        <ProfileVisibilityBanner note="Your profile is managed by NannyNow. Contact support to update it." />

        {/* Stats */}
        {stats.length > 0 ? (
          <View style={styles.statStrip}>
            {stats.map((stat, i) => (
              <React.Fragment key={stat.label}>
                {i > 0 ? <View style={styles.statDivider} /> : null}
                <View style={styles.statCol}>
                  <Text style={styles.statValue}>{stat.value}</Text>
                  <Text style={styles.statLabel}>{stat.label}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>
        ) : null}

        {/* About */}
        {bio ? (
          <View style={styles.formSection}>
            <Text style={styles.sectionLabel}>About</Text>
            <Text style={styles.viewBio}>{bio}</Text>
          </View>
        ) : null}

        {/* Age range */}
        {selectedAgeRanges.length > 0 ? (
          <View style={styles.formSection}>
            <Text style={styles.sectionLabel}>Age range</Text>
            <View style={styles.certsRow}>
              {selectedAgeRanges.map((range) => (
                <View key={range} style={styles.certChip}>
                  <Text style={styles.certChipText}>{range}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Certifications */}
        {nannyProfile && nannyProfile.certifications.length > 0 ? (
          <View style={styles.formSection}>
            <Text style={styles.sectionLabel}>Certifications</Text>
            <View style={styles.certsRow}>
              {nannyProfile.certifications.map((cert) => (
                <View key={cert.id} style={styles.certChip}>
                  <Text style={styles.certChipText}>{cert.name}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Working Hours */}
        <View style={styles.formSection}>
          <Text style={styles.sectionLabel}>Working hours</Text>
          <View style={styles.scheduleCard}>
            {DAY_ORDER.map((day, index) => {
              const slot = schedule[day]!;
              return (
                <View key={day}>
                  <View style={styles.dayRow}>
                    <Text style={styles.dayLabel}>{DAY_NAMES[day]}</Text>
                    <Text style={[styles.viewHoursText, !slot.available && styles.viewHoursOff]}>
                      {slot.available
                        ? `${formatTimeDisplay(slot.startTime)} – ${formatTimeDisplay(slot.endTime)}`
                        : 'Day off'}
                    </Text>
                  </View>
                  {index < DAY_ORDER.length - 1 && <View style={styles.dayDivider} />}
                </View>
              );
            })}
          </View>
        </View>

        {/* Sign out */}
        <Pressable
          style={[styles.saveButton, { backgroundColor: colors.taupe, marginTop: 0 }, signOut.isPending && { opacity: 0.6 }]}
          onPress={() =>
            signOut.mutate(undefined, {
              onSuccess: () => {
                router.replace('/(auth)/splash');
              },
            })
          }
          disabled={signOut.isPending}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="log-out-outline" size={18} color={colors.error} />
            <Text style={[styles.saveButtonText, { color: colors.error }]}>
              {signOut.isPending ? 'Signing out…' : 'Sign out'}
            </Text>
          </View>
        </Pressable>
      </ScrollView>

      <NannyTabHeader title="Profile" />

      <NannyBottomNav activeTab="profile" />
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
