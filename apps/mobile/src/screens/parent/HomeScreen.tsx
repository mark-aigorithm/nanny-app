import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import BottomNav from '@mobile/components/BottomNav';
import { Avatar } from '@mobile/components/ui';
import { colors } from '@mobile/theme';
import { styles } from './styles/home-screen.styles';
import type { NannyData } from '@mobile/types';
import { HOME_FILTER_TABS } from '@mobile/constants';
import type { FilterTab } from '@mobile/constants';
import { MOCK_NANNIES_HOME } from '@mobile/mocks';
import { IMG_HERO, IMG_USER_AVATAR } from '@mobile/mocks/images';

// ASSUMPTION: Font 'Manrope' is loaded at the app root via expo-font / useFonts.
// from @expo-google-fonts/manrope in the root _layout.tsx.

// ASSUMPTION: Navigation to other screens (Search, Community, Messages, Booking) is handled
// by the parent navigator once other screens are implemented. Tab buttons are non-functional stubs.

export default function HomeScreen() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<FilterTab>('Full-time');

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor={colors.transparent} />

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
            <Text style={styles.sectionTitle}>Recommended nannies</Text>
            <TouchableOpacity activeOpacity={0.7}>
              <Text style={styles.viewAll}>View All</Text>
            </TouchableOpacity>
          </View>
          {MOCK_NANNIES_HOME.map((nanny) => (
            <NannyCard
              key={nanny.id}
              nanny={nanny}
              onViewProfile={(id) =>
                router.push({ pathname: '/(parent)/nanny/nanny-profile', params: { id } })
              }
            />
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
            <Ionicons name="chevron-forward" size={12} color={colors.primaryDark} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ── Fixed: Header ── */}
      <View style={styles.header} pointerEvents="box-none">
        <View style={styles.headerRow}>
          <Text style={styles.logoText}>NannyMom</Text>
          <View style={styles.headerRight}>
            <TouchableOpacity
              style={styles.iconBtn}
              activeOpacity={0.7}
              onPress={() => router.push('/(parent)/notifications')}
            >
              <Ionicons name="notifications-outline" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
            <Avatar uri={IMG_USER_AVATAR} size="sm" />
          </View>
        </View>
      </View>

      {/* ── Fixed: FAB ── */}
      <TouchableOpacity style={styles.fab} activeOpacity={0.85}>
        <Ionicons name="add" size={22} color={colors.white} />
      </TouchableOpacity>

      <BottomNav activeTab="home" />
    </View>
  );
}

// ─── NannyCard ───────────────────────────────────────────────────────────────

function NannyCard({ nanny, onViewProfile }: { nanny: NannyData; onViewProfile: (id: string) => void }) {
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
            <Ionicons name="star" size={13} color={colors.gold} />
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
          <TouchableOpacity style={styles.bookBtn} activeOpacity={0.85} onPress={() => onViewProfile(nanny.id)}>
            <Text style={styles.bookBtnText}>Book Now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

