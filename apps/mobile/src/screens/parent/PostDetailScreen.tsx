import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import CommentThread from '@mobile/components/community/CommentThread';
import PostCard from '@mobile/components/community/PostCard';
import {
  useComments,
  useCommunityPost,
  useCreateComment,
  useToggleCommentLike,
  useToggleEventRsvp,
  useTogglePostLike,
} from '@mobile/hooks/useCommunity';
import { useContactSeller } from '@mobile/hooks/useMessaging';
import { getCommunityReturnHref } from '@mobile/lib/communityUtils';
import { useUserProfileStore } from '@mobile/store/userProfileStore';
import { postDetailTheme, styles } from './styles/post-detail-screen.styles';

export default function PostDetailScreen() {
  const router = useRouter();
  const { postId, returnTo, filter } = useLocalSearchParams<{
    postId: string;
    returnTo?: string;
    filter?: string;
  }>();
  const [replyText, setReplyText] = useState('');
  const [replyToId, setReplyToId] = useState<string | undefined>();
  const inputRef = useRef<TextInput>(null);

  const { data: post, isLoading: postLoading } = useCommunityPost(postId);
  const {
    data: commentsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: commentsLoading,
  } = useComments(postId);

  const currentUserId = useUserProfileStore((s) => s.profile?.id);
  const toggleLike = useTogglePostLike();
  const toggleRsvp = useToggleEventRsvp();
  const toggleCommentLike = useToggleCommentLike();
  const createComment = useCreateComment();
  const contactSeller = useContactSeller();

  const canMessageSeller =
    post?.type === 'marketplace' && post.author.id !== currentUserId;

  const comments = useMemo(
    () => commentsData?.pages.flatMap((page) => page.comments) ?? [],
    [commentsData],
  );

  useEffect(() => {
    if (replyToId) {
      inputRef.current?.focus();
    }
  }, [replyToId]);

  const handleReplyPress = (commentId: string) => {
    setReplyToId(commentId);
    inputRef.current?.focus();
  };

  const exitPostDetail = () => {
    router.replace(getCommunityReturnHref({ returnTo, filter }) as never);
  };

  const handleSubmitComment = async () => {
    if (!postId || !replyText.trim()) return;
    await createComment.mutateAsync({
      postId,
      body: { body: replyText.trim(), parentCommentId: replyToId },
    });
    setReplyText('');
    setReplyToId(undefined);
  };

  const handleMessageSeller = async () => {
    if (!postId || contactSeller.isPending) return;
    const result = await contactSeller.mutateAsync(postId);
    router.push({
      pathname: '/(parent)/chat/messaging',
      params: { conversationId: result.conversation.id },
    });
  };

  if (postLoading || !post) {
    return (
      <View style={[styles.container, styles.centered]}>
        {!postLoading && (
          <Pressable onPress={exitPostDetail} style={styles.backButtonAbsolute} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color={postDetailTheme.iconDark} />
          </Pressable>
        )}
        {postLoading ? (
          <ActivityIndicator color={postDetailTheme.primary} />
        ) : (
          <Text style={styles.headerTitle}>Post not found</Text>
        )}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Pressable onPress={exitPostDetail} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color={postDetailTheme.iconDark} />
          </Pressable>
          <Text style={styles.headerTitle}>Post</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <PostCard
          post={post}
          onLikePress={() => toggleLike.mutate(post.id)}
          onRsvpPress={() => toggleRsvp.mutate(post.id)}
        />

        {canMessageSeller ? (
          <Pressable
            style={styles.messageSellerButton}
            onPress={handleMessageSeller}
            disabled={contactSeller.isPending}
          >
            <Ionicons name="chatbubble-outline" size={18} color={postDetailTheme.white} />
            <Text style={styles.messageSellerButtonText}>
              {contactSeller.isPending ? 'Opening chat…' : 'Message seller'}
            </Text>
          </Pressable>
        ) : null}

        <View style={styles.commentsSection}>
          <Text style={styles.commentsTitle}>Comments ({post.commentCount})</Text>
          {commentsLoading ? (
            <ActivityIndicator color={postDetailTheme.primary} />
          ) : (
            comments.map((comment) => (
              <CommentThread
                key={comment.id}
                comment={comment}
                onLikePress={(commentId) =>
                  toggleCommentLike.mutate({ commentId, postId: post.id })
                }
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

      <SafeAreaView edges={['bottom']} style={styles.replyInputBar}>
        {replyToId ? (
          <Pressable onPress={() => setReplyToId(undefined)}>
            <Text style={styles.replyCancelText}>Replying — tap to cancel</Text>
          </Pressable>
        ) : null}
        <View style={styles.replyInputRow}>
          <TextInput
            ref={inputRef}
            style={[styles.replyInput, styles.replyInputFlex]}
            placeholder={replyToId ? 'Write a reply...' : 'Write a comment...'}
            placeholderTextColor={postDetailTheme.textPlaceholder}
            value={replyText}
            onChangeText={setReplyText}
          />
          <Pressable
            style={[styles.sendButton, !replyText.trim() && styles.sendButtonDisabled]}
            disabled={!replyText.trim() || createComment.isPending}
            onPress={handleSubmitComment}
          >
            <Ionicons name="send" size={16} color={postDetailTheme.white} />
          </Pressable>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
