import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import BottomNav from '@mobile/components/BottomNav';
import { colors } from '@mobile/theme';
import { styles } from './styles/events-meetups-screen.styles';

// ASSUMPTION: Images sourced from Figma CDN — expire in 7 days.
// Replace with S3/CDN URLs or bundled assets before production.
const IMG_USER_PROFILE = 'https://www.figma.com/api/mcp/asset/17cd0eca-d5d2-4d82-8b50-1e3a50ebc144';
const IMG_EVENT_STORYTIME = 'https://www.figma.com/api/mcp/asset/e5e2492a-ec18-4a84-b3ca-85fde8330bf9';
const IMG_EVENT_SIGN_LANGUAGE = 'https://www.figma.com/api/mcp/asset/8a071716-147b-4521-91d8-f02ffc431d69';
const IMG_AVATAR_1 = 'https://www.figma.com/api/mcp/asset/b7f91406-93dc-4d30-860a-dc6e88a9fc5a';
const IMG_AVATAR_2 = 'https://www.figma.com/api/mcp/asset/6ba72ba9-1c3f-4232-a5a2-33333bc60cbc';
const IMG_AVATAR_3 = 'https://www.figma.com/api/mcp/asset/d79b72d7-50fc-40da-9658-91cf8aa579f8';

// ASSUMPTION: Event data will come from GET /events?location=brooklyn-ny.
// Using hardcoded mock data until the backend service is ready.

type FilterChip = 'All events' | 'Playdates' | 'Educational' | 'Workshops';

const FILTER_CHIPS: FilterChip[] = ['All events', 'Playdates', 'Educational', 'Workshops'];

interface Attendee {
  id: string;
  image: string;
}

interface EventData {
  id: string;
  title: string;
  month: string;
  day: string;
  image: string;
  ageRange: string;
  location: string;
  attendees: Attendee[];
  goingCount: string;
  spotsLeft?: string;
  showJoinButton?: boolean;
}

const MOCK_EVENTS: EventData[] = [
  {
    id: '1',
    title: 'Saturday Storytime & Playdate',
    month: 'APR',
    day: '19',
    image: IMG_EVENT_STORYTIME,
    ageRange: 'Ages 0-3',
    location: 'Prospect Park',
    attendees: [
      { id: '1', image: IMG_AVATAR_1 },
      { id: '2', image: IMG_AVATAR_2 },
      { id: '3', image: IMG_AVATAR_3 },
    ],
    goingCount: '+14 going',
  },
  {
    id: '2',
    title: 'Baby Sign Language Workshop',
    month: 'APR',
    day: '23',
    image: IMG_EVENT_SIGN_LANGUAGE,
    ageRange: 'Ages 6-18 months',
    location: 'Brooklyn Library',
    attendees: [
      { id: '1', image: IMG_AVATAR_1 },
      { id: '2', image: IMG_AVATAR_2 },
    ],
    goingCount: '8 going',
    spotsLeft: 'Only 2 spots left!',
    showJoinButton: true,
  },
];

export default function EventsMeetupsScreen() {
  const router = useRouter();
  const [activeChip, setActiveChip] = useState<FilterChip>('All events');

  return (
    <View style={styles.container}>
      {/* Header — fixed top */}
      <View style={styles.header}>
        <SafeAreaView>
          <View style={styles.headerInner}>
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.headerTitle}>NannyMom</Text>
            <View style={styles.headerRight}>
              <View style={styles.locationPill}>
                <Ionicons name="location" size={14} color={colors.textTertiary} />
                <Text style={styles.locationText}>Brooklyn, NY</Text>
              </View>
              <View style={styles.headerAvatarBorder}>
                <Image source={{ uri: IMG_USER_PROFILE }} style={styles.headerAvatar} />
              </View>
            </View>
          </View>
        </SafeAreaView>
      </View>

      {/* Scrollable content */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Section Header */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Events near you</Text>
          <Pressable hitSlop={8}>
            <Ionicons name="options-outline" size={22} color={colors.textTertiary} />
          </Pressable>
        </View>

        {/* Filter Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
          style={styles.chipsScroll}
        >
          {FILTER_CHIPS.map((chip) => {
            const isActive = chip === activeChip;
            return (
              <Pressable
                key={chip}
                style={[styles.chip, isActive ? styles.chipActive : styles.chipInactive]}
                onPress={() => setActiveChip(chip)}
              >
                <Text style={[styles.chipText, isActive ? styles.chipTextActive : styles.chipTextInactive]}>
                  {chip}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Event Cards */}
        <View style={styles.cardsContainer}>
          {MOCK_EVENTS.map((event) => (
            <Pressable key={event.id} style={styles.card}>
              {/* Hero Image */}
              <View style={styles.cardImageContainer}>
                <Image source={{ uri: event.image }} style={styles.cardImage} resizeMode="cover" />
                {/* Date Badge */}
                <View style={styles.dateBadge}>
                  <Text style={styles.dateBadgeMonth}>{event.month}</Text>
                  <Text style={styles.dateBadgeDay}>{event.day}</Text>
                </View>
                {/* Bookmark Icon */}
                <Pressable style={styles.bookmarkButton} hitSlop={8}>
                  <Ionicons name="bookmark-outline" size={18} color={colors.white} />
                </Pressable>
              </View>

              {/* Card Content */}
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>{event.title}</Text>

                {/* Tags Row */}
                <View style={styles.tagsRow}>
                  <View style={styles.tag}>
                    <Ionicons name="calendar" size={12} color={colors.textTertiary} />
                    <Text style={styles.tagText}>{event.ageRange}</Text>
                  </View>
                  <View style={styles.tag}>
                    <Ionicons name="location-outline" size={12} color={colors.textTertiary} />
                    <Text style={styles.tagText}>{event.location}</Text>
                  </View>
                </View>

                {/* Spots Left Badge */}
                {event.spotsLeft != null && (
                  <View style={styles.spotsLeftBadge}>
                    <Text style={styles.spotsLeftText}>{event.spotsLeft}</Text>
                  </View>
                )}

                {/* Attendee Row */}
                <View style={styles.attendeeRow}>
                  <View style={styles.avatarStack}>
                    {event.attendees.map((attendee, index) => (
                      <View
                        key={attendee.id}
                        style={[
                          styles.attendeeAvatarWrapper,
                          { marginLeft: index === 0 ? 0 : -8 },
                          { zIndex: event.attendees.length - index },
                        ]}
                      >
                        <Image source={{ uri: attendee.image }} style={styles.attendeeAvatar} />
                      </View>
                    ))}
                  </View>
                  <Text style={styles.goingText}>{event.goingCount}</Text>

                  {event.showJoinButton === true && (
                    <Pressable style={styles.joinButton}>
                      <Text style={styles.joinButtonText}>Join Now</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            </Pressable>
          ))}

          {/* Peeking Card */}
          <View style={styles.peekingCard} />
        </View>
      </ScrollView>

      {/* FAB */}
      <View style={styles.fabContainer}>
        <Pressable style={styles.fab}>
          <Ionicons name="add" size={24} color={colors.white} />
        </Pressable>
        <Text style={styles.fabLabel}>CREATE EVENT</Text>
      </View>

      <BottomNav activeTab="community" />
    </View>
  );
}

