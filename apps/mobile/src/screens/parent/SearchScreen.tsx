import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import BottomNav from '@mobile/components/BottomNav';
import ParentTabHeader from '@mobile/components/ParentTabHeader';
import ParentTabSearchStrip from '@mobile/components/ParentTabSearchStrip';
import { colors } from '@mobile/theme';
import { useNannyList } from '@mobile/hooks/useNannies';
import { formatHourlyRateAmount } from '@mobile/lib/formatMoney';
import { styles } from './styles/search-screen.styles';
import type { NannyListItem } from '@nanny-app/shared';

type FilterChip = 'All Nannies' | 'Newborn Care' | 'Live-in' | 'Special Needs' | 'Night Nurse';

const FILTER_CHIPS: FilterChip[] = [
  'All Nannies',
  'Newborn Care',
  'Live-in',
  'Special Needs',
  'Night Nurse',
];

function NannyCard({ nanny, onViewProfile }: { nanny: NannyListItem; onViewProfile: (id: string) => void }) {
  const name = `${nanny.firstName} ${nanny.lastName}`;
  const expLabel = nanny.yearsOfExperience ? `${nanny.yearsOfExperience} yrs exp` : '';
  const typeLabel = nanny.availabilityType.replace('_', '-').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

  return (
    <Pressable style={styles.nannyCard} onPress={() => onViewProfile(nanny.nannyProfileId)}>
      <View style={styles.nannyImageContainer}>
        {nanny.avatarUrl ? (
          <Image source={{ uri: nanny.avatarUrl }} style={styles.nannyImage} resizeMode="cover" />
        ) : (
          <View style={[styles.nannyImage, { backgroundColor: colors.primaryMuted, justifyContent: 'center', alignItems: 'center' }]}>
            <Ionicons name="person" size={56} color={colors.primary} />
          </View>
        )}
        {nanny.reviewCount > 0 && (
          <View style={styles.verifiedBadge}>
            <Ionicons name="checkmark" size={10} color={colors.white} />
            <Text style={styles.verifiedText}>REVIEWED</Text>
          </View>
        )}
      </View>
      <View style={styles.nannyInfo}>
        <View style={styles.nannyInfoRow}>
          <View style={styles.nannyNameBlock}>
            <Text style={styles.nannyName}>{name}</Text>
            <Text style={styles.nannyMeta}>
              {[expLabel, typeLabel].filter(Boolean).join(' • ')}
            </Text>
          </View>
          <View style={styles.ratingBadge}>
            <Ionicons name="star" size={12} color={colors.goldWarm} />
            <Text style={styles.ratingText}>
              {nanny.reviewCount > 0 ? nanny.rating.toFixed(1) : 'New'}
            </Text>
          </View>
        </View>
        {nanny.specialties.length > 0 && (
          <View style={styles.specialtiesRow}>
            {nanny.specialties.map(s => (
              <View key={s} style={styles.specialtyChip}>
                <Text style={styles.specialtyChipText}>{s}</Text>
              </View>
            ))}
          </View>
        )}
        <View style={styles.nannyPriceRow}>
          <Text style={styles.nannyPrice}>
            <Text style={styles.nannyPriceAmount}>{formatHourlyRateAmount(nanny.hourlyRate)}</Text>
            {nanny.hourlyRate != null && <Text style={styles.nannyPriceUnit}>/hr</Text>}
          </Text>
          <Pressable style={styles.viewProfileButton} onPress={() => onViewProfile(nanny.nannyProfileId)}>
            <Text style={styles.viewProfileText}>View Profile</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

export default function SearchScreen() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<FilterChip>('All Nannies');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const specialty = activeFilter !== 'All Nannies' ? activeFilter : undefined;

  const { data: nannies = [], isLoading, isError } = useNannyList({
    name: debouncedQuery || undefined,
    specialty,
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor={colors.transparent} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Filter Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterChipsContent}
          style={styles.filterChips}
        >
          {FILTER_CHIPS.map(chip => (
            <Pressable
              key={chip}
              style={[styles.chip, activeFilter === chip && styles.chipActive]}
              onPress={() => setActiveFilter(chip)}
            >
              <Text style={[styles.chipText, activeFilter === chip && styles.chipTextActive]}>
                {chip}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Section Header */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Available Nearby</Text>
          {!isLoading && !isError && (
            <Text style={styles.resultsCount}>{nannies.length} results</Text>
          )}
        </View>

        {/* States */}
        {isLoading && (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 32 }} />
        )}
        {isError && (
          <Text style={styles.emptyText}>Something went wrong. Please try again.</Text>
        )}
        {!isLoading && !isError && nannies.length === 0 && (
          <Text style={styles.emptyText}>No nannies match your search.</Text>
        )}

        {/* Nanny Cards */}
        {!isLoading && !isError && nannies.map((nanny) => (
          <NannyCard
            key={nanny.nannyProfileId}
            nanny={nanny}
            onViewProfile={(id) =>
              router.push({ pathname: '/(parent)/nanny/nanny-profile', params: { id } })
            }
          />
        ))}
      </ScrollView>

      <ParentTabHeader />

      <ParentTabSearchStrip
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Find the perfect nanny..."
        onClear={() => setSearchQuery('')}
      />

      <BottomNav activeTab="home" messagesBadge={1} />
    </View>
  );
}
