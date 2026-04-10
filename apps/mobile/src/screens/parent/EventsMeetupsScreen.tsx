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
import { IMG_USER_PROFILE_COMMUNITY } from '@mobile/mocks/images';
import { MOCK_EVENTS } from '@mobile/mocks';
import { styles } from './styles/events-meetups-screen.styles';

type FilterChip = 'All events' | 'Playdates' | 'Educational' | 'Workshops';

const FILTER_CHIPS: FilterChip[] = ['All events', 'Playdates', 'Educational', 'Workshops'];

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
                <Image source={{ uri: IMG_USER_PROFILE_COMMUNITY }} style={styles.headerAvatar} />
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
        <Pressable style={styles.fab} onPress={() => router.push('/(parent)/create-event' as never)}>
          <Ionicons name="add" size={24} color={colors.white} />
        </Pressable>
        <Text style={styles.fabLabel}>CREATE EVENT</Text>
      </View>

      <BottomNav activeTab="community" />
    </View>
  );
}

