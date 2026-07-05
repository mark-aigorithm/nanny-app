import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  TextInput,
  Platform,
  StatusBar,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
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

function formatMessageTime(isoDate: string): string {
  return new Date(isoDate).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDateDivider(isoDate: string): string {
  const date = new Date(isoDate);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function ChatThreadScreen() {
  const router = useRouter();
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const currentUserId = useUserProfileStore((s) => s.profile?.id);
  const setActiveConversationId = useMessagingStore((s) => s.setActiveConversationId);

  const [messageText, setMessageText] = useState('');
  const scrollViewRef = useRef<ScrollView>(null);

  const { data: conversation, isLoading: conversationLoading } = useConversation(conversationId);
  const { data: messagesData, isLoading: messagesLoading } = useMessages(conversationId);
  const sendMessage = useSendMessage(conversationId);
  const markRead = useMarkConversationRead();

  const messages = messagesData?.messages ?? [];

  useEffect(() => {
    if (!conversationId) return;
    setActiveConversationId(conversationId);
    void markRead.mutate(conversationId);
    return () => setActiveConversationId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, setActiveConversationId]);

  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: false });
    }, 100);
  }, [messages.length]);

  const groupedMessages = useMemo(() => {
    const groups: { date: string; items: typeof messages }[] = [];
    for (const message of messages) {
      const dateKey = new Date(message.createdAt).toDateString();
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && new Date(lastGroup.items[0]!.createdAt).toDateString() === dateKey) {
        lastGroup.items.push(message);
      } else {
        groups.push({ date: message.createdAt, items: [message] });
      }
    }
    return groups;
  }, [messages]);

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
        <ActivityIndicator color={colors.primary} />
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
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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

        {groupedMessages.map((group) => (
          <View key={group.date}>
            <View style={styles.dateDividerWrap}>
              <View style={styles.dateDivider}>
                <Text style={styles.dateDividerText}>{formatDateDivider(group.date)}</Text>
              </View>
            </View>
            {group.items.map((msg) => {
              const isSent = msg.sender.id === currentUserId;
              return (
                <View
                  key={msg.id}
                  style={[
                    styles.messageBubbleWrap,
                    isSent ? styles.messageSent : styles.messageReceived,
                  ]}
                >
                  <View
                    style={[
                      styles.messageBubble,
                      isSent ? styles.bubbleSent : styles.bubbleReceived,
                    ]}
                  >
                    <Text
                      style={[
                        styles.messageText,
                        isSent ? styles.messageTextSent : styles.messageTextReceived,
                      ]}
                    >
                      {msg.content}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.timeRow,
                      isSent ? styles.timeRowSent : styles.timeRowReceived,
                    ]}
                  >
                    <Text style={styles.timeText}>{formatMessageTime(msg.createdAt)}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>

      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
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

      <View style={styles.footer}>
        <TextInput
          style={styles.input}
          placeholder="Write a message..."
          placeholderTextColor={colors.textPlaceholder}
          value={messageText}
          onChangeText={setMessageText}
          multiline={false}
          editable={!sendMessage.isPending}
        />
        <Pressable
          style={[styles.sendBtn, !messageText.trim() && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!messageText.trim() || sendMessage.isPending}
        >
          <Ionicons name="send" size={20} color={colors.white} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
