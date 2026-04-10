import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  SafeAreaView,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import BottomNav from '@mobile/components/BottomNav';
import { colors } from '@mobile/theme';
import { IMG_USER_PROFILE_MESSAGES } from '@mobile/mocks/images';
import type { Conversation } from '@mobile/types';
import { MOCK_CONVERSATIONS } from '@mobile/mocks';
import { styles } from './styles/messages-screen.styles';

function ConversationItem({ conversation, onPress }: { conversation: Conversation; onPress: (id: string) => void }) {
  return (
    <Pressable
      style={[styles.chatItem, conversation.opacity != null && { opacity: conversation.opacity }]}
      onPress={() => onPress(conversation.id)}
    >
      <View style={styles.chatAvatarWrapper}>
        <View style={styles.chatAvatarBg}>
          <Image source={{ uri: conversation.avatar }} style={styles.chatAvatar} />
        </View>
        {conversation.isOnline && <View style={styles.onlineDot} />}
      </View>

      <View style={styles.chatContent}>
        <View style={styles.chatHeader}>
          <View style={styles.chatNameRow}>
            <Text style={styles.chatName}>{conversation.name}</Text>
            {conversation.isVerified && (
              <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
            )}
          </View>
          <Text
            style={[
              styles.chatTime,
              conversation.unreadCount != null && styles.chatTimeUnread,
            ]}
          >
            {conversation.time}
          </Text>
        </View>

        <View style={styles.chatPreviewRow}>
          <Text
            style={[
              styles.chatPreview,
              conversation.unreadCount != null && styles.chatPreviewUnread,
            ]}
            numberOfLines={1}
          >
            {conversation.preview}
          </Text>
          {conversation.unreadCount != null && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{conversation.unreadCount}</Text>
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

  return (
    <View style={styles.container}>
      {/* Status Bar placeholder */}
      <SafeAreaView style={styles.statusBar} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerInner}>
          <View style={styles.headerLeft}>
            <Pressable>
              <Ionicons name="menu-outline" size={22} color={colors.primary} />
            </Pressable>
            <Text style={styles.headerTitle}>Messages</Text>
          </View>
          <View style={styles.headerAvatarBg}>
            <Image source={{ uri: IMG_USER_PROFILE_MESSAGES }} style={styles.headerAvatar} />
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Search Bar */}
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={15} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search conversations..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Conversations */}
        <View style={styles.conversationList}>
          {MOCK_CONVERSATIONS.map(conversation => (
            <ConversationItem
              key={conversation.id}
              conversation={conversation}
              onPress={(id) => router.push({ pathname: '/(parent)/chat/messaging', params: { id } })}
            />
          ))}
        </View>
      </ScrollView>

      {/* FAB */}
      <Pressable style={styles.fab}>
        <Ionicons name="create-outline" size={22} color={colors.white} />
      </Pressable>

      <BottomNav activeTab="messages" />
    </View>
  );
}

