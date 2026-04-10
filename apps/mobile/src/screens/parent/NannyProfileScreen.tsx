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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import { colors, borderRadius } from '@mobile/theme';
import { Avatar, Card } from '@mobile/components/ui';
import { styles } from './styles/nanny-profile-screen.styles';

// ASSUMPTION: Images sourced from Figma CDN — expire in 7 days.
// Replace with S3/CDN URLs or bundled assets before production.
const IMG_NANNY_HERO = 'https://www.figma.com/api/mcp/asset/b036d9b4-1369-46b2-a2ab-7bf10277dba5';
const IMG_AVATAR_1 = 'https://www.figma.com/api/mcp/asset/375d31c8-8abc-45b9-9273-4db36fa6b36c';
const IMG_AVATAR_2 = 'https://www.figma.com/api/mcp/asset/b89dbd06-ef11-4609-8517-36912efbc57e';
const IMG_AVATAR_3 = 'https://www.figma.com/api/mcp/asset/8a071716-147b-4521-91d8-f02ffc431d69';

// ASSUMPTION: Nanny profile data will come from GET /nannies/:id.
// Using hardcoded mock data until the backend service is ready.
// TODO: Replace with useNannyProfile(id) React Query hook
const MOCK_NANNY = {
  id: '1',
  name: 'Elena Martinez',
  hourlyRate: 28,
  rating: 4.9,
  reviewCount: 127,
  location: 'Brooklyn, NY',
  yearsExperience: 8,
  age: 29,
  ageRange: '0-5',
  verified: true,
  about:
    'Passionate childcare professional with 8 years of experience in early childhood education. I specialize in creating nurturing, stimulating environments where children can thrive and develop at their own pace. My approach combines Montessori principles with play-based learning.',
  certifications: [
    { id: '1', label: 'First Aid', icon: 'medkit-outline' as const },
    { id: '2', label: 'CPR', icon: 'heart-outline' as const },
    { id: '3', label: 'BG Check', icon: 'shield-checkmark-outline' as const },
    { id: '4', label: 'ECE Degree', icon: 'school-outline' as const },
  ],
  connectionsCount: 3,
  image: IMG_NANNY_HERO,
};

// ASSUMPTION: Reviews will come from GET /nannies/:id/reviews with pagination.
// Using hardcoded mock data until the backend service is ready.
const MOCK_REVIEWS = [
  {
    id: '1',
    authorInitial: 'S',
    authorName: 'Sarah Jenkins',
    timeAgo: '2 weeks ago',
    rating: 5,
    text: 'Elena was absolutely wonderful with our twins. She kept them engaged with creative activities all day and even helped with light tidying. We felt completely at ease leaving them in her care.',
  },
  {
    id: '2',
    authorInitial: 'M',
    authorName: 'Michael Ross',
    timeAgo: '1 month ago',
    rating: 4,
    text: 'Very professional and reliable. Our son loved spending time with Elena. She was always on time and communicated well throughout the day.',
  },
];

// ASSUMPTION: Font 'Manrope' is loaded at the app root via expo-font / useFonts.
// from @expo-google-fonts/manrope in the root _layout.tsx.

const FOOTER_HEIGHT = 100;

export default function NannyProfileScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [aboutExpanded, setAboutExpanded] = useState(false);

  // TODO: Replace with useNannyProfile(id) React Query hook
  const nanny = MOCK_NANNY;
  const reviews = MOCK_REVIEWS;

  const handleBack = () => {
    router.back();
  };

  const renderStars = (rating: number) => {
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalf = rating - fullStars >= 0.5;

    for (let i = 0; i < fullStars; i++) {
      stars.push(
        <Ionicons key={`star-${i}`} name="star" size={14} color={colors.gold} />
      );
    }
    if (hasHalf) {
      stars.push(
        <Ionicons key="star-half" name="star-half" size={14} color={colors.gold} />
      );
    }
    return stars;
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor={colors.transparent} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero Image Section ── */}
        <View style={styles.heroSection}>
          <Image
            source={{ uri: nanny.image }}
            style={styles.heroImage}
            resizeMode="cover"
          />
          <LinearGradient
            colors={[colors.transparent, 'rgba(253,250,248,0.6)', colors.background]}
            locations={[0.3, 0.7, 1]}
            style={styles.heroGradient}
          />
        </View>

        {/* ── Summary Card ── */}
        <View style={styles.summaryCard}>
          {/* Name + Rate row */}
          <View style={styles.nameRow}>
            <View style={styles.nameVerified}>
              <Text style={styles.nannyName}>{nanny.name}</Text>
              {nanny.verified && (
                <Ionicons name="checkmark-circle" size={20} color={colors.primaryDark} />
              )}
            </View>
            <Text style={styles.hourlyRate}>${nanny.hourlyRate}/hr</Text>
          </View>

          {/* Rating row */}
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={14} color={colors.gold} />
            <Text style={styles.ratingText}>{nanny.rating}</Text>
            <Text style={styles.ratingDot}>{' \u2022 '}</Text>
            <Text style={styles.ratingMeta}>({nanny.reviewCount} reviews)</Text>
            <Text style={styles.ratingDot}>{' \u2022 '}</Text>
            <Text style={styles.ratingMeta}>{nanny.location}</Text>
          </View>

          {/* Stats pills */}
          <View style={styles.statsPillRow}>
            <View style={styles.statsPill}>
              <Text style={styles.statsPillText}>{nanny.yearsExperience} yrs exp</Text>
            </View>
            <View style={styles.statsPill}>
              <Text style={styles.statsPillText}>Age {nanny.age}</Text>
            </View>
            <View style={styles.statsPill}>
              <Text style={styles.statsPillText}>Ages {nanny.ageRange}</Text>
            </View>
          </View>

          {/* Quick action buttons */}
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7}>
              <Ionicons name="chatbubble-outline" size={18} color={colors.primaryDark} />
              <Text style={styles.actionBtnText}>Message</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7}>
              <Ionicons name="calendar-outline" size={18} color={colors.primaryDark} />
              <Text style={styles.actionBtnText}>Availability</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── About Section ── */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionHeading}>ABOUT</Text>
          <Text
            style={styles.aboutText}
            numberOfLines={aboutExpanded ? undefined : 3}
          >
            {nanny.about}
          </Text>
          {!aboutExpanded && (
            <TouchableOpacity
              onPress={() => setAboutExpanded(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.readMore}>Read more</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Certifications ── */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionHeading}>CERTIFICATIONS</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.certsContent}
            style={styles.certsScroll}
          >
            {nanny.certifications.map((cert) => (
              <View key={cert.id} style={styles.certPill}>
                <Ionicons name={cert.icon} size={14} color={colors.textTertiary} />
                <Text style={styles.certPillText}>{cert.label}</Text>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* ── Trust Bar ── */}
        <TouchableOpacity style={styles.trustBar} activeOpacity={0.7}>
          <View style={styles.trustAvatars}>
            <Image source={{ uri: IMG_AVATAR_1 }} style={[styles.trustAvatar, styles.trustAvatar1]} />
            <Image source={{ uri: IMG_AVATAR_2 }} style={[styles.trustAvatar, styles.trustAvatar2]} />
            <Image source={{ uri: IMG_AVATAR_3 }} style={[styles.trustAvatar, styles.trustAvatar3]} />
          </View>
          <Text style={styles.trustText}>
            {nanny.connectionsCount} connections hired {nanny.name.split(' ')[0]}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        </TouchableOpacity>

        {/* ── Reviews Section ── */}
        <View style={styles.sectionContainer}>
          <View style={styles.reviewsHeader}>
            <Text style={styles.sectionHeading}>REVIEWS</Text>
            <TouchableOpacity activeOpacity={0.7}>
              <Text style={styles.viewAllLink}>View all</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.reviewsList}>
            {reviews.map((review) => (
              <Card key={review.id} shadow="sm" padding={20} radius={borderRadius.xl} style={styles.reviewCard}>
                <View style={styles.reviewAuthorRow}>
                  <Avatar fallbackInitial={review.authorInitial} size="md" />
                  <View style={styles.reviewAuthorInfo}>
                    <Text style={styles.reviewAuthorName}>{review.authorName}</Text>
                    <Text style={styles.reviewTimeAgo}>{review.timeAgo}</Text>
                  </View>
                </View>
                <View style={styles.reviewStars}>{renderStars(review.rating)}</View>
                <Text style={styles.reviewText}>{review.text}</Text>
              </Card>
            ))}
          </View>
        </View>

        {/* Spacer for sticky footer */}
        <View style={{ height: FOOTER_HEIGHT }} />
      </ScrollView>

      {/* ── Top Navigation Buttons ── */}
      <View style={styles.topNav} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.topNavBtn}
          onPress={handleBack}
          activeOpacity={0.8}
        >
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.topNavRight}>
          <TouchableOpacity style={styles.topNavBtn} activeOpacity={0.8}>
            <Ionicons name="heart-outline" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.topNavBtn} activeOpacity={0.8}>
            <Ionicons name="share-outline" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Sticky Footer ── */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.bookButton}
          activeOpacity={0.85}
          onPress={() =>
            router.push({
              pathname: '/(parent)/book/booking-step-1',
              params: { nannyId: nanny.id },
            } as any)
          }
        >
          <Text style={styles.bookButtonText}>
            Book {nanny.name.split(' ')[0]} — ${nanny.hourlyRate}/hr
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

