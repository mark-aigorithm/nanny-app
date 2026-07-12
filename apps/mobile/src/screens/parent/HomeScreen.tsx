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
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import BottomNav from '@mobile/components/BottomNav';
import ParentTabHeader from '@mobile/components/ParentTabHeader';
import ParentTabFab from '@mobile/components/ParentTabFab';
import { colors, HEADER_HEIGHT } from '@mobile/theme';
import { styles } from './styles/home-screen.styles';
import type { NannyListItem, AvailabilityType } from '@nanny-app/shared';
import { HOME_FILTER_TABS } from '@mobile/constants';
import type { FilterTab } from '@mobile/constants';
import { IMG_HERO } from '@mobile/mocks/images';
import { useNannyList } from '@mobile/hooks/useNannies';
import { useRefreshByUser } from '@mobile/hooks/useRefreshByUser';
import { useDeviceLocation } from '@mobile/hooks/useDeviceLocation';
import { useUserProfileStore } from '@mobile/store/userProfileStore';
import { formatHourlyRateAmount } from '@mobile/lib/formatMoney';

const SHOW_HOME_BANNER = false;

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
  const [activeFilter, setActiveFilter] = useState<FilterTab>('Full-time');

  const availabilityFilter = FILTER_TO_AVAILABILITY[activeFilter];
  // Distance sort uses the mother's SAVED home location (from her user row),
  // falling back to live device GPS only when no home is saved.
  const savedProfile = useUserProfileStore((s) => s.profile);
  const { coords: deviceCoords } = useDeviceLocation();
  const searchCoords =
    savedProfile?.latitude != null && savedProfile?.longitude != null
      ? { latitude: savedProfile.latitude, longitude: savedProfile.longitude }
      : deviceCoords;
  const { data: nannies = [], isLoading, refetch } = useNannyList({
    ...(availabilityFilter ? { availabilityType: availabilityFilter } : {}),
    ...(searchCoords ? { latitude: searchCoords.latitude, longitude: searchCoords.longitude } : {}),
  });
  const { isRefreshingByUser, refreshByUser } = useRefreshByUser(refetch);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor={colors.transparent} />

      {/* ── Scrollable main content ── */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            progressViewOffset={HEADER_HEIGHT}
            refreshing={isRefreshingByUser}
            onRefresh={refreshByUser}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {SHOW_HOME_BANNER && (
          <Pressable style={styles.heroSection} onPress={() => router.push('/(parent)/home-dashboard' as never)}>
            <Text style={styles.heroTitle}>{'Find the perfect nanny\ntoday'}</Text>
            <View style={styles.heroImageWrap}>
              <Image source={{ uri: IMG_HERO }} style={styles.heroImage} resizeMode="cover" />
              <View style={styles.heroOverlay} />
            </View>
          </Pressable>
        )}

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
            <Text style={styles.sectionTitle}>{searchCoords ? 'Recommended near you' : 'Recommended nannies'}</Text>
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
        <Pressable
          style={styles.editorial}
          onPress={() => router.push('/(parent)/nanny-selection-guide')}
        >
          <Text style={styles.editorialTag}>Curated Advice</Text>
          <Text style={styles.editorialTitle}>The Nanny Selection Guide: 5 Questions to Ask</Text>
          <Text style={styles.editorialBody}>
            Finding the right fit for your family sanctuary starts with deep alignment on values and
            safety standards.
          </Text>
          <View style={styles.readBtn}>
            <Text style={styles.readBtnText}>Read article</Text>
            <Ionicons name="chevron-forward" size={12} color={colors.primaryDark} />
          </View>
        </Pressable>
      </ScrollView>

      <ParentTabHeader />

      <ParentTabFab onPress={() => router.push('/(parent)/search')} />

      <BottomNav activeTab="home" />
    </View>
  );
}

// ─── NannyCard ───────────────────────────────────────────────────────────────

function NannyCard({ nanny, onViewProfile }: { nanny: NannyListItem; onViewProfile: (id: string) => void }) {
  const name = `${nanny.firstName} ${nanny.lastName}`;
  const expLabel = nanny.yearsOfExperience ? `${nanny.yearsOfExperience} yrs exp` : '';
  const distanceLabel = nanny.distanceKm != null ? `${nanny.distanceKm.toFixed(1)} km away` : '';
  const locationLabel = nanny.location ?? '';

  return (
    <Pressable style={styles.card} onPress={() => onViewProfile(nanny.nannyProfileId)}>
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
              {[distanceLabel, expLabel, locationLabel].filter(Boolean).join(' • ')}
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
            <Text style={styles.priceAmount}>{formatHourlyRateAmount(nanny.hourlyRate)}</Text>
            {nanny.hourlyRate != null && <Text style={styles.priceUnit}>/hr</Text>}
          </View>
          <TouchableOpacity style={styles.bookBtn} activeOpacity={0.85} onPress={() => onViewProfile(nanny.nannyProfileId)}>
            <Text style={styles.bookBtnText}>Book Now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Pressable>
  );
}

