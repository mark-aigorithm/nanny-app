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
import { PROMO_CARDS, QUICK_ACTIONS, RECOMMENDED_NANNIES, FAVOURITE_NANNIES } from '@mobile/mocks';
import { IMG_USER_AVATAR, IMG_HERO } from '@mobile/mocks/images';

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
              onPress={() => router.push('/(parent)/notifications')}
            >
              <Ionicons name="notifications-outline" size={22} color={colors.textDark} />
              <Badge count={3} size="sm" style={styles.bellBadge} />
            </Pressable>
            <Pressable onPress={() => router.push('/(parent)/mother-profile' as never)}>
              <Avatar uri={IMG_USER_AVATAR} size="md" borderWidth={2} borderColor={colors.white} />
            </Pressable>
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
          onPress={() => router.push('/(parent)/search')}
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
                  onPress={() => router.push('/(parent)/marketplace')}
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
            onAction={() => router.push('/(parent)/search')}
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
                  })
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
                  })
                }
              >
                <Avatar uri={fav.image} size="lg" />
                <Text style={styles.favouriteName}>{fav.name}</Text>
              </Pressable>
            ))}
            <Pressable
              style={styles.favouriteItem}
              onPress={() => router.push('/(parent)/search')}
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
            source={{ uri: IMG_HERO }}
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
              onPress={() => router.push('/(parent)/community')}
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

