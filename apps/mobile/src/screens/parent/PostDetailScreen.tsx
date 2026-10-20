import React, { useMemo, useRef, useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator, Linking } from 'react-native';
import { Text, TextInput } from '@mobile/components/ui/text';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { normalizePhone, whatsappLink } from '@nanny-app/shared';
import type { CommunityPostType } from '@nanny-app/shared';

import CommentThread from '@mobile/components/community/CommentThread';
import PostCard from '@mobile/components/community/PostCard';
import { Header, KeyboardAvoidingView, ScreenContainer } from '@mobile/components/ui';
import {
  useComments,
  useCommunityPost,
  useCreateComment,
  useToggleCommentLike,
  useToggleEventRsvp,
  useTogglePostLike,
} from '@mobile/hooks/useCommunity';
import { useContactSeller } from '@mobile/hooks/useMessaging';
import { useGuestGate } from '@mobile/hooks/useGuestGate';
import { useBottomBarPadding } from '@mobile/hooks/useBottomInset';
import { useKeyboardVisible } from '@mobile/hooks/useKeyboardVisible';
import { useUserProfileStore } from '@mobile/store/userProfileStore';
import { colors, spacing } from '@mobile/theme';
import { styles } from './styles/post-detail-screen.styles';

const HEADER_TITLES: Record<CommunityPostType, string> = {
  qa: 'Question',
  marketplace: 'Listing',
  event: 'Event',
};

/** The server's limit (CreateCommentSchema), so a long answer stops at the box, not at a 400. */
const COMMENT_MAX_LENGTH = 1000;

export default function PostDetailScreen() {
  const router = useRouter();
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const [replyText, setReplyText] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: number; name: string } | undefined>();
  const inputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);
  const keyboardVisible = useKeyboardVisible();
  // The keyboard covers the system bar, so the composer only clears it while
  // the keyboard is down.
  const restingPadding = useBottomBarPadding(spacing.md);
  const composerPadding = keyboardVisible ? spacing.sm : restingPadding;

  const { data: post, isLoading: postLoading } = useCommunityPost(Number(postId));
  const {
    data: commentsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: commentsLoading,
  } = useComments(Number(postId));

  const currentUserId = useUserProfileStore((s) => s.profile?.id);
  const { gate } = useGuestGate();
  const toggleLike = useTogglePostLike();
  const toggleRsvp = useToggleEventRsvp();
  const toggleCommentLike = useToggleCommentLike();
  const createComment = useCreateComment();
  const contactSeller = useContactSeller();

  // An official listing has no seller inbox — buyers reach the platform on the
  // number the admin put on the listing instead of starting a chat.
  const isOfficialListing = post?.type === 'marketplace' && post.isOfficial;
  const canMessageSeller =
    post?.type === 'marketplace' && !post.isOfficial && post.author.id !== currentUserId;
  const officialContactPhone = isOfficialListing ? post?.contactPhone ?? null : null;

  const comments = useMemo(
    () => commentsData?.pages.flatMap((page) => page.comments) ?? [],
    [commentsData],
  );

  const handleReplyPress = (commentId: number, authorName: string) => {
    setReplyTo({ id: commentId, name: authorName });
    inputRef.current?.focus();
  };

  const canSend = replyText.trim().length > 0 && !createComment.isPending;

  const handleSubmitComment = async () => {
    if (!postId || !replyText.trim()) return;
    await createComment.mutateAsync({
      postId: Number(postId),
      body: { body: replyText.trim(), parentCommentId: replyTo?.id },
    });
    setReplyText('');
    // A new top-level comment lands at the end of the thread — show it.
    if (!replyTo) setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300);
    setReplyTo(undefined);
  };

  const handleContactOfficial = async () => {
    if (!officialContactPhone) return;
    const waUrl = whatsappLink(officialContactPhone);
    const canOpenWhatsapp = await Linking.canOpenURL(waUrl);
    await Linking.openURL(
      canOpenWhatsapp ? waUrl : `tel:${normalizePhone(officialContactPhone)}`,
    );
  };

  const handleMessageSeller = async () => {
    if (!postId || contactSeller.isPending) return;
    const result = await contactSeller.mutateAsync(Number(postId));
    router.push({
      pathname: '/(parent)/chat/messaging',
      params: { conversationId: result.conversation.id },
    });
  };

  if (postLoading || !post) {
    return (
      <ScreenContainer useSafeArea={false}>
        <Header title="" style={styles.header} />
        <View style={styles.centered}>
          {postLoading ? (
            <ActivityIndicator color={colors.primaryDark} />
          ) : (
            <>
              <Ionicons name="document-text-outline" size={40} color={colors.textPlaceholder} />
              <Text style={styles.notFoundTitle}>Post not found</Text>
              <Text style={styles.notFoundBody}>It may have been removed by its author.</Text>
            </>
          )}
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer useSafeArea={false}>
      {/* The header stays outside the keyboard-avoiding view: only the thread
          and the composer make room for the keyboard. */}
      <Header title={HEADER_TITLES[post.type]} style={styles.header} />

      <KeyboardAvoidingView style={styles.body}>
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <PostCard
            post={post}
            onLikePress={gate(
              () => toggleLike.mutate(post.id),
              'Create your free account to like posts.',
            )}
            onCommentPress={gate(
              () => inputRef.current?.focus(),
              'Create your free account to join the conversation.',
            )}
            onRsvpPress={gate(
              () => toggleRsvp.mutate(post.id),
              'Create your free account to RSVP to events.',
            )}
          />

          {officialContactPhone ? (
            <Pressable
              style={styles.messageSellerButton}
              onPress={gate(
                handleContactOfficial,
                'Create your free account to contact NannyNow about this item.',
              )}
            >
              <Ionicons name="logo-whatsapp" size={18} color={colors.white} />
              <Text style={styles.messageSellerButtonText}>Contact NannyNow</Text>
            </Pressable>
          ) : null}

          {canMessageSeller ? (
            <Pressable
              style={styles.messageSellerButton}
              onPress={gate(handleMessageSeller, 'Create your free account to message sellers.')}
              disabled={contactSeller.isPending}
            >
              <Ionicons name="chatbubble-outline" size={18} color={colors.white} />
              <Text style={styles.messageSellerButtonText}>
                {contactSeller.isPending ? 'Opening chat…' : 'Message seller'}
              </Text>
            </Pressable>
          ) : null}

          <View style={styles.commentsSection}>
            <Text style={styles.commentsTitle}>Comments ({post.commentCount})</Text>
            {commentsLoading ? (
              <ActivityIndicator color={colors.primaryDark} />
            ) : comments.length === 0 ? (
              <View style={styles.noComments}>
                <Ionicons name="chatbubbles-outline" size={28} color={colors.textPlaceholder} />
                <Text style={styles.noCommentsText}>
                  No comments yet. Start the conversation.
                </Text>
              </View>
            ) : (
              comments.map((comment) => (
                <CommentThread
                  key={comment.id}
                  comment={comment}
                  onLikePress={gate(
                    (commentId: number) =>
                      toggleCommentLike.mutate({ commentId, postId: post.id }),
                    'Create your free account to like comments.',
                  )}
                  onReplyPress={handleReplyPress}
                />
              ))
            )}
            {hasNextPage && (
              <Pressable
                style={styles.loadMorePressable}
                onPress={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                <Text style={styles.loadMoreText}>
                  {isFetchingNextPage ? 'Loading…' : 'Load more comments'}
                </Text>
              </Pressable>
            )}
          </View>
        </ScrollView>

        <View style={[styles.composer, { paddingBottom: composerPadding }]}>
          {replyTo ? (
            <View style={styles.replyBanner}>
              <Ionicons name="return-down-forward" size={14} color={colors.textMuted} />
              <Text style={styles.replyBannerText} numberOfLines={1}>
                Replying to <Text style={styles.replyBannerName}>{replyTo.name}</Text>
              </Text>
              <Pressable
                onPress={() => setReplyTo(undefined)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Cancel reply"
              >
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </Pressable>
            </View>
          ) : null}
          <View style={styles.composerRow}>
            <TextInput
              ref={inputRef}
              testID="postDetail.comment"
              style={styles.composerInput}
              placeholder={replyTo ? 'Write a reply…' : 'Add a comment…'}
              placeholderTextColor={colors.textPlaceholder}
              value={replyText}
              onChangeText={setReplyText}
              multiline
              maxLength={COMMENT_MAX_LENGTH}
              textAlignVertical="center"
            />
            <Pressable
              testID="postDetail.commentSend"
              style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel={replyTo ? 'Send reply' : 'Send comment'}
              onPress={gate(
                handleSubmitComment,
                'Create your free account to join the conversation.',
              )}
            >
              {createComment.isPending ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Ionicons name="arrow-up" size={20} color={colors.white} />
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
