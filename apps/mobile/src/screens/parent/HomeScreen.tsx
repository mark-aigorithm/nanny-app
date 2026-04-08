import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  Platform,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// ASSUMPTION: Images sourced from Figma CDN — expire in 7 days.
// Replace with S3/CDN URLs or bundled assets before production.
const IMG_HERO = 'https://www.figma.com/api/mcp/asset/8a071716-147b-4521-91d8-f02ffc431d69';
const IMG_ELENA = 'https://www.figma.com/api/mcp/asset/b036d9b4-1369-46b2-a2ab-7bf10277dba5';
const IMG_SARAH = 'https://www.figma.com/api/mcp/asset/b89dbd06-ef11-4609-8517-36912efbc57e';
const IMG_USER_AVATAR = 'https://www.figma.com/api/mcp/asset/375d31c8-8abc-45b9-9273-4db36fa6b36c';

// ASSUMPTION: Nanny data will come from GET /nannies?recommended=true.
// Using hardcoded mock data until the backend service is ready.
const MOCK_NANNIES: NannyData[] = [
  {
    id: '1',
    name: 'Elena Rodriguez',
    experience: '8 years experience',
    distance: '2.4 miles',
    rating: 4.9,
    bio: 'Expert in Montessori education and newborn care. Certified in infant CPR and first aid...',
    hourlyRate: 28,
    verified: true,
    image: IMG_ELENA,
  },
  {
    id: '2',
    name: 'Sarah Johnson',
    experience: '5 years experience',
    distance: '0.8 miles',
    rating: 5.0,
    bio: 'Former preschool teacher specializing in early childhood development and creative play...',
    hourlyRate: 32,
    verified: true,
    image: IMG_SARAH,
  },
];

// ASSUMPTION: Filter selection will trigger a filtered API call once backend is ready.
const FILTER_TABS = ['Full-time', 'Part-time', 'Occasional', 'Emergency'] as const;
type FilterTab = (typeof FILTER_TABS)[number];

// ASSUMPTION: Font 'Manrope' is loaded at the app root via expo-font / useFonts.
// For native builds, add useFonts({ Manrope_400Regular, Manrope_600SemiBold, Manrope_700Bold })
// from @expo-google-fonts/manrope in the root _layout.tsx.

// ASSUMPTION: Navigation to other screens (Search, Community, Messages, Booking) is handled
// by the parent navigator once other screens are implemented. Tab buttons are non-functional stubs.

export default function HomeScreen() {
  const [activeFilter, setActiveFilter] = useState<FilterTab>('Full-time');

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      {/* ── Scrollable main content ── */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.heroSection}>
          <Text style={styles.heroTitle}>{'Find the perfect nanny\ntoday'}</Text>
          <View style={styles.heroImageWrap}>
            <Image source={{ uri: IMG_HERO }} style={styles.heroImage} resizeMode="cover" />
            <View style={styles.heroOverlay} />
          </View>
        </View>

        {/* Quick filters */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filtersScroll}
          contentContainerStyle={styles.filtersContent}
        >
          {FILTER_TABS.map((tab) => (
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
            <TouchableOpacity activeOpacity={0.7}>
              <Text style={styles.viewAll}>View All</Text>
            </TouchableOpacity>
          </View>
          {MOCK_NANNIES.map((nanny) => (
            <NannyCard key={nanny.id} nanny={nanny} />
          ))}
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
            <Ionicons name="chevron-forward" size={12} color="#556251" />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ── Fixed: Header ── */}
      <View style={styles.header} pointerEvents="box-none">
        <View style={styles.headerRow}>
          <Text style={styles.logoText}>NannyMom</Text>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.iconBtn} activeOpacity={0.7}>
              <Ionicons name="notifications-outline" size={20} color="#1b1c1b" />
            </TouchableOpacity>
            <Image source={{ uri: IMG_USER_AVATAR }} style={styles.avatar} />
          </View>
        </View>
      </View>

      {/* ── Fixed: FAB ── */}
      <TouchableOpacity style={styles.fab} activeOpacity={0.85}>
        <Ionicons name="add" size={22} color="#ffffff" />
      </TouchableOpacity>

      {/* ── Fixed: Bottom nav ── */}
      <View style={styles.bottomNav}>
        {NAV_TABS.map((tab) => (
          <TouchableOpacity key={tab.label} style={styles.navTab} activeOpacity={0.7}>
            <Ionicons name={tab.icon as any} size={20} color={tab.active ? '#97a591' : '#7a7a7a'} />
            <Text style={[styles.navLabel, tab.active && styles.navLabelActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ─── NannyCard ───────────────────────────────────────────────────────────────

type NannyData = {
  id: string;
  name: string;
  experience: string;
  distance: string;
  rating: number;
  bio: string;
  hourlyRate: number;
  verified: boolean;
  image: string;
};

function NannyCard({ nanny }: { nanny: NannyData }) {
  return (
    <View style={styles.card}>
      {/* Photo */}
      <View style={styles.cardPhotoWrap}>
        <Image source={{ uri: nanny.image }} style={styles.cardPhoto} resizeMode="cover" />
        {nanny.verified && (
          <View style={styles.verifiedBadge}>
            <Text style={styles.verifiedText}>VERIFIED</Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View style={styles.cardBody}>
        <View style={styles.cardRow}>
          <View style={styles.cardNameCol}>
            <Text style={styles.cardName}>{nanny.name}</Text>
            <Text style={styles.cardMeta}>
              {nanny.experience} • {nanny.distance}
            </Text>
          </View>
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={13} color="#f5a623" />
            <Text style={styles.ratingText}>{nanny.rating.toFixed(1)}</Text>
          </View>
        </View>

        <Text style={styles.cardBio} numberOfLines={2}>
          {nanny.bio}
        </Text>

        <View style={styles.cardFooter}>
          <View style={styles.priceRow}>
            <Text style={styles.priceAmount}>${nanny.hourlyRate}</Text>
            <Text style={styles.priceUnit}>/hr</Text>
          </View>
          <TouchableOpacity style={styles.bookBtn} activeOpacity={0.85}>
            <Text style={styles.bookBtnText}>Book Now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── Nav config ──────────────────────────────────────────────────────────────

const NAV_TABS = [
  { label: 'Home', icon: 'home', active: true },
  { label: 'Search', icon: 'search-outline', active: false },
  { label: 'Community', icon: 'people-outline', active: false },
  { label: 'Messages', icon: 'chatbubble-outline', active: false },
];

// ─── Layout constants ─────────────────────────────────────────────────────────

const STATUS_BAR_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44;
const HEADER_HEIGHT = STATUS_BAR_HEIGHT + 56; // status bar + logo row + bottom padding
const BOTTOM_NAV_HEIGHT = 80;

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fdfaf8',
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: HEADER_HEIGHT + 16,
    paddingBottom: BOTTOM_NAV_HEIGHT + 40,
    paddingHorizontal: 24,
    gap: 40,
  },

  // Hero
  heroSection: {
    gap: 24,
  },
  heroTitle: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 28,
    lineHeight: 35,
    letterSpacing: -0.7,
    color: '#1b1c1b',
  },
  heroImageWrap: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#f0edeb',
    height: 192,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },

  // Filters
  filtersScroll: {
    marginHorizontal: -24,
  },
  filtersContent: {
    paddingHorizontal: 24,
    gap: 12,
  },
  chip: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 9999,
  },
  chipActive: {
    backgroundColor: '#556251',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  chipInactive: {
    backgroundColor: 'rgba(235,221,210,0.5)',
  },
  chipText: {
    fontFamily: 'Manrope',
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 20,
  },
  chipTextActive: {
    color: '#ffffff',
  },
  chipTextInactive: {
    color: '#6b6158',
  },

  // Section
  section: {
    gap: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 20,
    lineHeight: 28,
    color: '#1b1c1b',
  },
  viewAll: {
    fontFamily: 'Manrope',
    fontWeight: '600',
    fontSize: 14,
    color: '#556251',
  },

  // Nanny card
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  cardPhotoWrap: {
    height: 280,
    backgroundColor: '#f0edeb',
  },
  cardPhoto: {
    width: '100%',
    height: '100%',
  },
  verifiedBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#6a9b6a',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  verifiedText: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 10,
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  cardBody: {
    padding: 20,
    gap: 12,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  cardNameCol: {
    flex: 1,
    gap: 2,
    marginRight: 12,
  },
  cardName: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 18,
    lineHeight: 28,
    color: '#1b1c1b',
  },
  cardMeta: {
    fontFamily: 'Manrope',
    fontWeight: '400',
    fontSize: 14,
    lineHeight: 20,
    color: '#7a7a7a',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 14,
    lineHeight: 20,
    color: '#2e2e2e',
  },
  cardBio: {
    fontFamily: 'Manrope',
    fontWeight: '400',
    fontSize: 14,
    lineHeight: 22,
    color: '#444842',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f0edeb',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  priceAmount: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 18,
    lineHeight: 28,
    color: '#2f3b2c',
  },
  priceUnit: {
    fontFamily: 'Manrope',
    fontWeight: '400',
    fontSize: 14,
    lineHeight: 20,
    color: '#7a7a7a',
  },
  bookBtn: {
    backgroundColor: '#556251',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  bookBtnText: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 14,
    color: '#ffffff',
  },

  // Editorial
  editorial: {
    backgroundColor: 'rgba(235,221,210,0.3)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(196,200,191,0.1)',
    paddingHorizontal: 25,
    paddingTop: 28,
    paddingBottom: 24,
    gap: 8,
  },
  editorialTag: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1.2,
    color: '#c4a882',
    textTransform: 'uppercase',
  },
  editorialTitle: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 20,
    lineHeight: 28,
    color: '#1b1c1b',
  },
  editorialBody: {
    fontFamily: 'Manrope',
    fontWeight: '400',
    fontSize: 14,
    lineHeight: 22,
    color: '#444842',
  },
  readBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingTop: 4,
  },
  readBtnText: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 14,
    color: '#556251',
  },

  // Header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(227,213,202,0.92)',
    zIndex: 100,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: STATUS_BAR_HEIGHT + 8,
    paddingBottom: 16,
  },
  logoText: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 24,
    lineHeight: 32,
    letterSpacing: -1.2,
    color: '#97a591',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f0edeb',
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: BOTTOM_NAV_HEIGHT + 16,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#556251',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },

  // Bottom nav
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: BOTTOM_NAV_HEIGHT,
    backgroundColor: '#e3d5ca',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingBottom: 20,
    paddingTop: 8,
  },
  navTab: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minWidth: 56,
  },
  navLabel: {
    fontFamily: 'Manrope',
    fontWeight: '600',
    fontSize: 13,
    color: '#7a7a7a',
  },
  navLabelActive: {
    color: '#97a591',
  },
});
