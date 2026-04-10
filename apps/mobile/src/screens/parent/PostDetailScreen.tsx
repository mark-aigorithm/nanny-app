import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { colors } from '@mobile/theme';
import type { Comment, PostTag } from '@mobile/types';
import { MOCK_POSTS, MOCK_COMMENTS } from '@mobile/mocks';
import { styles } from './styles/post-detail-screen.styles';

// ─── Tag style config ─────────────────────────────────────────────────────────

const TAG_STYLES: Record<PostTag, { bg: string; text: string }> = {
  'General advice': { bg: colors.taupe, text: colors.primary },
  Marketplace: { bg: colors.tintYellow, text: colors.goldWarm },
  Event: { bg: colors.successLight, text: colors.successDark },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function PostDetailScreen() {
  const router = useRouter();
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const [replyText, setReplyText] = useState('');
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);

  const post = MOCK_POSTS.find((p) => p.id === postId) ?? MOCK_POSTS[0];
  const comments = MOCK_COMMENTS;

  // Initialise like count from post data
  React.useEffect(() => {
    setLikeCount(post.likes);
  }, [post.likes]);

  const handleLikeToggle = () => {
    setLiked((prev) => !prev);
    setLikeCount((prev) => (liked ? prev - 1 : prev + 1));
  };

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderPostContent = () => {
    switch (post.type) {
      case 'advice':
        return <Text style={styles.postBody}>{post.body}</Text>;

      case 'marketplace':
        return (
          <>
            <View style={styles.postImageContainer}>
              <Image
                source={{ uri: post.image }}
                style={styles.postImage}
                resizeMode="cover"
              />
              <View style={styles.priceBadge}>
                <Text style={styles.priceBadgeText}>{post.price}</Text>
              </View>
            </View>
            <Text style={styles.postTitle}>{post.title}</Text>
          </>
        );

      case 'event':
        return (
          <>
            <Text style={styles.postTitle}>{post.title}</Text>
            <View style={styles.eventDetailRow}>
              <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
              <Text style={styles.eventDetailText}>{post.date}</Text>
            </View>
            <View style={styles.eventDetailRow}>
              <Ionicons name="location-outline" size={16} color={colors.textMuted} />
              <Text style={styles.eventDetailText}>{post.location}</Text>
            </View>
            <View style={styles.attendeesRow}>
              <View style={styles.stackedAvatars}>
                {post.attendeeAvatars.map((uri, index) => (
                  <Image
                    key={index}
                    source={{ uri }}
                    style={[
                      styles.attendeeAvatar,
                      { marginLeft: index === 0 ? 0 : -10 },
                    ]}
                  />
                ))}
              </View>
              <Text style={styles.attendeeCount}>+{post.attendeeCount} going</Text>
            </View>
          </>
        );
    }
  };

  const renderComment = (comment: Comment) => (
    <View key={comment.id}>
      <View style={styles.commentCard}>
        <View style={styles.commentAuthorRow}>
          <Image source={{ uri: comment.author.avatar }} style={styles.commentAvatar} />
          <Text style={styles.commentAuthorName}>{comment.author.name}</Text>
          <Text style={styles.commentTime}>{comment.author.timeAgo}</Text>
        </View>
        <Text style={styles.commentBody}>{comment.text}</Text>
        <View style={styles.commentActions}>
          <Pressable style={styles.commentAction}>
            <Ionicons name="heart-outline" size={14} color={colors.textMuted} />
            <Text style={styles.commentActionText}>{comment.likes}</Text>
          </Pressable>
          <Pressable style={styles.commentAction}>
            <Text style={styles.commentActionText}>Reply</Text>
          </Pressable>
        </View>

        {/* Replies */}
        {comment.replies.length > 0 && (
          <View style={styles.repliesContainer}>
            {comment.replies.map((reply) => (
              <View key={reply.id} style={styles.replyCard}>
                <View style={styles.replyAuthorRow}>
                  <Image source={{ uri: reply.author.avatar }} style={styles.replyAvatar} />
                  <Text style={styles.replyAuthorName}>{reply.author.name}</Text>
                  <Text style={styles.replyTime}>{reply.author.timeAgo}</Text>
                </View>
                <Text style={styles.replyBody}>{reply.text}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
      <View style={styles.commentDivider} />
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color={colors.textDark} />
          </Pressable>
          <Text style={styles.headerTitle}>Post</Text>
        </View>
        <View style={styles.headerRight}>
          <Pressable hitSlop={8}>
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.textDark} />
          </Pressable>
        </View>
      </View>

      {/* Scrollable content */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Full post */}
        <View style={styles.postCard}>
          {/* Author row */}
          <View style={styles.authorRow}>
            <Image source={{ uri: post.author.avatar }} style={styles.avatar} />
            <View style={styles.authorInfo}>
              <Text style={styles.authorName}>{post.author.name}</Text>
              <Text style={styles.authorTime}>{post.author.timeAgo}</Text>
            </View>
            <View style={[styles.tagPill, { backgroundColor: TAG_STYLES[post.tag].bg }]}>
              <Text style={[styles.tagPillText, { color: TAG_STYLES[post.tag].text }]}>
                {post.tag}
              </Text>
            </View>
          </View>

          {/* Post content */}
          {renderPostContent()}

          {/* Action bar */}
          <View style={styles.actionBar}>
            <Pressable
              style={liked ? styles.actionItemActive : styles.actionItem}
              onPress={handleLikeToggle}
            >
              <Ionicons
                name={liked ? 'heart' : 'heart-outline'}
                size={17}
                color={liked ? colors.error : colors.textMuted}
              />
              <Text style={liked ? styles.actionCountActive : styles.actionCount}>
                {likeCount}
              </Text>
            </Pressable>
            <Pressable style={styles.actionItem}>
              <Ionicons name="chatbubble-outline" size={17} color={colors.textMuted} />
              <Text style={styles.actionCount}>{comments.length}</Text>
            </Pressable>
            <Pressable style={styles.actionItem}>
              <Ionicons name="share-social-outline" size={17} color={colors.textMuted} />
              <Text style={styles.actionCount}>Share</Text>
            </Pressable>
          </View>
        </View>

        {/* Comments thread */}
        <View style={styles.commentsSection}>
          <Text style={styles.commentsTitle}>
            Comments ({comments.length})
          </Text>
          {comments.map(renderComment)}
        </View>
      </ScrollView>

      {/* Sticky reply input bar */}
      <View style={styles.replyInputBar}>
        <View style={styles.replyAvatar2} />
        <TextInput
          style={styles.replyInput}
          placeholder="Write a comment..."
          placeholderTextColor={colors.textPlaceholder}
          value={replyText}
          onChangeText={setReplyText}
        />
        <Pressable
          style={[
            styles.sendButton,
            !replyText.trim() && styles.sendButtonDisabled,
          ]}
          disabled={!replyText.trim()}
        >
          <Ionicons name="send" size={16} color={colors.white} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
