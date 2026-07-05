import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import type { ConversationResponse } from '@nanny-app/shared';
import { useRouter } from 'expo-router';

import BottomNav from '@mobile/components/BottomNav';
import ParentTabHeader from '@mobile/components/ParentTabHeader';
import ParentTabSearchStrip from '@mobile/components/ParentTabSearchStrip';
import { useConversations, useUnreadMessageCount } from '@mobile/hooks/useMessaging';
import { formatAuthorName, formatPrice, formatTimeAgo } from '@mobile/lib/communityUtils';
import { resolveImageUri } from '@mobile/lib/imageUri';
import { colors } from '@mobile/theme';
import { styles } from './styles/messages-screen.styles';

function ConversationItem({
  conversation,
  onPress,
}: {
  conversation: ConversationResponse;
  onPress: (id: string) => void;
}) {
  const participantName = formatAuthorName(conversation.otherParticipant);
  const listingLabel = conversation.listingContext.title
    ? `Re: ${conversation.listingContext.title} — ${formatPrice(conversation.listingContext.price)}`
    : 'Marketplace listing';
  const preview = conversation.lastMessage?.content ?? 'No messages yet';
  const time = conversation.lastMessage
    ? formatTimeAgo(conversation.lastMessage.createdAt)
    : formatTimeAgo(conversation.updatedAt);
  const hasUnread = conversation.unreadCount > 0;
  const participantAvatar = resolveImageUri(conversation.otherParticipant.avatarUrl);

  return (
    <Pressable style={styles.chatItem} onPress={() => onPress(conversation.id)}>
      <View style={styles.chatAvatarWrapper}>
        <View style={styles.chatAvatarBg}>
          {participantAvatar ? (
            <Image
              source={{ uri: participantAvatar }}
              style={styles.chatAvatar}
            />
          ) : (
            <View style={[styles.chatAvatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarInitial}>
                {conversation.otherParticipant.firstName.charAt(0)}
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.chatContent}>
        <View style={styles.chatHeader}>
          <View style={styles.chatNameRow}>
            <Text style={styles.chatName}>{participantName}</Text>
          </View>
          <Text style={[styles.chatTime, hasUnread && styles.chatTimeUnread]}>{time}</Text>
        </View>
        <Text style={styles.listingSubtitle} numberOfLines={1}>
          {listingLabel}
        </Text>
        <View style={styles.chatPreviewRow}>
          <Text
            style={[styles.chatPreview, hasUnread && styles.chatPreviewUnread]}
            numberOfLines={1}
          >
            {preview}
          </Text>
          {hasUnread && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>
                {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

export default function MessagesScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const { data, isLoading } = useConversations();
  const { data: unreadData } = useUnreadMessageCount();

  const conversations = useMemo(() => {
    const items = data?.conversations ?? [];
    const query = searchQuery.trim().toLowerCase();
    if (!query) return items;
    return items.filter((conversation) => {
      const name = formatAuthorName(conversation.otherParticipant).toLowerCase();
      const listing = (conversation.listingContext.title ?? '').toLowerCase();
      const preview = (conversation.lastMessage?.content ?? '').toLowerCase();
      return name.includes(query) || listing.includes(query) || preview.includes(query);
    });
  }, [data?.conversations, searchQuery]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor={colors.transparent} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.conversationList}>
          {isLoading ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : conversations.length === 0 ? (
            <Text style={styles.emptyText}>
              No conversations yet. Message a seller from a marketplace post to start chatting.
            </Text>
          ) : (
            conversations.map((conversation) => (
              <ConversationItem
                key={conversation.id}
                conversation={conversation}
                onPress={(id) =>
                  router.push({
                    pathname: '/(parent)/chat/messaging',
                    params: { conversationId: id },
                  })
                }
              />
            ))
          )}
        </View>
      </ScrollView>

      <ParentTabHeader />

      <ParentTabSearchStrip
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Search conversations..."
        onClear={() => setSearchQuery('')}
      />

      <BottomNav activeTab="messages" messagesBadge={unreadData?.unreadCount} />
    </View>
  );
}
