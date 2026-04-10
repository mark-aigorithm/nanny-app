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
import { IMG_AVATAR_REVIEWER_1, IMG_AVATAR_REVIEWER_2, IMG_AVATAR_REVIEWER_3 } from '@mobile/mocks/images';
import { MOCK_NANNY_PROFILE } from '@mobile/mocks/nanny-profile';
import { MOCK_REVIEWS } from '@mobile/mocks/reviews';
import { styles } from './styles/nanny-profile-screen.styles';

const FOOTER_HEIGHT = 100;

export default function NannyProfileScreen() {
  const router = useRouter();
  // TODO: Pass id to useNannyProfile(id) once React Query hook is ready
  useLocalSearchParams<{ id: string }>();
  const [aboutExpanded, setAboutExpanded] = useState(false);

  // TODO: Replace with useNannyProfile(id) React Query hook
  const nanny = MOCK_NANNY_PROFILE;
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
                  params: { nannyId: nanny.id },
                } as never)
              }
            >
              <Ionicons name="calendar-outline" size={18} color={colors.primaryDark} />
              <Text style={styles.actionBtnText}>Availability</Text>
            </TouchableOpacity>
          </View>

          {/* More actions */}
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7}
              onPress={() => router.push('/(parent)/nanny/nanny-care-log' as never)}
            >
              <Ionicons name="document-text-outline" size={18} color={colors.primaryDark} />
              <Text style={styles.actionBtnText}>Care Log</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7}
              onPress={() => router.push('/(parent)/nanny/care-activity-feed' as never)}
            >
              <Ionicons name="pulse-outline" size={18} color={colors.primaryDark} />
              <Text style={styles.actionBtnText}>Activity</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7}
              onPress={() => router.push('/(parent)/nanny/live-video-monitor' as never)}
            >
              <Ionicons name="videocam-outline" size={18} color={colors.primaryDark} />
              <Text style={styles.actionBtnText}>Live View</Text>
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
            <Image source={{ uri: IMG_AVATAR_REVIEWER_1 }} style={[styles.trustAvatar, styles.trustAvatar1]} />
            <Image source={{ uri: IMG_AVATAR_REVIEWER_2 }} style={[styles.trustAvatar, styles.trustAvatar2]} />
            <Image source={{ uri: IMG_AVATAR_REVIEWER_3 }} style={[styles.trustAvatar, styles.trustAvatar3]} />
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
              pathname: '/(parent)/book/booking-date-picker',
              params: { nannyId: nanny.id },
            })
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

