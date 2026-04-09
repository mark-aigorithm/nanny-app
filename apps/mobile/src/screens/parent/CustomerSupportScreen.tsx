import React, { useState } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

// ASSUMPTION: Images sourced from Figma CDN — expire in 7 days.
// Replace with S3/CDN URLs or bundled assets before production.
const IMG_USER_AVATAR = 'https://www.figma.com/api/mcp/asset/3ef9c426-2c0a-4e14-a4d8-a42060d0e5ae';

// ASSUMPTION: FAQ data will come from a CMS or backend endpoint.
// Using hardcoded mock data until the content management system is ready.
const MOCK_FAQS = [
  {
    id: 1,
    question: 'How are nannies vetted?',
    answer:
      'All nannies complete a comprehensive background check including identity verification, reference checks and CPR certification.',
  },
  {
    id: 2,
    question: 'What is the cancellation policy?',
    answer:
      'You can cancel a booking up to 24 hours before the scheduled start time for a full refund. Cancellations within 24 hours may incur a fee.',
  },
  {
    id: 3,
    question: 'How do refunds work?',
    answer:
      'Refunds are processed within 5-7 business days and returned to your original payment method.',
  },
];

// ASSUMPTION: Font 'Manrope' is loaded at the app root via expo-font / useFonts.

export default function CustomerSupportScreen() {
  const router = useRouter();
  const [expandedFaq, setExpandedFaq] = useState<number | null>(1);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredFaqs = searchQuery
    ? MOCK_FAQS.filter(
        (faq) =>
          faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
          faq.answer.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : MOCK_FAQS;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      {/* ── Scrollable main content ── */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <Text style={styles.pageTitle}>Help &amp; support</Text>

        {/* Live Chat Card */}
        <View style={styles.liveChatCard}>
          <View style={styles.liveChatLeft}>
            <Text style={styles.liveChatTitle}>Chat with us</Text>
            <Text style={styles.liveChatSubtitle}>● Available now · ~2 min wait</Text>
          </View>
          <Pressable style={styles.startChatBtn}>
            <Text style={styles.startChatBtnText}>Start chat</Text>
          </Pressable>
        </View>

        {/* FAQ Search Bar */}
        <View style={styles.searchBar}>
          <Ionicons
            name="search-outline"
            size={18}
            color="#7a7a7a"
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search FAQ..."
            placeholderTextColor="#7a7a7a"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* FAQ Accordion */}
        <View style={styles.faqList}>
          {filteredFaqs.map((faq) => {
            const isExpanded = expandedFaq === faq.id;
            return (
              <View key={faq.id} style={styles.faqItem}>
                <Pressable
                  style={styles.faqHeader}
                  onPress={() => setExpandedFaq(isExpanded ? null : faq.id)}
                >
                  <Text
                    style={[
                      styles.faqQuestion,
                      isExpanded ? styles.faqQuestionExpanded : styles.faqQuestionCollapsed,
                    ]}
                  >
                    {faq.question}
                  </Text>
                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color="#2e2e2e"
                  />
                </Pressable>
                {isExpanded && (
                  <View style={styles.faqBody}>
                    <Text style={styles.faqAnswer}>{faq.answer}</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Other Ways to Reach Us */}
        <View style={styles.otherWaysSection}>
          <Text style={styles.otherWaysHeader}>OTHER WAYS TO REACH US</Text>
          <View style={styles.contactGrid}>
            {/* Email support */}
            <Pressable style={styles.contactCard}>
              <View style={styles.contactIconWrapGreen}>
                <Ionicons name="mail-outline" size={20} color="#556251" />
              </View>
              <Text style={styles.contactTitle}>Email support</Text>
              <Text style={styles.contactSubtitle}>Reply within 24 hours</Text>
            </Pressable>

            {/* Ask the community */}
            <Pressable style={styles.contactCard}>
              <View style={styles.contactIconWrapBeige}>
                <Ionicons name="chatbubbles-outline" size={20} color="#8b7355" />
              </View>
              <Text style={styles.contactTitle}>Ask the community</Text>
              <Text style={styles.contactSubtitle}>Moms helping moms</Text>
            </Pressable>
          </View>
        </View>

        {/* Emergency Card */}
        <View style={styles.emergencyCard}>
          <View style={styles.emergencyLeft}>
            <Text style={styles.emergencyTitle}>Emergency assistance</Text>
            <Text style={styles.emergencySubtitle}>24/7 safety hotline</Text>
          </View>
          <Pressable style={styles.callNowBtn}>
            <Ionicons name="call-outline" size={16} color="#c0634a" />
            <Text style={styles.callNowText}>Call now</Text>
          </Pressable>
        </View>

        {/* TODO: Replace with proper BottomNav once tab design is finalized.
            The Figma shows different bottom nav tabs (Home, Bookings, Support, Profile)
            than the existing BottomNav component. */}
      </ScrollView>

      {/* ── Fixed: Header ── */}
      <View style={styles.header} pointerEvents="box-none">
        <View style={styles.headerRow}>
          <Pressable style={styles.iconBtn}>
            <Ionicons name="menu-outline" size={22} color="#1b1c1b" />
          </Pressable>
          <Text style={styles.logoText}>NannyMom</Text>
          <Image source={{ uri: IMG_USER_AVATAR }} style={styles.avatar} />
        </View>
      </View>
    </View>
  );
}

// ─── Layout constants ─────────────────────────────────────────────────────────

const STATUS_BAR_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44;
const HEADER_HEIGHT = STATUS_BAR_HEIGHT + 56;

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fcf9f7',
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: HEADER_HEIGHT + 16,
    paddingBottom: 128,
    paddingHorizontal: 24,
    gap: 24,
  },

  // Page title
  pageTitle: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 20,
    lineHeight: 28,
    color: '#1b1c1b',
    textAlign: 'center',
  },

  // Live Chat Card
  liveChatCard: {
    backgroundColor: '#97a591',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  liveChatLeft: {
    flex: 1,
    marginRight: 12,
    gap: 4,
  },
  liveChatTitle: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 18,
    lineHeight: 26,
    color: '#ffffff',
  },
  liveChatSubtitle: {
    fontFamily: 'Manrope',
    fontWeight: '400',
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.8)',
  },
  startChatBtn: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    height: 36,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 2,
  },
  startChatBtnText: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 14,
    color: '#97a591',
  },

  // FAQ Search Bar
  searchBar: {
    backgroundColor: 'rgba(227,213,202,0.5)',
    borderRadius: 16,
    height: 56,
    justifyContent: 'center',
  },
  searchIcon: {
    position: 'absolute',
    left: 19,
    zIndex: 1,
  },
  searchInput: {
    fontFamily: 'Manrope',
    fontWeight: '400',
    fontSize: 15,
    color: '#2e2e2e',
    paddingLeft: 48,
    paddingRight: 16,
    height: '100%',
  },

  // FAQ Accordion
  faqList: {
    gap: 12,
  },
  faqItem: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
  },
  faqQuestion: {
    fontFamily: 'Manrope',
    fontSize: 15,
    lineHeight: 22,
    color: '#2e2e2e',
    flex: 1,
    marginRight: 12,
  },
  faqQuestionExpanded: {
    fontWeight: '700',
  },
  faqQuestionCollapsed: {
    fontWeight: '500',
  },
  faqBody: {
    backgroundColor: 'rgba(227,213,202,0.3)',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  faqAnswer: {
    fontFamily: 'Manrope',
    fontWeight: '400',
    fontSize: 14,
    lineHeight: 22,
    color: '#2e2e2e',
  },

  // Other Ways to Reach Us
  otherWaysSection: {
    gap: 16,
  },
  otherWaysHeader: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.65,
    color: '#7a7a7a',
    textTransform: 'uppercase',
  },
  contactGrid: {
    flexDirection: 'row',
    gap: 16,
  },
  contactCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    gap: 8,
  },
  contactIconWrapGreen: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#d8e7d1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactIconWrapBeige: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ebddd2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactTitle: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 14,
    lineHeight: 20,
    color: '#2e2e2e',
  },
  contactSubtitle: {
    fontFamily: 'Manrope',
    fontWeight: '400',
    fontSize: 12,
    lineHeight: 16,
    color: '#7a7a7a',
  },

  // Emergency Card
  emergencyCard: {
    backgroundColor: '#fdf0ee',
    borderRadius: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#c0634a',
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  emergencyLeft: {
    flex: 1,
    marginRight: 12,
    gap: 4,
  },
  emergencyTitle: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 15,
    lineHeight: 22,
    color: '#c0634a',
  },
  emergencySubtitle: {
    fontFamily: 'Manrope',
    fontWeight: '400',
    fontSize: 13,
    lineHeight: 18,
    color: '#2e2e2e',
  },
  callNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#c0634a',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  callNowText: {
    fontFamily: 'Manrope',
    fontWeight: '600',
    fontSize: 14,
    color: '#c0634a',
  },

  // Header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(253,250,248,0.8)',
    zIndex: 100,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: STATUS_BAR_HEIGHT + 8,
    paddingBottom: 16,
  },
  logoText: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: -1,
    color: '#1b1c1b',
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f0edeb',
  },
});
