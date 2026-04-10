import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors } from '@mobile/theme';
import { styles } from './styles/customer-support-screen.styles';

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
            color={colors.textMuted}
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search FAQ..."
            placeholderTextColor={colors.textMuted}
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
                    color={colors.textDark}
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
                <Ionicons name="mail-outline" size={20} color={colors.primaryDark} />
              </View>
              <Text style={styles.contactTitle}>Email support</Text>
              <Text style={styles.contactSubtitle}>Reply within 24 hours</Text>
            </Pressable>

            {/* Ask the community */}
            <Pressable style={styles.contactCard}>
              <View style={styles.contactIconWrapBeige}>
                <Ionicons name="chatbubbles-outline" size={20} color={colors.textTertiary} />
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
            <Ionicons name="call-outline" size={16} color={colors.error} />
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
            <Ionicons name="menu-outline" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.logoText}>NannyMom</Text>
          <Image source={{ uri: IMG_USER_AVATAR }} style={styles.avatar} />
        </View>
      </View>
    </View>
  );
}

