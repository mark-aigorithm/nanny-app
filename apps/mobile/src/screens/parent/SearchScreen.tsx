import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  StyleSheet,
  SafeAreaView,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import BottomNav from '@mobile/components/BottomNav';

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
            <Ionicons name="checkmark" size={10} color="#fff" />
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
            <Ionicons name="star" size={12} color="#c4a882" />
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
                <Pressable style={styles.featuredButton}>
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
              <Ionicons name="menu-outline" size={22} color="#97a591" />
            </Pressable>
            <Text style={styles.headerTitle}>Explore</Text>
            <View style={styles.headerAvatarBorder}>
              <Image source={{ uri: IMG_USER_PROFILE }} style={styles.headerAvatar} />
            </View>
          </View>
          <View style={styles.searchBarContainer}>
            <View style={styles.searchBar}>
              <Ionicons name="search-outline" size={18} color="#7a7a7a" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Find the perfect nanny..."
                placeholderTextColor="#7a7a7a"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>
          </View>
        </SafeAreaView>
      </View>

      <BottomNav activeTab="search" messagesBadge={1} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fcf9f7',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 172,
    paddingBottom: 100,
    paddingHorizontal: 24,
    gap: 24,
  },

  // Header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(227, 213, 202, 0.92)',
    zIndex: 10,
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 8,
  },
  headerTitle: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 18,
    letterSpacing: -0.9,
    color: '#97a591',
  },
  headerAvatarBorder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(151, 165, 145, 0.2)',
    overflow: 'hidden',
    padding: 1,
    backgroundColor: '#e5e2e0',
  },
  headerAvatar: {
    flex: 1,
    borderRadius: 14,
  },
  searchBarContainer: {
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  searchBar: {
    backgroundColor: '#e3d5ca',
    borderRadius: 16,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 16,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Manrope_400Regular',
    fontSize: 16,
    color: '#1b1c1b',
  },

  // Filter chips
  filterChips: {
    marginHorizontal: -24,
  },
  filterChipsContent: {
    paddingHorizontal: 24,
    gap: 8,
  },
  chip: {
    backgroundColor: '#e3d5ca',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  chipActive: {
    backgroundColor: '#97a591',
  },
  chipText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: '#7a7a7a',
    lineHeight: 19.5,
  },
  chipTextActive: {
    color: '#fff',
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  sectionTitle: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
    letterSpacing: -0.4,
    color: '#1b1c1b',
  },
  resultsCount: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: '#97a591',
    lineHeight: 19.5,
  },

  // Nanny cards
  nannyCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  nannyImageContainer: {
    position: 'relative',
    backgroundColor: '#f0edeb',
  },
  nannyImage: {
    width: '100%',
    height: 240,
  },
  verifiedBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: '#6a9b6a',
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  verifiedText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
    color: '#fff',
    letterSpacing: 0.55,
  },
  nannyInfo: {
    padding: 20,
    gap: 8,
  },
  nannyInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  nannyNameBlock: {
    flex: 1,
    gap: 2,
  },
  nannyName: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
    color: '#1b1c1b',
    lineHeight: 24,
  },
  nannyMeta: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 13,
    color: '#7a7a7a',
    lineHeight: 19.5,
  },
  ratingBadge: {
    backgroundColor: '#fdfaf8',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
    color: '#1b1c1b',
    lineHeight: 19.5,
  },
  nannyPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  nannyPrice: {
    lineHeight: 27,
  },
  nannyPriceAmount: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 18,
    color: '#c4a882',
  },
  nannyPriceUnit: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 13,
    color: '#7a7a7a',
  },
  viewProfileButton: {
    backgroundColor: '#97a591',
    borderRadius: 9999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  viewProfileText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
    color: '#fff',
    lineHeight: 19.5,
  },

  // Featured banner
  featuredBanner: {
    backgroundColor: 'rgba(227, 213, 202, 0.5)',
    borderRadius: 24,
    padding: 32,
    gap: 16,
  },
  featuredPremiumBadge: {
    backgroundColor: '#c4a882',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  featuredPremiumText: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 10,
    color: '#fff',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  featuredTitle: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
    letterSpacing: -0.4,
    color: '#1b1c1b',
    lineHeight: 20,
  },
  featuredBody: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
    color: '#7a7a7a',
    lineHeight: 22.75,
  },
  featuredButton: {
    backgroundColor: '#556251',
    borderRadius: 9999,
    paddingHorizontal: 24,
    paddingVertical: 12,
    alignSelf: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  featuredButtonText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
    color: '#fff',
    lineHeight: 21,
  },
  featuredImageContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  featuredImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },

});
