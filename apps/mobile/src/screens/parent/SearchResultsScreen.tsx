import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import BottomNav from '@mobile/components/BottomNav';
import { Chip } from '@mobile/components/ui';
import { colors } from '@mobile/theme';
import { styles } from './styles/search-results-screen.styles';

// ASSUMPTION: Nanny avatar images will come from S3/CDN.
// Using placeholder URLs until backend integration is ready.
const IMG_SARAH = 'https://i.pravatar.cc/128?u=sarah-jenkins';
const IMG_ELENA = 'https://i.pravatar.cc/128?u=elena-rodriguez';
const IMG_MARYANNE = 'https://i.pravatar.cc/128?u=maryanne-oneil';
const IMG_JAMIE = 'https://i.pravatar.cc/128?u=jamie-chen';

interface FilterChipData {
  id: string;
  label: string;
  dismissible: boolean;
}

type SortOption = 'Recommended' | 'Price' | 'Distance';

interface NannyResult {
  id: string;
  name: string;
  avatar: string;
  rating: number;
  distance: string;
  experience: string;
  hourlyRate: number;
  verified: boolean;
  /** 0-1 opacity; defaults to 1 */
  opacity?: number;
}

// ASSUMPTION: Filter chips will be driven by search/filter state from a parent screen or URL params.
// Using hardcoded mock data until the filter service is ready.
const INITIAL_FILTERS: FilterChipData[] = [
  { id: 'rating', label: 'Rating 4.5+', dismissible: true },
  { id: 'cpr', label: 'CPR certified', dismissible: true },
  { id: 'ages', label: 'Ages 0\u20133', dismissible: true },
];

const SORT_OPTIONS: SortOption[] = ['Recommended', 'Price', 'Distance'];

// ASSUMPTION: Nanny results will come from GET /nannies?filter=...
// Using hardcoded mock data until the backend and geolocation service are ready.
const MOCK_NANNIES: NannyResult[] = [
  {
    id: '1',
    name: 'Sarah Jenkins',
    avatar: IMG_SARAH,
    rating: 4.9,
    distance: '1.2 mi',
    experience: '6y',
    hourlyRate: 28,
    verified: false,
  },
  {
    id: '2',
    name: 'Elena Rodriguez',
    avatar: IMG_ELENA,
    rating: 4.8,
    distance: '0.8 mi',
    experience: '4y',
    hourlyRate: 30,
    verified: true,
  },
  {
    id: '3',
    name: "Mary-Anne O'Neil",
    avatar: IMG_MARYANNE,
    rating: 5.0,
    distance: '2.1 mi',
    experience: '15y',
    hourlyRate: 35,
    verified: true,
  },
  {
    id: '4',
    name: 'Jamie Chen',
    avatar: IMG_JAMIE,
    rating: 4.7,
    distance: '',
    experience: '',
    hourlyRate: 26,
    verified: false,
    opacity: 0.6,
  },
];

function NannyResultCard({
  nanny,
  onBook,
  onPress,
}: {
  nanny: NannyResult;
  onBook: (id: string) => void;
  onPress: (id: string) => void;
}) {
  const opacity = nanny.opacity ?? 1;

  return (
    <Pressable style={[styles.resultCard, { opacity }]} onPress={() => onPress(nanny.id)}>
      <Image source={{ uri: nanny.avatar }} style={styles.avatar} />

      <View style={styles.cardMiddle}>
        <View style={styles.nameRow}>
          <Text style={styles.nannyName} numberOfLines={1}>
            {nanny.name}
          </Text>
          {nanny.verified && (
            <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
          )}
        </View>

        <View style={styles.statPillsRow}>
          <View style={styles.statPill}>
            <Ionicons name="star" size={11} color={colors.goldWarm} />
            <Text style={styles.statPillText}>{nanny.rating.toFixed(1)}</Text>
          </View>
          {nanny.distance !== '' && (
            <View style={styles.statPill}>
              <Text style={styles.statPillText}>{nanny.distance}</Text>
            </View>
          )}
          {nanny.experience !== '' && (
            <View style={styles.statPill}>
              <Text style={styles.statPillText}>Exp: {nanny.experience}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.cardRight}>
        <Text style={styles.price}>${nanny.hourlyRate}/hr</Text>
        <Pressable style={styles.bookButton} onPress={() => onBook(nanny.id)}>
          <Text style={styles.bookButtonText}>Book</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

export default function SearchResultsScreen() {
  const router = useRouter();
  const [filters, setFilters] = useState<FilterChipData[]>(INITIAL_FILTERS);
  const [activeSort, setActiveSort] = useState<SortOption>('Recommended');

  const handleBack = () => {
    router.back();
  };

  const handleDismissFilter = (id: string) => {
    setFilters((prev) => prev.filter((f) => f.id !== id));
  };

  const handleBook = (nannyId: string) => {
    router.push({
      pathname: '/(parent)/book/booking-step-1',
      params: { nannyId },
    } as any);
  };

  const handleNannyPress = (nannyId: string) => {
    router.push({
      pathname: '/(parent)/nanny/nanny-profile',
      params: { id: nannyId },
    } as any);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      {/* Fixed Header */}
      <SafeAreaView style={styles.headerSafeArea}>
        <View style={styles.header}>
          <Pressable style={styles.headerButton} onPress={handleBack}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Nannies near you</Text>
          <Pressable style={styles.headerButton}>
            <Ionicons name="options-outline" size={22} color={colors.textPrimary} />
          </Pressable>
        </View>
      </SafeAreaView>

      {/* Scrollable Content */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Search Bar */}
        <Pressable style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <Text style={styles.searchBarText}>
            Brooklyn, NY {'\u00B7'} Tomorrow {'\u00B7'} 9AM\u20135PM
          </Text>
        </Pressable>

        {/* Filter Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterChipsContent}
          style={styles.filterChipsScroll}
        >
          {filters.map((chip) => (
            <Chip
              key={chip.id}
              label={chip.label}
              active
              activeColor={colors.primary}
              dismissible={chip.dismissible}
              onDismiss={() => handleDismissFilter(chip.id)}
              size="md"
              style={styles.filterChipActive}
            />
          ))}
          <Chip
            label="+ Add filter"
            active={false}
            inactiveColor={colors.taupe}
          />
        </ScrollView>

        {/* Sort Pills */}
        <View style={styles.sortRow}>
          {SORT_OPTIONS.map((option) => (
            <Pressable
              key={option}
              style={[
                styles.sortPill,
                activeSort === option && styles.sortPillActive,
              ]}
              onPress={() => setActiveSort(option)}
            >
              <Text
                style={[
                  styles.sortPillText,
                  activeSort === option && styles.sortPillTextActive,
                ]}
              >
                {option}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Count */}
        <Text style={styles.countText}>24 nannies available</Text>

        {/* Nanny Result Cards */}
        {MOCK_NANNIES.map((nanny) => (
          <NannyResultCard
            key={nanny.id}
            nanny={nanny}
            onBook={handleBook}
            onPress={handleNannyPress}
          />
        ))}
      </ScrollView>

      <BottomNav activeTab="search" />
    </View>
  );
}

