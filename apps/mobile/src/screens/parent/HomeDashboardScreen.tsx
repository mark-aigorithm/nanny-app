import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  StyleSheet,
  Platform,
  StatusBar,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import BottomNav from '@mobile/components/BottomNav';

// ─── Layout constants ─────────────────────────────────────────────────────────

const STATUS_BAR_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44;
const HEADER_HEIGHT = STATUS_BAR_HEIGHT + 56;
const BOTTOM_NAV_HEIGHT = 80;

// ─── Placeholder images ───────────────────────────────────────────────────────
// ASSUMPTION: Images sourced from Figma CDN — expire in 7 days.
// Replace with S3/CDN URLs or bundled assets before production.

const IMG_USER_AVATAR = 'https://www.figma.com/api/mcp/asset/375d31c8-8abc-45b9-9273-4db36fa6b36c';
const IMG_PROMO_1 = 'https://www.figma.com/api/mcp/asset/8a071716-147b-4521-91d8-f02ffc431d69';
const IMG_PROMO_2 = 'https://www.figma.com/api/mcp/asset/b036d9b4-1369-46b2-a2ab-7bf10277dba5';
const IMG_ELENA = 'https://www.figma.com/api/mcp/asset/b036d9b4-1369-46b2-a2ab-7bf10277dba5';
const IMG_SARAH = 'https://www.figma.com/api/mcp/asset/b89dbd06-ef11-4609-8517-36912efbc57e';
const IMG_COMMUNITY = 'https://www.figma.com/api/mcp/asset/8a071716-147b-4521-91d8-f02ffc431d69';

// ─── Mock data interfaces ─────────────────────────────────────────────────────

interface PromoCard {
  id: string;
  title: string;
  subtitle: string;
  cta: string;
  image: string;
}

interface QuickAction {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  bgColor: string;
  iconColor: string;
  route: string;
}

interface NannyPreview {
  id: string;
  name: string;
  rating: number;
  hourlyRate: number;
  image: string;
}

interface FavouriteNanny {
  id: string;
  name: string;
  image: string;
}

// ─── Mock data ────────────────────────────────────────────────────────────────
// ASSUMPTION: All data will come from backend API calls once services are ready.

const PROMO_CARDS: PromoCard[] = [
  {
    id: '1',
    title: 'Weekend Special',
    subtitle: '20% off first booking',
    cta: 'EXPLORE',
    image: IMG_PROMO_1,
  },
  {
    id: '2',
    title: 'Pro Nannies',
    subtitle: 'Certified & background checked',
    cta: 'BOOK PRO',
    image: IMG_PROMO_2,
  },
];

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'book',
    label: 'Book now',
    icon: 'calendar',
    bgColor: 'rgba(151,165,145,0.15)',
    iconColor: '#97a591',
    route: '/(parent)/search',
  },
  {
    id: 'emergency',
    label: 'Emergency',
    icon: 'alert-circle',
    bgColor: 'rgba(192,99,74,0.12)',
    iconColor: '#c0634a',
    route: '/(parent)/search',
  },
  {
    id: 'community',
    label: 'Community',
    icon: 'people',
    bgColor: 'rgba(227,213,202,0.5)',
    iconColor: '#6b6158',
    route: '/(parent)/community',
  },
  {
    id: 'monitor',
    label: 'Live monitor',
    icon: 'videocam',
    bgColor: 'rgba(151,165,145,0.15)',
    iconColor: '#97a591',
    route: '/(parent)/nanny/live-video-monitor',
  },
];

const RECOMMENDED_NANNIES: NannyPreview[] = [
  {
    id: '1',
    name: 'Elena R.',
    rating: 4.9,
    hourlyRate: 28,
    image: IMG_ELENA,
  },
  {
    id: '2',
    name: 'Sarah J.',
    rating: 5.0,
    hourlyRate: 32,
    image: IMG_SARAH,
  },
  {
    id: '3',
    name: 'Maria L.',
    rating: 4.8,
    hourlyRate: 25,
    image: IMG_SARAH,
  },
];

const FAVOURITE_NANNIES: FavouriteNanny[] = [
  { id: '1', name: 'Elena', image: IMG_ELENA },
  { id: '2', name: 'Sarah', image: IMG_SARAH },
  { id: '3', name: 'Maria', image: IMG_ELENA },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function HomeDashboardScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      {/* ── Fixed header ── */}
      <View style={styles.header} pointerEvents="box-none">
        <View style={styles.headerRow}>
          <Text style={styles.greeting}>Good morning, Sarah</Text>
          <View style={styles.headerRight}>
            <Pressable
              style={styles.bellBtn}
              onPress={() => router.push('/(parent)/notifications' as never)}
            >
              <Ionicons name="notifications-outline" size={22} color="#2e2e2e" />
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>3</Text>
              </View>
            </Pressable>
            <Image source={{ uri: IMG_USER_AVATAR }} style={styles.avatar} />
          </View>
        </View>
      </View>

      {/* ── Scrollable content ── */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. Search bar */}
        <Pressable
          style={styles.searchBar}
          onPress={() => router.push('/(parent)/search' as never)}
        >
          <View style={styles.searchLeft}>
            <Ionicons name="search" size={18} color="#7a7a7a" />
            <Text style={styles.searchPlaceholder}>Find a nanny...</Text>
          </View>
          <View style={styles.searchPills}>
            <View style={styles.pill}>
              <Text style={styles.pillText}>Tomorrow</Text>
            </View>
            <View style={styles.pill}>
              <Text style={styles.pillText}>9:00 AM</Text>
            </View>
          </View>
        </Pressable>

        {/* 2. Promo carousel */}
        <FlatList
          data={PROMO_CARDS}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.promoList}
          renderItem={({ item }) => (
            <View style={styles.promoCard}>
              <Image source={{ uri: item.image }} style={styles.promoImage} resizeMode="cover" />
              <View style={styles.promoGradient} />
              <View style={styles.promoContent}>
                <Text style={styles.promoTitle}>{item.title}</Text>
                <Text style={styles.promoSubtitle}>{item.subtitle}</Text>
                <Pressable
                  style={styles.promoCta}
                  onPress={() => router.push('/(parent)/marketplace' as never)}
                >
                  <Text style={styles.promoCtaText}>{item.cta}</Text>
                </Pressable>
              </View>
            </View>
          )}
        />

        {/* 3. Quick actions grid */}
        <View style={styles.quickGrid}>
          {QUICK_ACTIONS.map((action) => (
            <Pressable
              key={action.id}
              style={styles.quickCard}
              onPress={() => router.push(action.route as never)}
            >
              <View style={[styles.quickIconBg, { backgroundColor: action.bgColor }]}>
                <Ionicons name={action.icon} size={22} color={action.iconColor} />
              </View>
              <Text style={styles.quickLabel}>{action.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* 4. Recommended nearby */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recommended nearby</Text>
            <Pressable onPress={() => router.push('/(parent)/search' as never)}>
              <Text style={styles.seeAll}>See all</Text>
            </Pressable>
          </View>
          <FlatList
            data={RECOMMENDED_NANNIES}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.nannyList}
            renderItem={({ item }) => (
              <Pressable
                style={styles.nannyCard}
                onPress={() =>
                  router.push({
                    pathname: '/(parent)/nanny/nanny-profile',
                    params: { id: item.id },
                  } as never)
                }
              >
                <Image
                  source={{ uri: item.image }}
                  style={styles.nannyImage}
                  resizeMode="cover"
                />
                <View style={styles.nannyInfo}>
                  <Text style={styles.nannyName}>{item.name}</Text>
                  <View style={styles.nannyRatingRow}>
                    <Ionicons name="star" size={12} color="#f5a623" />
                    <Text style={styles.nannyRating}>{item.rating.toFixed(1)}</Text>
                  </View>
                  <Text style={styles.nannyPrice}>${item.hourlyRate}/hr</Text>
                </View>
              </Pressable>
            )}
          />
        </View>

        {/* 5. Your favourites */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Favourites</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.favouritesList}
          >
            {FAVOURITE_NANNIES.map((fav) => (
              <Pressable
                key={fav.id}
                style={styles.favouriteItem}
                onPress={() =>
                  router.push({
                    pathname: '/(parent)/nanny/nanny-profile',
                    params: { id: fav.id },
                  } as never)
                }
              >
                <Image source={{ uri: fav.image }} style={styles.favouriteAvatar} />
                <Text style={styles.favouriteName}>{fav.name}</Text>
              </Pressable>
            ))}
            <Pressable
              style={styles.favouriteItem}
              onPress={() => router.push('/(parent)/search' as never)}
            >
              <View style={styles.addFavourite}>
                <Ionicons name="add" size={24} color="#97a591" />
              </View>
              <Text style={styles.favouriteName}>Add</Text>
            </Pressable>
          </ScrollView>
        </View>

        {/* 6. Community preview */}
        <View style={styles.communityCard}>
          <Image
            source={{ uri: IMG_COMMUNITY }}
            style={styles.communityImage}
            resizeMode="cover"
          />
          <View style={styles.communityBody}>
            <Text style={styles.communityTitle}>Mom's Coffee Morning</Text>
            <Text style={styles.communitySubtitle}>
              Join local parents this Saturday at 10 AM for coffee, conversation, and playtime.
            </Text>
            <Pressable
              style={styles.communityLink}
              onPress={() => router.push('/(parent)/community' as never)}
            >
              <Text style={styles.communityLinkText}>{'Join \u2192'}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {/* ── Bottom navigation ── */}
      <BottomNav activeTab="home" />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fcf9f7',
  },

  // Header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fcf9f7',
    zIndex: 100,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: STATUS_BAR_HEIGHT + 8,
    paddingBottom: 12,
  },
  greeting: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 20,
    color: '#2e2e2e',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  bellBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#c0634a',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  bellBadgeText: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 10,
    color: '#ffffff',
    lineHeight: 14,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#ffffff',
    backgroundColor: '#f0edeb',
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: HEADER_HEIGHT + 12,
    paddingBottom: BOTTOM_NAV_HEIGHT + 32,
    gap: 24,
  },

  // Search bar
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    backgroundColor: 'rgba(227,213,202,0.5)',
    borderRadius: 9999,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchPlaceholder: {
    fontFamily: 'Manrope',
    fontWeight: '400',
    fontSize: 15,
    color: '#7a7a7a',
  },
  searchPills: {
    flexDirection: 'row',
    gap: 6,
  },
  pill: {
    backgroundColor: '#ffffff',
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillText: {
    fontFamily: 'Manrope',
    fontWeight: '600',
    fontSize: 12,
    color: '#2e2e2e',
  },

  // Promo carousel
  promoList: {
    paddingHorizontal: 20,
    gap: 12,
  },
  promoCard: {
    width: 280,
    height: 160,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#f0edeb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  promoImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  promoGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  promoContent: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 16,
    gap: 4,
  },
  promoTitle: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 18,
    color: '#ffffff',
  },
  promoSubtitle: {
    fontFamily: 'Manrope',
    fontWeight: '400',
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
  },
  promoCta: {
    alignSelf: 'flex-start',
    marginTop: 8,
    backgroundColor: '#ffffff',
    borderRadius: 9999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  promoCtaText: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 11,
    color: '#2e2e2e',
    letterSpacing: 0.5,
  },

  // Quick actions
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 12,
  },
  quickCard: {
    width: '47%',
    height: 80,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingHorizontal: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  quickIconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: {
    fontFamily: 'Manrope',
    fontWeight: '600',
    fontSize: 14,
    color: '#2e2e2e',
    flexShrink: 1,
  },

  // Sections
  section: {
    gap: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 18,
    color: '#2e2e2e',
  },
  seeAll: {
    fontFamily: 'Manrope',
    fontWeight: '600',
    fontSize: 14,
    color: '#97a591',
  },

  // Recommended nanny cards
  nannyList: {
    paddingHorizontal: 20,
    gap: 12,
  },
  nannyCard: {
    width: 150,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  nannyImage: {
    width: '100%',
    height: 120,
    backgroundColor: '#f0edeb',
  },
  nannyInfo: {
    padding: 10,
    gap: 2,
  },
  nannyName: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 14,
    color: '#2e2e2e',
  },
  nannyRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  nannyRating: {
    fontFamily: 'Manrope',
    fontWeight: '600',
    fontSize: 12,
    color: '#2e2e2e',
  },
  nannyPrice: {
    fontFamily: 'Manrope',
    fontWeight: '600',
    fontSize: 13,
    color: '#7a7a7a',
    marginTop: 2,
  },

  // Favourites
  favouritesList: {
    paddingHorizontal: 20,
    gap: 16,
  },
  favouriteItem: {
    alignItems: 'center',
    gap: 6,
  },
  favouriteAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#f0edeb',
  },
  addFavourite: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: '#97a591',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(151,165,145,0.08)',
  },
  favouriteName: {
    fontFamily: 'Manrope',
    fontWeight: '600',
    fontSize: 12,
    color: '#7a7a7a',
  },

  // Community preview
  communityCard: {
    marginHorizontal: 20,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  communityImage: {
    width: '100%',
    height: 140,
    backgroundColor: '#f0edeb',
  },
  communityBody: {
    padding: 16,
    gap: 6,
  },
  communityTitle: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 16,
    color: '#2e2e2e',
  },
  communitySubtitle: {
    fontFamily: 'Manrope',
    fontWeight: '400',
    fontSize: 14,
    lineHeight: 20,
    color: '#7a7a7a',
  },
  communityLink: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  communityLinkText: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 14,
    color: '#97a591',
  },
});
