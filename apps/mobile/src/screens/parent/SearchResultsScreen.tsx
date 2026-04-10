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
import type { FilterChipData, SortOption, NannyResult } from '@mobile/types';
import { SORT_OPTIONS, INITIAL_SEARCH_FILTERS } from '@mobile/constants';
import { MOCK_NANNIES_RESULTS } from '@mobile/mocks';
import { styles } from './styles/search-results-screen.styles';

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
  const [filters, setFilters] = useState<FilterChipData[]>(INITIAL_SEARCH_FILTERS);
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
    });
  };

  const handleNannyPress = (nannyId: string) => {
    router.push({
      pathname: '/(parent)/nanny/nanny-profile',
      params: { id: nannyId },
    });
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
        {MOCK_NANNIES_RESULTS.map((nanny) => (
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

