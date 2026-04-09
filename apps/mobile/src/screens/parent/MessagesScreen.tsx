import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  StyleSheet,
  SafeAreaView,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import BottomNav from '@mobile/components/BottomNav';

// ASSUMPTION: Images sourced from Figma CDN — expire in 7 days.
// Replace with S3/CDN URLs or bundled assets before production.
const IMG_USER_PROFILE = 'https://www.figma.com/api/mcp/asset/e3b31381-7984-4540-863f-9fb1008d16d8';
const IMG_NANNY_ELENA = 'https://www.figma.com/api/mcp/asset/b2edbb96-6e7f-477d-92f0-993954368fc0';
const IMG_NANNY_SARAH = 'https://www.figma.com/api/mcp/asset/dea5c5c1-c606-45d1-bb41-729c090facde';
const IMG_NANNY_MAYA = 'https://www.figma.com/api/mcp/asset/4391d043-f232-490f-a80e-d2a231725d58';
const IMG_NANNY_CLAIRE = 'https://www.figma.com/api/mcp/asset/e99d742d-d1a0-4619-98b7-2be0a3514602';
const IMG_NANNY_SANDRA = 'https://www.figma.com/api/mcp/asset/fc43d888-9646-41ad-9c3c-5216ade75761';

// ASSUMPTION: Conversation list will come from GET /messages/conversations.
// Using hardcoded mock data until the backend messaging service is ready.

interface Conversation {
  id: string;
  name: string;
  preview: string;
  time: string;
  unreadCount?: number;
  isOnline?: boolean;
  isVerified?: boolean;
  opacity?: number;
  avatar: string;
}

const MOCK_CONVERSATIONS: Conversation[] = [
  {
    id: '1',
    name: 'Elena Rodriguez',
    preview: "I'll be there by 8:00 AM tomorrow. …",
    time: '10:24 AM',
    unreadCount: 2,
    isOnline: true,
    avatar: IMG_NANNY_ELENA,
  },
  {
    id: '2',
    name: 'Sarah Jenkins',
    preview: 'Thank you for the wonderful feedback! L…',
    time: 'Yesterday',
    avatar: IMG_NANNY_SARAH,
  },
  {
    id: '3',
    name: 'Maya Patel',
    preview: "I've updated my availability for the upco…",
    time: 'Tuesday',
    isVerified: true,
    avatar: IMG_NANNY_MAYA,
  },
  {
    id: '4',
    name: 'Claire Thompson',
    preview: "Sounds good, let's touch base next wee…",
    time: 'Oct 12',
    opacity: 0.8,
    avatar: IMG_NANNY_CLAIRE,
  },
  {
    id: '5',
    name: 'Sandra Weber',
    preview: 'The school pickup went smoothly today.',
    time: 'Oct 10',
    opacity: 0.7,
    avatar: IMG_NANNY_SANDRA,
  },
];

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
              <Ionicons name="checkmark-circle" size={14} color="#97a591" />
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
              <Ionicons name="menu-outline" size={22} color="#97a591" />
            </Pressable>
            <Text style={styles.headerTitle}>Messages</Text>
          </View>
          <View style={styles.headerAvatarBg}>
            <Image source={{ uri: IMG_USER_PROFILE }} style={styles.headerAvatar} />
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
          <Ionicons name="search-outline" size={15} color="#7a7a7a" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search conversations..."
            placeholderTextColor="#7a7a7a"
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
              onPress={(id) => router.push({ pathname: '/(parent)/chat/messaging', params: { id } } as any)}
            />
          ))}
        </View>
      </ScrollView>

      {/* FAB */}
      <Pressable style={styles.fab}>
        <Ionicons name="create-outline" size={22} color="#fff" />
      </Pressable>

      <BottomNav activeTab="messages" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fcf9f7',
  },
  statusBar: {
    backgroundColor: 'rgba(227, 213, 202, 0.92)',
  },

  // Header
  header: {
    backgroundColor: 'rgba(227, 213, 202, 0.92)',
    zIndex: 3,
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  headerTitle: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 18,
    letterSpacing: -0.45,
    color: '#97a591',
    lineHeight: 28,
  },
  headerAvatarBg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#f0edeb',
  },
  headerAvatar: {
    width: 32,
    height: 32,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 96,
    gap: 32,
  },

  // Search bar
  searchBar: {
    backgroundColor: 'rgba(227, 213, 202, 0.5)',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
    color: '#1b1c1b',
  },

  // Conversation list
  conversationList: {
    gap: 24,
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  chatAvatarWrapper: {
    position: 'relative',
    flexShrink: 0,
  },
  chatAvatarBg: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#f0edeb',
  },
  chatAvatar: {
    width: 56,
    height: 56,
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#6a9b6a',
    borderWidth: 2,
    borderColor: '#fcf9f7',
  },
  chatContent: {
    flex: 1,
    gap: 2,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  chatNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  chatName: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
    color: '#1b1c1b',
    lineHeight: 24,
  },
  chatTime: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 13,
    color: '#7a7a7a',
    lineHeight: 19.5,
  },
  chatTimeUnread: {
    fontFamily: 'Manrope_600SemiBold',
    color: '#97a591',
  },
  chatPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chatPreview: {
    flex: 1,
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
    color: '#7a7a7a',
    lineHeight: 21,
    paddingRight: 8,
  },
  chatPreviewUnread: {
    fontFamily: 'Manrope_600SemiBold',
    color: '#2e2e2e',
  },
  unreadBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#97a591',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  unreadBadgeText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
    color: '#fff',
    lineHeight: 15,
  },

  // FAB
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 96,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#97a591',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 2,
  },

});
