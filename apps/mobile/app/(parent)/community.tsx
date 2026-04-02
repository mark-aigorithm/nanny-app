import { ScrollView, View, Text, Pressable, Image, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Badge, Chip, Fab } from '@mobile/components';
import { colors, fontSizes, radii, shadows, spacing } from '@mobile/lib/theme';

const FILTERS = ['All Posts', 'Advice', 'Playgroups', 'Marketplace'];

const POSTS = [
  {
    id: '1', user: 'Jessica K.', tag: 'General Advice', tagColor: colors.communityPink,
    time: '2h ago',
    text: 'Does anyone have a recommendation for a pediatric dentist in Park Slope?',
    likes: 24, comments: 8, type: 'advice',
  },
  {
    id: '2', user: 'Maria T.', tag: 'Marketplace', tagColor: '#8B5CF6',
    time: '4h ago',
    text: 'Selling barely-used Uppababy Cruz stroller',
    likes: 6, comments: 3, type: 'marketplace', price: '$320',
  },
  {
    id: '3', user: 'Sophie L.', tag: 'Event', tagColor: colors.primary,
    time: '1d ago',
    text: 'Saturday Storytime @ Prospect Park 🌳',
    likes: 31, comments: 5, type: 'event',
    eventDate: 'Apr 19, 10 AM', eventLocation: 'Prospect Park', attendees: 14,
  },
];

export default function CommunityScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
          <Text style={styles.headerTitle}>Community</Text>
          <View style={styles.onlineBadge}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineText}>42 moms online</Text>
          </View>
          <View style={{ flex: 1 }} />
          <Text style={styles.iconBtn}>🔍</Text>
          <Text style={styles.iconBtn}>🔔</Text>
        </View>

        {/* Filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {FILTERS.map((f, i) => (
            <Chip key={f} label={f} active={i === 0} activeColor={colors.communityPink} />
          ))}
        </ScrollView>

        {/* Posts */}
        {POSTS.map((post) => (
          <View key={post.id} style={styles.postCard}>
            {/* Post header */}
            <View style={styles.postHeader}>
              <Avatar name={post.user} size={40} />
              <View style={styles.postMeta}>
                <Text style={styles.postUser}>{post.user}</Text>
                <View style={styles.postTagRow}>
                  <Badge label={post.tag} bgColor={post.tagColor + '20'} color={post.tagColor} size="sm" />
                  <Text style={styles.postTime}>{post.time}</Text>
                </View>
              </View>
            </View>

            <Text style={styles.postText}>{post.text}</Text>

            {/* Marketplace photo placeholder */}
            {post.type === 'marketplace' && (
              <View style={styles.productPhoto}>
                <Text style={styles.productEmoji}>🛒</Text>
                <View style={styles.priceBadge}>
                  <Text style={styles.priceText}>{post.price}</Text>
                </View>
              </View>
            )}

            {/* Event details */}
            {post.type === 'event' && (
              <View style={styles.eventDetails}>
                <Text style={styles.eventMeta}>📅 {post.eventDate}</Text>
                <Text style={styles.eventMeta}>📍 {post.eventLocation}</Text>
                <View style={styles.attendeesRow}>
                  <View style={styles.attendeeAvatars}>
                    <Avatar name="A" size={24} />
                    <Avatar name="B" size={24} />
                    <Avatar name="C" size={24} />
                  </View>
                  <Text style={styles.attendeeCount}>+{post.attendees} going</Text>
                  <Pressable style={styles.rsvpBtn}>
                    <Text style={styles.rsvpText}>RSVP</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Engagement */}
            <View style={styles.engagementRow}>
              <Text style={styles.engagementItem}>👍 {post.likes}</Text>
              <Text style={styles.engagementItem}>💬 {post.comments}</Text>
              <Text style={styles.engagementItem}>↗ Share</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <Fab color={colors.communityPink} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md, gap: spacing.sm,
  },
  headerTitle: { fontSize: fontSizes.xl, fontWeight: '700', color: colors.textPrimary },
  onlineBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: spacing.sm },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  onlineText: { fontSize: fontSizes.xs, color: colors.success, fontWeight: '600' },
  iconBtn: { fontSize: 22, marginLeft: spacing.sm },

  filterRow: { paddingHorizontal: spacing.lg, marginBottom: spacing.lg },

  postCard: {
    backgroundColor: colors.white, marginHorizontal: spacing.lg,
    borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.md,
    ...shadows.sm,
  },
  postHeader: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  postMeta: { flex: 1 },
  postUser: { fontSize: fontSizes.base, fontWeight: '700', color: colors.textPrimary },
  postTagRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4 },
  postTime: { fontSize: fontSizes.xs, color: colors.textMuted },
  postText: { fontSize: fontSizes.base, color: colors.textPrimary, lineHeight: 22, marginBottom: spacing.md },

  productPhoto: {
    height: 140, backgroundColor: colors.surface, borderRadius: radii.md,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md,
    position: 'relative',
  },
  productEmoji: { fontSize: 40, opacity: 0.4 },
  priceBadge: {
    position: 'absolute', bottom: spacing.sm, right: spacing.sm,
    backgroundColor: colors.success, borderRadius: radii.sm,
    paddingHorizontal: spacing.sm, paddingVertical: 2,
  },
  priceText: { color: colors.white, fontWeight: '700', fontSize: fontSizes.sm },

  eventDetails: { marginBottom: spacing.md },
  eventMeta: { fontSize: fontSizes.sm, color: colors.textSecondary, marginBottom: 4 },
  attendeesRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  attendeeAvatars: { flexDirection: 'row' },
  attendeeCount: { fontSize: fontSizes.sm, color: colors.textSecondary, flex: 1 },
  rsvpBtn: {
    backgroundColor: colors.primary, borderRadius: radii.full,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.xs,
  },
  rsvpText: { color: colors.white, fontWeight: '700', fontSize: fontSizes.sm },

  engagementRow: { flexDirection: 'row', gap: spacing.xl },
  engagementItem: { fontSize: fontSizes.sm, color: colors.textSecondary },
});
