import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  StatusBar,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import BottomNav from '@mobile/components/BottomNav';
import { Avatar, Badge, SectionHeader } from '@mobile/components/ui';
import { colors } from '@mobile/theme';
import { styles } from './styles/home-dashboard-screen.styles';

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
    bgColor: colors.primaryMuted,
    iconColor: colors.primary,
    route: '/(parent)/search',
  },
  {
    id: 'emergency',
    label: 'Emergency',
    icon: 'alert-circle',
    bgColor: 'rgba(192,99,74,0.12)',
    iconColor: colors.error,
    route: '/(parent)/search',
  },
  {
    id: 'community',
    label: 'Community',
    icon: 'people',
    bgColor: colors.taupeLight,
    iconColor: colors.textTertiary,
    route: '/(parent)/community',
  },
  {
    id: 'monitor',
    label: 'Live monitor',
    icon: 'videocam',
    bgColor: colors.primaryMuted,
    iconColor: colors.primary,
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
      <StatusBar barStyle="dark-content" translucent backgroundColor={colors.transparent} />

      {/* ── Fixed header ── */}
      <View style={styles.header} pointerEvents="box-none">
        <View style={styles.headerRow}>
          <Text style={styles.greeting}>Good morning, Sarah</Text>
          <View style={styles.headerRight}>
            <Pressable
              style={styles.bellBtn}
              onPress={() => router.push('/(parent)/notifications' as never)}
            >
              <Ionicons name="notifications-outline" size={22} color={colors.textDark} />
              <Badge count={3} size="sm" style={styles.bellBadge} />
            </Pressable>
            <Avatar uri={IMG_USER_AVATAR} size="md" borderWidth={2} borderColor={colors.white} />
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
            <Ionicons name="search" size={18} color={colors.textMuted} />
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
          <SectionHeader
            title="Recommended nearby"
            actionLabel="See all"
            onAction={() => router.push('/(parent)/search' as never)}
          />
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
                    <Ionicons name="star" size={12} color={colors.gold} />
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
                <Avatar uri={fav.image} size="lg" />
                <Text style={styles.favouriteName}>{fav.name}</Text>
              </Pressable>
            ))}
            <Pressable
              style={styles.favouriteItem}
              onPress={() => router.push('/(parent)/search' as never)}
            >
              <View style={styles.addFavourite}>
                <Ionicons name="add" size={24} color={colors.primary} />
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

