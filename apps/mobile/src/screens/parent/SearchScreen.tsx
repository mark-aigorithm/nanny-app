import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  SafeAreaView,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import BottomNav from '@mobile/components/BottomNav';
import { Avatar, Badge } from '@mobile/components/ui';
import { colors } from '@mobile/theme';
import { styles } from './styles/search-screen.styles';

// ASSUMPTION: Images sourced from Figma CDN — expire in 7 days.
// Replace with S3/CDN URLs or bundled assets before production.
const IMG_NANNY_CLARA = 'https://www.figma.com/api/mcp/asset/81c926bc-6bcd-45bd-83be-49eda0682d21';
const IMG_NANNY_ELENA = 'https://www.figma.com/api/mcp/asset/1f5ca631-9125-4e5b-8903-7ba2fec58cf5';
const IMG_NANNY_MARCUS = 'https://www.figma.com/api/mcp/asset/3f04a106-7250-4240-b990-bceccc1c6f19';
const IMG_FEATURED_BANNER = 'https://www.figma.com/api/mcp/asset/30ac9da3-2d48-4c6d-a670-ad67ec6c7383';
const IMG_USER_PROFILE = 'https://www.figma.com/api/mcp/asset/f2251544-1290-4beb-886d-cbaf76b442ce';

// ASSUMPTION: Nannies data will come from GET /nannies?filter=nearby.
// Using hardcoded mock data until the backend and geolocation service are ready.
type FilterChip = 'All Nannies' | 'Newborn Care' | 'Live-in' | 'Special Needs' | 'Night Nurse';

const FILTER_CHIPS: FilterChip[] = [
  'All Nannies',
  'Newborn Care',
  'Live-in',
  'Special Needs',
  'Night Nurse',
];

interface NannyCardData {
  id: string;
  name: string;
  experience: string;
  type: string;
  rating: number;
  hourlyRate: number;
  image: string;
  verified: boolean;
}

const MOCK_NANNIES: NannyCardData[] = [
  {
    id: '1',
    name: 'Clara Henderson',
    experience: '8 years experience',
    type: 'Full-time',
    rating: 4.9,
    hourlyRate: 25,
    image: IMG_NANNY_CLARA,
    verified: true,
  },
  {
    id: '2',
    name: 'Elena Rodriguez',
    experience: '15 years experience',
    type: 'Part-time',
    rating: 5.0,
    hourlyRate: 32,
    image: IMG_NANNY_ELENA,
    verified: true,
  },
  {
    id: '3',
    name: 'Marcus Thorne',
    experience: '5 years experience',
    type: 'Activity Specialist',
    rating: 4.8,
    hourlyRate: 28,
    image: IMG_NANNY_MARCUS,
    verified: true,
  },
];

function NannyCard({ nanny, onViewProfile }: { nanny: NannyCardData; onViewProfile: (id: string) => void }) {
  return (
    <View style={styles.nannyCard}>
      <View style={styles.nannyImageContainer}>
        <Image source={{ uri: nanny.image }} style={styles.nannyImage} resizeMode="cover" />
        {nanny.verified && (
          <View style={styles.verifiedBadge}>
            <Ionicons name="checkmark" size={10} color={colors.white} />
            <Text style={styles.verifiedText}>VERIFIED</Text>
          </View>
        )}
      </View>
      <View style={styles.nannyInfo}>
        <View style={styles.nannyInfoRow}>
          <View style={styles.nannyNameBlock}>
            <Text style={styles.nannyName}>{nanny.name}</Text>
            <Text style={styles.nannyMeta}>
              {nanny.experience} • {nanny.type}
            </Text>
          </View>
          <View style={styles.ratingBadge}>
            <Ionicons name="star" size={12} color={colors.goldWarm} />
            <Text style={styles.ratingText}>{nanny.rating.toFixed(1)}</Text>
          </View>
        </View>
        <View style={styles.nannyPriceRow}>
          <Text style={styles.nannyPrice}>
            <Text style={styles.nannyPriceAmount}>${nanny.hourlyRate}</Text>
            <Text style={styles.nannyPriceUnit}>/hr</Text>
          </Text>
          <Pressable style={styles.viewProfileButton} onPress={() => onViewProfile(nanny.id)}>
            <Text style={styles.viewProfileText}>View Profile</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function SearchScreen() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<FilterChip>('All Nannies');
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
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
          <Text style={styles.resultsCount}>32 results</Text>
        </View>

        {/* Nanny Cards */}
        {MOCK_NANNIES.map((nanny, index) => (
          <React.Fragment key={nanny.id}>
            <NannyCard
              nanny={nanny}
              onViewProfile={(id) =>
                router.push({ pathname: '/(parent)/nanny/nanny-profile', params: { id } } as any)
              }
            />
            {/* Featured banner after second card */}
            {index === 1 && (
              <View style={styles.featuredBanner}>
                <View style={styles.featuredPremiumBadge}>
                  <Text style={styles.featuredPremiumText}>Premium Selection</Text>
                </View>
                <Text style={styles.featuredTitle}>Elite Care for Your Sanctuary</Text>
                <Text style={styles.featuredBody}>
                  {`Our Pro+ nannies have completed background checks, pediatric first aid, and professional training certifications.`}
                </Text>
                <Pressable
                  style={styles.featuredButton}
                  onPress={() => router.push('/(parent)/search-results' as never)}
                >
                  <Text style={styles.featuredButtonText}>Explore Pro+</Text>
                </Pressable>
                <View style={styles.featuredImageContainer}>
                  <Image
                    source={{ uri: IMG_FEATURED_BANNER }}
                    style={styles.featuredImage}
                    resizeMode="cover"
                  />
                </View>
              </View>
            )}
          </React.Fragment>
        ))}
      </ScrollView>

      {/* Header */}
      <View style={styles.header} pointerEvents="box-none">
        <SafeAreaView>
          <View style={styles.headerInner}>
            <Pressable>
              <Ionicons name="menu-outline" size={22} color={colors.primary} />
            </Pressable>
            <Text style={styles.headerTitle}>Explore</Text>
            <View style={styles.headerAvatarBorder}>
              <Image source={{ uri: IMG_USER_PROFILE }} style={styles.headerAvatar} />
            </View>
          </View>
          <View style={styles.searchBarContainer}>
            <View style={styles.searchBar}>
              <Ionicons name="search-outline" size={18} color={colors.textMuted} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Find the perfect nanny..."
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                returnKeyType="search"
                onSubmitEditing={() => router.push('/(parent)/search-results' as never)}
              />
            </View>
          </View>
        </SafeAreaView>
      </View>

      <BottomNav activeTab="search" messagesBadge={1} />
    </View>
  );
}

