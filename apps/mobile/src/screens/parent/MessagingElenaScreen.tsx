import React, { useState, useRef, useEffect } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { colors } from '@mobile/theme';
import { styles } from './styles/messaging-elena-screen.styles';

// ASSUMPTION: Images sourced from Figma CDN — expire in 7 days.
// Replace with S3/CDN URLs or bundled assets before production.
const IMG_ELENA = 'https://www.figma.com/api/mcp/asset/1c0c1853-abde-4a2d-b6d0-142693871519';

// ASSUMPTION: Messages will come from GET /bookings/:id/messages or a Firestore realtime listener.
// Using hardcoded mock data until the backend service is ready.
const MOCK_MESSAGES = [
  {
    id: '1',
    type: 'received' as const,
    text: 'Hi Sarah! I\'ll be there on time. Does Liam have any specific lunch preferences today?',
    time: '10:42 AM',
  },
  {
    id: '2',
    type: 'sent' as const,
    text: 'Hi Elena, that\'s great. He loves the mashed sweet potatoes I\'ve prepared.',
    time: '10:45 AM',
  },
  {
    id: '3',
    type: 'received' as const,
    text: 'Perfect, I\'ll make sure he enjoys that. See you soon!',
    time: '10:48 AM',
  },
  {
    id: '4',
    type: 'sent' as const,
    text: 'See you tomorrow!',
    time: '10:50 AM',
  },
];

// ASSUMPTION: Font 'Manrope' is loaded at the app root via expo-font / useFonts.

export default function MessagingElenaScreen() {
  const router = useRouter();
  const [messageText, setMessageText] = useState('');
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    // Scroll to bottom on mount to show latest messages
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: false });
    }, 100);
  }, []);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <StatusBar barStyle="dark-content" translucent backgroundColor={colors.transparent} />

      {/* ── Message thread ── */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Booking context banner */}
        <View style={styles.bannerWrap}>
          <View style={styles.banner}>
            <View style={styles.bannerLeft}>
              <View style={styles.bannerIconCircle}>
                <Ionicons name="calendar-outline" size={20} color={colors.textTertiary} />
              </View>
              <View style={styles.bannerTextCol}>
                <Text style={styles.bannerTitle}>Booking: Sat Apr 12</Text>
                <Text style={styles.bannerSub}>9AM – 5PM</Text>
              </View>
            </View>
            <View style={styles.confirmedBadge}>
              <Ionicons name="checkmark-circle" size={14} color={colors.success} />
              <Text style={styles.confirmedText}>Confirmed</Text>
            </View>
          </View>
        </View>

        {/* Date divider */}
        <View style={styles.dateDividerWrap}>
          <View style={styles.dateDivider}>
            <Text style={styles.dateDividerText}>Today</Text>
          </View>
        </View>

        {/* Messages */}
        {MOCK_MESSAGES.map((msg) => (
          <View
            key={msg.id}
            style={[
              styles.messageBubbleWrap,
              msg.type === 'sent' ? styles.messageSent : styles.messageReceived,
            ]}
          >
            <View
              style={[
                styles.messageBubble,
                msg.type === 'sent' ? styles.bubbleSent : styles.bubbleReceived,
              ]}
            >
              <Text
                style={[
                  styles.messageText,
                  msg.type === 'sent' ? styles.messageTextSent : styles.messageTextReceived,
                ]}
              >
                {msg.text}
              </Text>
            </View>
            <View
              style={[
                styles.timeRow,
                msg.type === 'sent' ? styles.timeRowSent : styles.timeRowReceived,
              ]}
            >
              <Text style={styles.timeText}>{msg.time}</Text>
              {msg.type === 'sent' && (
                <Ionicons name="checkmark-done" size={14} color={colors.textMuted} />
              )}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* ── Fixed: Header ── */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Pressable
              style={styles.backBtn}
              onPress={() => router.back()}
              hitSlop={8}
            >
              <Ionicons name="arrow-back" size={24} color={colors.textDark} />
            </Pressable>
            <Image source={{ uri: IMG_ELENA }} style={styles.headerAvatar} />
            <View style={styles.headerNameCol}>
              <View style={styles.headerNameRow}>
                <Text style={styles.headerName}>Elena Martinez</Text>
                <Ionicons name="checkmark-circle" size={14} color={colors.success} />
              </View>
              <Text style={styles.headerStatus}>Online</Text>
            </View>
          </View>
          <Pressable style={styles.videoBtn}>
            <Ionicons name="videocam-outline" size={22} color={colors.textDark} />
          </Pressable>
        </View>
      </View>

      {/* ── Fixed: Footer input bar ── */}
      <View style={styles.footer}>
        <Pressable style={styles.attachBtn} hitSlop={4}>
          <Ionicons name="attach" size={24} color={colors.textTertiary} />
        </Pressable>
        <TextInput
          style={styles.input}
          placeholder="Write a message..."
          placeholderTextColor={colors.textPlaceholder}
          value={messageText}
          onChangeText={setMessageText}
          multiline={false}
        />
        <Pressable style={styles.sendBtn}>
          <Ionicons name="send" size={20} color={colors.white} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

