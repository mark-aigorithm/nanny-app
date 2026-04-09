import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  StyleSheet,
  SafeAreaView,
  Platform,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import BottomNav from '@mobile/components/BottomNav';

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

const STATUS_BAR_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44;

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
            <Ionicons name="checkmark-circle" size={16} color="#97a591" />
          )}
        </View>

        <View style={styles.statPillsRow}>
          <View style={styles.statPill}>
            <Ionicons name="star" size={11} color="#c4a882" />
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
      <StatusBar barStyle="dark-content" backgroundColor="#fcf9f7" />

      {/* Fixed Header */}
      <SafeAreaView style={styles.headerSafeArea}>
        <View style={styles.header}>
          <Pressable style={styles.headerButton} onPress={handleBack}>
            <Ionicons name="chevron-back" size={24} color="#1b1c1b" />
          </Pressable>
          <Text style={styles.headerTitle}>Nannies near you</Text>
          <Pressable style={styles.headerButton}>
            <Ionicons name="options-outline" size={22} color="#1b1c1b" />
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
          <Ionicons name="search" size={18} color="#7a7a7a" />
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
            <View key={chip.id} style={styles.filterChipActive}>
              <Text style={styles.filterChipActiveText}>{chip.label}</Text>
              {chip.dismissible && (
                <Pressable
                  onPress={() => handleDismissFilter(chip.id)}
                  hitSlop={8}
                >
                  <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.8)" />
                </Pressable>
              )}
            </View>
          ))}
          <Pressable style={styles.addFilterChip}>
            <Text style={styles.addFilterChipText}>+ Add filter</Text>
          </Pressable>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fcf9f7',
  },

  // Header
  headerSafeArea: {
    backgroundColor: '#fcf9f7',
    zIndex: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 20,
    color: '#1b1c1b',
    letterSpacing: -0.5,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 100,
    gap: 16,
  },

  // Search bar
  searchBar: {
    backgroundColor: 'rgba(227,213,202,0.5)',
    borderRadius: 16,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 10,
  },
  searchBarText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 14,
    color: '#1b1c1b',
    flex: 1,
  },

  // Filter chips
  filterChipsScroll: {
    marginHorizontal: -24,
  },
  filterChipsContent: {
    paddingHorizontal: 24,
    gap: 8,
  },
  filterChipActive: {
    backgroundColor: '#97a591',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterChipActiveText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: '#fff',
  },
  addFilterChip: {
    backgroundColor: '#e3d5ca',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  addFilterChipText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: '#7a7a7a',
  },

  // Sort pills
  sortRow: {
    flexDirection: 'row',
    gap: 8,
  },
  sortPill: {
    backgroundColor: '#e3d5ca',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sortPillActive: {
    backgroundColor: '#97a591',
  },
  sortPillText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: '#7a7a7a',
  },
  sortPillTextActive: {
    color: '#fff',
  },

  // Count
  countText: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 13,
    color: '#7a7a7a',
  },

  // Nanny result card
  resultCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#f0edeb',
  },
  cardMiddle: {
    flex: 1,
    gap: 6,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  nannyName: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
    color: '#1b1c1b',
    flexShrink: 1,
  },
  statPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  statPill: {
    backgroundColor: '#f0edeb',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  statPillText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
    color: '#7a7a7a',
  },
  cardRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  price: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
    color: '#97a591',
  },
  bookButton: {
    backgroundColor: '#97a591',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  bookButtonText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
    color: '#fff',
  },
});
