import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Image,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import BottomNav from '@mobile/components/BottomNav';
import { Avatar } from '@mobile/components/ui';
import { colors } from '@mobile/theme';
import { styles } from './styles/home-screen.styles';
import type { NannyListItem, AvailabilityType } from '@nanny-app/shared';
import { HOME_FILTER_TABS } from '@mobile/constants';
import type { FilterTab } from '@mobile/constants';
import { IMG_HERO } from '@mobile/mocks/images';
import { useUserProfileStore } from '@mobile/store/userProfileStore';
import { useNannyList } from '@mobile/hooks/useNannies';

const FILTER_TO_AVAILABILITY: Partial<Record<FilterTab, AvailabilityType>> = {
  'Full-time': 'FULL_TIME',
  'Part-time': 'PART_TIME',
  'Occasional': 'OCCASIONAL',
};

// ASSUMPTION: Font 'Manrope' is loaded at the app root via expo-font / useFonts.
// from @expo-google-fonts/manrope in the root _layout.tsx.

// ASSUMPTION: Navigation to other screens (Search, Community, Messages, Booking) is handled
// by the parent navigator once other screens are implemented. Tab buttons are non-functional stubs.

export default function HomeScreen() {
  const router = useRouter();
  const profile = useUserProfileStore((s) => s.profile);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('Full-time');

  const availabilityFilter = FILTER_TO_AVAILABILITY[activeFilter];
  const { data: nannies = [], isLoading } = useNannyList(availabilityFilter);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor={colors.transparent} />

      {/* ── Scrollable main content ── */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero — tap to view dashboard */}
        <Pressable style={styles.heroSection} onPress={() => router.push('/(parent)/home-dashboard' as never)}>
          <Text style={styles.heroTitle}>{'Find the perfect nanny\ntoday'}</Text>
          <View style={styles.heroImageWrap}>
            <Image source={{ uri: IMG_HERO }} style={styles.heroImage} resizeMode="cover" />
            <View style={styles.heroOverlay} />
          </View>
        </Pressable>

        {/* Quick filters */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filtersScroll}
          contentContainerStyle={styles.filtersContent}
        >
          {HOME_FILTER_TABS.map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.chip, activeFilter === tab ? styles.chipActive : styles.chipInactive]}
              onPress={() => setActiveFilter(tab)}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, activeFilter === tab ? styles.chipTextActive : styles.chipTextInactive]}>
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Recommended nannies */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recommended nannies</Text>
            <TouchableOpacity activeOpacity={0.7} onPress={() => router.push('/(parent)/search')}>
              <Text style={styles.viewAll}>View All</Text>
            </TouchableOpacity>
          </View>
          {isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
          ) : nannies.length === 0 ? (
            <Text style={{ color: colors.textMuted, textAlign: 'center', marginVertical: 24 }}>
              No nannies available yet
            </Text>
          ) : (
            nannies.map((nanny) => (
              <NannyCard
                key={nanny.nannyProfileId}
                nanny={nanny}
                onViewProfile={(id) =>
                  router.push({ pathname: '/(parent)/nanny/nanny-profile', params: { id } })
                }
              />
            ))
          )}
        </View>

        {/* Editorial block */}
        <View style={styles.editorial}>
          <Text style={styles.editorialTag}>Curated Advice</Text>
          <Text style={styles.editorialTitle}>The Nanny Selection Guide: 5 Questions to Ask</Text>
          <Text style={styles.editorialBody}>
            Finding the right fit for your family sanctuary starts with deep alignment on values and
            safety standards.
          </Text>
          <TouchableOpacity style={styles.readBtn} activeOpacity={0.7}>
            <Text style={styles.readBtnText}>Read article</Text>
            <Ionicons name="chevron-forward" size={12} color={colors.primaryDark} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ── Fixed: Header ── */}
      <View style={styles.header} pointerEvents="box-none">
        <View style={styles.headerRow}>
          <Text style={styles.logoText}>NannyMom</Text>
          <View style={styles.headerRight}>
            <TouchableOpacity
              style={styles.iconBtn}
              activeOpacity={0.7}
              onPress={() => router.push('/(parent)/notifications')}
            >
              <Ionicons name="notifications-outline" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
            <Pressable onPress={() => router.push('/(parent)/mother-profile' as never)}>
              <Avatar uri={profile?.avatarUrl ?? undefined} size="sm" fallbackInitial={profile?.firstName?.[0]} />
            </Pressable>
          </View>
        </View>
      </View>

      {/* ── Fixed: FAB ── */}
      <TouchableOpacity style={styles.fab} activeOpacity={0.85} onPress={() => router.push('/(parent)/search')}>
        <Ionicons name="add" size={22} color={colors.white} />
      </TouchableOpacity>

      <BottomNav activeTab="home" />
    </View>
  );
}

// ─── NannyCard ───────────────────────────────────────────────────────────────

function NannyCard({ nanny, onViewProfile }: { nanny: NannyListItem; onViewProfile: (id: string) => void }) {
  const name = `${nanny.firstName} ${nanny.lastName}`;
  const expLabel = nanny.yearsOfExperience ? `${nanny.yearsOfExperience} yrs exp` : '';
  const locationLabel = nanny.location ?? '';

  return (
    <View style={styles.card}>
      {/* Photo */}
      <View style={styles.cardPhotoWrap}>
        {nanny.avatarUrl ? (
          <Image source={{ uri: nanny.avatarUrl }} style={styles.cardPhoto} resizeMode="cover" />
        ) : (
          <View style={[styles.cardPhoto, { backgroundColor: colors.primaryMuted, justifyContent: 'center', alignItems: 'center' }]}>
            <Ionicons name="person" size={40} color={colors.primary} />
          </View>
        )}
        {nanny.reviewCount > 0 && (
          <View style={styles.verifiedBadge}>
            <Text style={styles.verifiedText}>REVIEWED</Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View style={styles.cardBody}>
        <View style={styles.cardRow}>
          <View style={styles.cardNameCol}>
            <Text style={styles.cardName}>{name}</Text>
            <Text style={styles.cardMeta}>
              {[expLabel, locationLabel].filter(Boolean).join(' • ')}
            </Text>
          </View>
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={13} color={colors.gold} />
            <Text style={styles.ratingText}>
              {nanny.reviewCount > 0 ? nanny.rating.toFixed(1) : 'New'}
            </Text>
          </View>
        </View>

        {nanny.bio ? (
          <Text style={styles.cardBio} numberOfLines={2}>{nanny.bio}</Text>
        ) : null}

        <View style={styles.cardFooter}>
          <View style={styles.priceRow}>
            <Text style={styles.priceAmount}>${nanny.hourlyRate ?? '—'}</Text>
            <Text style={styles.priceUnit}>/hr</Text>
          </View>
          <TouchableOpacity style={styles.bookBtn} activeOpacity={0.85} onPress={() => onViewProfile(nanny.nannyProfileId)}>
            <Text style={styles.bookBtnText}>Book Now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

