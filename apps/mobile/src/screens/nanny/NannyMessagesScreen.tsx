import React from 'react';
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

import NannyBottomNav from '@mobile/components/NannyBottomNav';
import NannyTabHeader from '@mobile/components/NannyTabHeader';
import { useConversations } from '@mobile/hooks/useMessaging';
import { formatAuthorName, formatTimeAgo } from '@mobile/lib/communityUtils';
import { resolveImageUri } from '@mobile/lib/imageUri';
import { colors } from '@mobile/theme';
import { styles } from './styles/nanny-messages-screen.styles';

function ConversationItem({
  conversation,
  onPress,
}: {
  conversation: ConversationResponse;
  onPress: (id: string) => void;
}) {
  const participantName = formatAuthorName(conversation.otherParticipant);
  const preview = conversation.lastMessage?.content ?? 'No messages yet';
  const time = conversation.lastMessage
    ? formatTimeAgo(conversation.lastMessage.createdAt)
    : formatTimeAgo(conversation.updatedAt);
  const hasUnread = conversation.unreadCount > 0;
  const participantAvatar = resolveImageUri(conversation.otherParticipant.avatarUrl);

  return (
    <Pressable style={styles.chatItem} onPress={() => onPress(conversation.id)}>
      <View style={styles.chatAvatarBg}>
        {participantAvatar ? (
          <Image source={{ uri: participantAvatar }} style={styles.chatAvatar} />
        ) : (
          <View style={[styles.chatAvatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarInitial}>
              {conversation.otherParticipant.firstName.charAt(0)}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.chatContent}>
        <View style={styles.chatHeader}>
          <Text style={styles.chatName}>{participantName}</Text>
          <Text style={[styles.chatTime, hasUnread && styles.chatTimeUnread]}>{time}</Text>
        </View>
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

export default function NannyMessagesScreen() {
  const router = useRouter();
  const { data, isLoading } = useConversations();
  const conversations = data?.conversations ?? [];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.conversationList}>
          {isLoading ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : conversations.length === 0 ? (
            <Text style={styles.emptyText}>
              No conversations yet. Messages from parents will appear here.
            </Text>
          ) : (
            conversations.map((conversation) => (
              <ConversationItem
                key={conversation.id}
                conversation={conversation}
                onPress={(id) =>
                  router.push({
                    pathname: '/(nanny)/chat',
                    params: { conversationId: id },
                  } as never)
                }
              />
            ))
          )}
        </View>
      </ScrollView>

      <NannyTabHeader title="Messages" />

      <NannyBottomNav activeTab="messages" />
    </View>
  );
}
