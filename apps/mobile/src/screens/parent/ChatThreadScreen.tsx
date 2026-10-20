import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  Image,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { Text } from '@mobile/components/ui/text';
import { KeyboardAvoidingView } from '@mobile/components/ui';
import {
  ChatComposer,
  DateDivider,
  MessageBubble,
  formatMessageTime,
  groupMessagesByDay,
} from '@mobile/components/chat';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';

import {
  useConversation,
  useMarkConversationRead,
  useMessages,
  useSendMessage,
} from '@mobile/hooks/useMessaging';
import { formatAuthorName, formatPrice } from '@mobile/lib/communityUtils';
import { resolveImageUri } from '@mobile/lib/imageUri';
import { useUserProfileStore } from '@mobile/store/userProfileStore';
import { useMessagingStore } from '@mobile/store/messagingStore';
import { colors } from '@mobile/theme';
import { styles } from './styles/chat-thread-screen.styles';

export default function ChatThreadScreen() {
  const router = useRouter();
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const currentUserId = useUserProfileStore((s) => s.profile?.id);
  const setActiveConversationId = useMessagingStore((s) => s.setActiveConversationId);

  const [messageText, setMessageText] = useState('');
  const scrollViewRef = useRef<ScrollView>(null);

  const numericConversationId = Number(conversationId);
  const { data: conversation, isLoading: conversationLoading } = useConversation(numericConversationId);
  const { data: messagesData, isLoading: messagesLoading } = useMessages(numericConversationId);
  const sendMessage = useSendMessage(numericConversationId);
  const markRead = useMarkConversationRead();

  const messages = messagesData?.messages ?? [];

  useEffect(() => {
    if (!conversationId) return;
    setActiveConversationId(conversationId);
    void markRead.mutate(numericConversationId);
    return () => setActiveConversationId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, setActiveConversationId]);

  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: false });
    }, 100);
  }, [messages.length]);

  const handleSend = async () => {
    const content = messageText.trim();
    if (!content || !conversationId || sendMessage.isPending) return;
    setMessageText('');
    await sendMessage.mutateAsync({ content });
  };

  if (!conversationId) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text>Conversation not found</Text>
        <Pressable onPress={() => router.back()}>
          <Text>Go back</Text>
        </Pressable>
      </View>
    );
  }

  if (conversationLoading || messagesLoading || !conversation) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color={colors.primaryDark} />
      </View>
    );
  }

  const otherParticipant = conversation.otherParticipant;
  const listing = conversation.listingContext;
  const participantName = formatAuthorName(otherParticipant);
  const participantAvatar = resolveImageUri(otherParticipant.avatarUrl);
  const listingImage = resolveImageUri(listing.imageUrl);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      keyboardVerticalOffset={0}
    >
      <StatusBar barStyle="dark-content" translucent backgroundColor={colors.transparent} />

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        <View style={styles.listingWrap}>
          <View style={styles.listingCard}>
            {listingImage ? (
              <Image source={{ uri: listingImage }} style={styles.listingImage} />
            ) : (
              <View style={styles.listingImage}>
                <Ionicons name="pricetag-outline" size={24} color={colors.textMuted} />
              </View>
            )}
            <View style={styles.listingTextCol}>
              <Text style={styles.listingTitle} numberOfLines={2}>
                {listing.title ?? 'Marketplace listing'}
              </Text>
              <Text style={styles.listingPrice}>{formatPrice(listing.price)}</Text>
            </View>
          </View>
        </View>

        {groupMessagesByDay(messages).map((group) => (
          <View key={group.date}>
            <DateDivider date={group.date} />
            {group.items.map((msg) => (
              <MessageBubble
                key={msg.id}
                content={msg.content}
                sent={msg.sender.id === currentUserId}
                time={formatMessageTime(msg.createdAt)}
              />
            ))}
          </View>
        ))}
      </ScrollView>

      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Pressable
              style={styles.backBtn}
              onPress={() => router.back()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Ionicons name="arrow-back" size={24} color={colors.textDark} />
            </Pressable>
            {participantAvatar ? (
              <Image source={{ uri: participantAvatar }} style={styles.headerAvatar} />
            ) : (
              <View style={[styles.headerAvatar, styles.centered]}>
                <Ionicons name="person" size={18} color={colors.textMuted} />
              </View>
            )}
            <View style={styles.headerNameCol}>
              <Text style={styles.headerName} numberOfLines={1}>
                {participantName}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <ChatComposer
        value={messageText}
        onChangeText={setMessageText}
        onSend={() => void handleSend()}
        sending={sendMessage.isPending}
      />
    </KeyboardAvoidingView>
  );
}
