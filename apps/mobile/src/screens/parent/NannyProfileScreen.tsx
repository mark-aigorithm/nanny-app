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
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

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
// For native builds, add useFonts({ Manrope_400Regular, Manrope_600SemiBold, Manrope_700Bold })
// from @expo-google-fonts/manrope in the root _layout.tsx.

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const STATUS_BAR_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44;
const HERO_HEIGHT = 397;
const SUMMARY_TOP = 349;
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
        <Ionicons key={`star-${i}`} name="star" size={14} color="#f5a623" />
      );
    }
    if (hasHalf) {
      stars.push(
        <Ionicons key="star-half" name="star-half" size={14} color="#f5a623" />
      );
    }
    return stars;
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

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
            colors={['transparent', 'rgba(252,249,247,0.6)', '#fcf9f7']}
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
                <Ionicons name="checkmark-circle" size={20} color="#556251" />
              )}
            </View>
            <Text style={styles.hourlyRate}>${nanny.hourlyRate}/hr</Text>
          </View>

          {/* Rating row */}
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={14} color="#f5a623" />
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
              <Ionicons name="chatbubble-outline" size={18} color="#556251" />
              <Text style={styles.actionBtnText}>Message</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7}>
              <Ionicons name="calendar-outline" size={18} color="#556251" />
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
                <Ionicons name={cert.icon} size={14} color="#6b6158" />
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
          <Ionicons name="chevron-forward" size={16} color="#6b6158" />
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
              <View key={review.id} style={styles.reviewCard}>
                <View style={styles.reviewAuthorRow}>
                  <View style={styles.reviewAvatar}>
                    <Text style={styles.reviewAvatarText}>{review.authorInitial}</Text>
                  </View>
                  <View style={styles.reviewAuthorInfo}>
                    <Text style={styles.reviewAuthorName}>{review.authorName}</Text>
                    <Text style={styles.reviewTimeAgo}>{review.timeAgo}</Text>
                  </View>
                </View>
                <View style={styles.reviewStars}>{renderStars(review.rating)}</View>
                <Text style={styles.reviewText}>{review.text}</Text>
              </View>
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
          <Ionicons name="chevron-back" size={22} color="#1b1c1b" />
        </TouchableOpacity>
        <View style={styles.topNavRight}>
          <TouchableOpacity style={styles.topNavBtn} activeOpacity={0.8}>
            <Ionicons name="heart-outline" size={22} color="#1b1c1b" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.topNavBtn} activeOpacity={0.8}>
            <Ionicons name="share-outline" size={22} color="#1b1c1b" />
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fcf9f7',
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 0,
  },

  // Hero
  heroSection: {
    width: SCREEN_WIDTH,
    height: HERO_HEIGHT,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroGradient: {
    ...StyleSheet.absoluteFillObject,
  },

  // Top navigation
  topNav: {
    position: 'absolute',
    top: STATUS_BAR_HEIGHT + 8,
    left: 24,
    right: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  topNavBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  topNavRight: {
    flexDirection: 'row',
    gap: 12,
  },

  // Summary card
  summaryCard: {
    marginTop: -48,
    marginHorizontal: 24,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 5,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nameVerified: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  nannyName: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 20,
    lineHeight: 28,
    color: '#1b1c1b',
  },
  hourlyRate: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 18,
    lineHeight: 28,
    color: '#556251',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingText: {
    fontFamily: 'Manrope',
    fontWeight: '600',
    fontSize: 13,
    lineHeight: 20,
    color: '#6b6158',
    marginLeft: 4,
  },
  ratingDot: {
    fontFamily: 'Manrope',
    fontSize: 13,
    color: '#6b6158',
  },
  ratingMeta: {
    fontFamily: 'Manrope',
    fontWeight: '400',
    fontSize: 13,
    lineHeight: 20,
    color: '#6b6158',
  },
  statsPillRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statsPill: {
    backgroundColor: '#ebddd2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
  },
  statsPillText: {
    fontFamily: 'Manrope',
    fontWeight: '600',
    fontSize: 12,
    lineHeight: 16,
    color: '#6b6158',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#556251',
  },
  actionBtnText: {
    fontFamily: 'Manrope',
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 20,
    color: '#556251',
  },

  // About
  sectionContainer: {
    paddingHorizontal: 24,
    marginTop: 28,
  },
  sectionHeading: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.7,
    color: '#6b6158',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  aboutText: {
    fontFamily: 'Manrope',
    fontWeight: '400',
    fontSize: 16,
    lineHeight: 26,
    color: '#444842',
  },
  readMore: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 14,
    lineHeight: 20,
    color: '#556251',
    marginTop: 8,
  },

  // Certifications
  certsScroll: {
    marginHorizontal: -24,
  },
  certsContent: {
    paddingHorizontal: 24,
    gap: 8,
  },
  certPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ebddd2',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 9999,
  },
  certPillText: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 12,
    lineHeight: 16,
    color: '#6b6158',
  },

  // Trust bar
  trustBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(235,221,210,0.6)',
    borderRadius: 16,
    marginHorizontal: 24,
    marginTop: 28,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  trustAvatars: {
    width: 72,
    height: 32,
    marginRight: 12,
  },
  trustAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#ffffff',
    position: 'absolute',
    top: 0,
    backgroundColor: '#eee0d5',
  },
  trustAvatar1: {
    left: 0,
    zIndex: 3,
  },
  trustAvatar2: {
    left: 20,
    zIndex: 2,
  },
  trustAvatar3: {
    left: 40,
    zIndex: 1,
  },
  trustText: {
    flex: 1,
    fontFamily: 'Manrope',
    fontWeight: '600',
    fontSize: 13,
    lineHeight: 18,
    color: '#6b6158',
  },

  // Reviews
  reviewsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 0,
  },
  viewAllLink: {
    fontFamily: 'Manrope',
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 20,
    color: '#556251',
  },
  reviewsList: {
    gap: 16,
  },
  reviewCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  reviewAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  reviewAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#eee0d5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewAvatarText: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 16,
    color: '#6b6158',
  },
  reviewAuthorInfo: {
    flex: 1,
    gap: 2,
  },
  reviewAuthorName: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 14,
    lineHeight: 20,
    color: '#1b1c1b',
  },
  reviewTimeAgo: {
    fontFamily: 'Manrope',
    fontWeight: '400',
    fontSize: 12,
    lineHeight: 16,
    color: '#6b6158',
  },
  reviewStars: {
    flexDirection: 'row',
    gap: 2,
  },
  reviewText: {
    fontFamily: 'Manrope',
    fontWeight: '400',
    fontSize: 14,
    lineHeight: 22,
    color: '#444842',
  },

  // Sticky footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(252,249,247,0.95)',
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  bookButton: {
    backgroundColor: '#556251',
    borderRadius: 24,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  bookButtonText: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 18,
    lineHeight: 24,
    color: '#ffffff',
  },
});
