import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import { colors, borderRadius } from '@mobile/theme';
import { Avatar, Card } from '@mobile/components/ui';
import { useNannyPublicProfile } from '@mobile/hooks/useNannies';
import { styles } from './styles/nanny-profile-screen.styles';
import type { ReviewSummary } from '@nanny-app/shared';

const CERT_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  'First Aid': 'medkit-outline',
  'CPR': 'heart-outline',
  'Background Check': 'shield-checkmark-outline',
  'ECE Degree': 'school-outline',
  'BG Check': 'shield-checkmark-outline',
  'Montessori': 'leaf-outline',
};

const FOOTER_HEIGHT = 100;

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

export default function NannyProfileScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [aboutExpanded, setAboutExpanded] = useState(false);

  const { data: nanny, isLoading } = useNannyPublicProfile(id);

  const handleBack = () => router.back();

  const renderStars = (rating: number) => {
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalf = rating - fullStars >= 0.5;
    for (let i = 0; i < fullStars; i++) {
      stars.push(<Ionicons key={`f-${i}`} name="star" size={14} color={colors.gold} />);
    }
    if (hasHalf) {
      stars.push(<Ionicons key="half" name="star-half" size={14} color={colors.gold} />);
    }
    return stars;
  };

  if (isLoading || !nanny) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const fullName = `${nanny.firstName} ${nanny.lastName}`;
  const ratingDisplay = nanny.reviewCount > 0 ? nanny.rating.toFixed(1) : 'New';

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
          {nanny.avatarUrl ? (
            <Image source={{ uri: nanny.avatarUrl }} style={styles.heroImage} resizeMode="cover" />
          ) : (
            <View style={[styles.heroImage, { backgroundColor: colors.primaryMuted, justifyContent: 'center', alignItems: 'center' }]}>
              <Ionicons name="person" size={80} color={colors.primary} />
            </View>
          )}
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
              <Text style={styles.nannyName}>{fullName}</Text>
            </View>
            <Text style={styles.hourlyRate}>
              {nanny.hourlyRate ? `$${nanny.hourlyRate}/hr` : 'Rate TBD'}
            </Text>
          </View>

          {/* Rating row */}
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={14} color={colors.gold} />
            <Text style={styles.ratingText}>{ratingDisplay}</Text>
            {nanny.reviewCount > 0 && (
              <>
                <Text style={styles.ratingDot}>{' \u2022 '}</Text>
                <Text style={styles.ratingMeta}>({nanny.reviewCount} reviews)</Text>
              </>
            )}
            {nanny.location && (
              <>
                <Text style={styles.ratingDot}>{' \u2022 '}</Text>
                <Text style={styles.ratingMeta}>{nanny.location}</Text>
              </>
            )}
          </View>

          {/* Stats pills */}
          <View style={styles.statsPillRow}>
            {nanny.yearsOfExperience !== null && (
              <View style={styles.statsPill}>
                <Text style={styles.statsPillText}>{nanny.yearsOfExperience} yrs exp</Text>
              </View>
            )}
            <View style={styles.statsPill}>
              <Text style={styles.statsPillText}>{nanny.availabilityType.replace('_', ' ')}</Text>
            </View>
            {nanny.ageRanges.length > 0 && (
              <View style={styles.statsPill}>
                <Text style={styles.statsPillText}>Ages {nanny.ageRanges.join(', ')}</Text>
              </View>
            )}
          </View>

          {/* Quick action buttons */}
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7}
              onPress={() => router.push('/(parent)/chat/messaging')}
            >
              <Ionicons name="chatbubble-outline" size={18} color={colors.primaryDark} />
              <Text style={styles.actionBtnText}>Message</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              activeOpacity={0.7}
              onPress={() =>
                router.push({
                  pathname: '/(parent)/nanny/nanny-availability',
                  params: {
                    nannyId: nanny.nannyProfileId,
                    nannyName: `${nanny.firstName} ${nanny.lastName}`,
                    nannyPhoto: nanny.avatarUrl ?? '',
                    nannyRate: String(nanny.hourlyRate ?? 0),
                  },
                } as never)
              }
            >
              <Ionicons name="calendar-outline" size={18} color={colors.primaryDark} />
              <Text style={styles.actionBtnText}>Availability</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── About Section ── */}
        {nanny.bio && (
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionHeading}>ABOUT</Text>
            <Text style={styles.aboutText} numberOfLines={aboutExpanded ? undefined : 3}>
              {nanny.bio}
            </Text>
            {!aboutExpanded && (
              <TouchableOpacity onPress={() => setAboutExpanded(true)} activeOpacity={0.7}>
                <Text style={styles.readMore}>Read more</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── Specialties ── */}
        {nanny.specialties && nanny.specialties.length > 0 && (
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionHeading}>SPECIALTIES</Text>
            <View style={styles.specialtiesRow}>
              {nanny.specialties.map((s, i) => (
                <View key={i} style={styles.specialtyPill}>
                  <Ionicons name="ribbon-outline" size={13} color={colors.primaryDark} />
                  <Text style={styles.specialtyPillText}>{s}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Certifications ── */}
        {nanny.certifications.length > 0 && (
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionHeading}>CERTIFICATIONS</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.certsContent}
              style={styles.certsScroll}
            >
              {nanny.certifications.map((cert, i) => (
                <View key={i} style={styles.certPill}>
                  <Ionicons
                    name={CERT_ICONS[cert] ?? 'checkmark-circle-outline'}
                    size={14}
                    color={colors.textTertiary}
                  />
                  <Text style={styles.certPillText}>{cert}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── Reviews Section ── */}
        {nanny.recentReviews.length > 0 && (
          <View style={styles.sectionContainer}>
            <View style={styles.reviewsHeader}>
              <Text style={styles.sectionHeading}>REVIEWS</Text>
            </View>
            <View style={styles.reviewsList}>
              {nanny.recentReviews.map((review) => (
                <ReviewCard key={review.id} review={review} renderStars={renderStars} />
              ))}
            </View>
          </View>
        )}

        <View style={{ height: FOOTER_HEIGHT }} />
      </ScrollView>

      {/* ── Top Navigation Buttons ── */}
      <View style={styles.topNav} pointerEvents="box-none">
        <TouchableOpacity style={styles.topNavBtn} onPress={handleBack} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.topNavRight}>
          <TouchableOpacity style={styles.topNavBtn} activeOpacity={0.8}>
            <Ionicons name="heart-outline" size={22} color={colors.textPrimary} />
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
              pathname: '/(parent)/book/booking-date-picker',
              params: {
                nannyId: nanny.nannyProfileId,
                nannyName: `${nanny.firstName} ${nanny.lastName}`,
                nannyPhoto: nanny.avatarUrl ?? '',
                nannyRate: String(nanny.hourlyRate ?? 0),
              },
            })
          }
        >
          <Text style={styles.bookButtonText}>
            Book {nanny.firstName} — {nanny.hourlyRate ? `$${nanny.hourlyRate}/hr` : 'Rate TBD'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── ReviewCard ───────────────────────────────────────────────────────────────

function ReviewCard({
  review,
  renderStars,
}: {
  review: ReviewSummary;
  renderStars: (r: number) => React.ReactNode[];
}) {
  const authorName = `${review.motherFirstName} ${review.motherLastName}`;
  const initial = review.motherFirstName[0] ?? '?';

  return (
    <Card shadow="sm" padding={20} radius={borderRadius.xl} style={styles.reviewCard}>
      <View style={styles.reviewAuthorRow}>
        {review.motherAvatarUrl ? (
          <Avatar uri={review.motherAvatarUrl} size="md" />
        ) : (
          <Avatar fallbackInitial={initial} size="md" />
        )}
        <View style={styles.reviewAuthorInfo}>
          <Text style={styles.reviewAuthorName}>{authorName}</Text>
          <Text style={styles.reviewTimeAgo}>{timeAgo(review.createdAt)}</Text>
        </View>
      </View>
      <View style={styles.reviewStars}>{renderStars(review.rating)}</View>
      {review.comment && <Text style={styles.reviewText}>{review.comment}</Text>}
    </Card>
  );
}
