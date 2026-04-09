import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  TextInput,
  StyleSheet,
  Platform,
  StatusBar,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

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
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

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
                <Ionicons name="calendar-outline" size={20} color="#675d54" />
              </View>
              <View style={styles.bannerTextCol}>
                <Text style={styles.bannerTitle}>Booking: Sat Apr 12</Text>
                <Text style={styles.bannerSub}>9AM – 5PM</Text>
              </View>
            </View>
            <View style={styles.confirmedBadge}>
              <Ionicons name="checkmark-circle" size={14} color="#6a9b6a" />
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
                <Ionicons name="checkmark-done" size={14} color="#7a7a7a" />
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
              <Ionicons name="arrow-back" size={24} color="#2e2e2e" />
            </Pressable>
            <Image source={{ uri: IMG_ELENA }} style={styles.headerAvatar} />
            <View style={styles.headerNameCol}>
              <View style={styles.headerNameRow}>
                <Text style={styles.headerName}>Elena Martinez</Text>
                <Ionicons name="checkmark-circle" size={14} color="#6a9b6a" />
              </View>
              <Text style={styles.headerStatus}>Online</Text>
            </View>
          </View>
          <Pressable style={styles.videoBtn}>
            <Ionicons name="videocam-outline" size={22} color="#2e2e2e" />
          </Pressable>
        </View>
      </View>

      {/* ── Fixed: Footer input bar ── */}
      <View style={styles.footer}>
        <Pressable style={styles.attachBtn} hitSlop={4}>
          <Ionicons name="attach" size={24} color="#675d54" />
        </Pressable>
        <TextInput
          style={styles.input}
          placeholder="Write a message..."
          placeholderTextColor="#9e9e9e"
          value={messageText}
          onChangeText={setMessageText}
          multiline={false}
        />
        <Pressable style={styles.sendBtn}>
          <Ionicons name="send" size={20} color="#ffffff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Layout constants ─────────────────────────────────────────────────────────

const STATUS_BAR_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44;
const HEADER_HEIGHT = STATUS_BAR_HEIGHT + 64;

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fdfaf8',
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: HEADER_HEIGHT + 8,
    paddingBottom: 100,
    paddingHorizontal: 16,
    gap: 12,
  },

  // Header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(227,213,202,0.8)',
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: STATUS_BAR_HEIGHT + 8,
    paddingBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f0edeb',
  },
  headerNameCol: {
    gap: 1,
  },
  headerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerName: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: -0.4,
    color: '#2e2e2e',
  },
  headerStatus: {
    fontFamily: 'Manrope',
    fontWeight: '600',
    fontSize: 11,
    color: '#97a591',
  },
  videoBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Booking context banner
  bannerWrap: {
    paddingVertical: 4,
  },
  banner: {
    backgroundColor: '#e3d5ca',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  bannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bannerIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTextCol: {
    gap: 2,
  },
  bannerTitle: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 13,
    color: '#2e2e2e',
  },
  bannerSub: {
    fontFamily: 'Manrope',
    fontWeight: '400',
    fontSize: 12,
    color: '#675d54',
  },
  confirmedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(106,155,106,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9999,
  },
  confirmedText: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 12,
    color: '#6a9b6a',
  },

  // Date divider
  dateDividerWrap: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  dateDivider: {
    backgroundColor: '#e3d5ca',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 9999,
  },
  dateDividerText: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 12,
    color: '#675d54',
  },

  // Messages
  messageBubbleWrap: {
    maxWidth: '80%',
    gap: 4,
  },
  messageReceived: {
    alignSelf: 'flex-start',
  },
  messageSent: {
    alignSelf: 'flex-end',
  },
  messageBubble: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  bubbleReceived: {
    backgroundColor: '#e3d5ca',
  },
  bubbleSent: {
    backgroundColor: '#97a591',
  },
  messageText: {
    fontFamily: 'Manrope',
    fontWeight: '400',
    fontSize: 15,
    lineHeight: 22,
  },
  messageTextReceived: {
    color: '#2e2e2e',
  },
  messageTextSent: {
    color: '#ffffff',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeRowReceived: {
    alignSelf: 'flex-start',
    paddingLeft: 4,
  },
  timeRowSent: {
    alignSelf: 'flex-end',
    paddingRight: 4,
  },
  timeText: {
    fontFamily: 'Manrope',
    fontWeight: '500',
    fontSize: 12,
    color: '#7a7a7a',
  },

  // Footer input bar
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e3d5ca',
  },
  attachBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    height: 48,
    backgroundColor: 'rgba(227,213,202,0.4)',
    borderRadius: 16,
    paddingHorizontal: 16,
    fontFamily: 'Manrope',
    fontWeight: '400',
    fontSize: 15,
    color: '#2e2e2e',
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#97a591',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
});
