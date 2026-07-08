import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors } from '@mobile/theme';
import { MOCK_FAQS } from '@mobile/mocks';
import { getProfileReturnHref } from '@mobile/lib/profileUtils';
import { styles } from './styles/customer-support-screen.styles';

export default function CustomerSupportScreen() {
  const router = useRouter();
  const { returnTo, profileReturnTo } = useLocalSearchParams<{
    returnTo?: string;
    profileReturnTo?: string;
  }>();
  const [expandedFaq, setExpandedFaq] = useState<number | null>(1);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredFaqs = searchQuery
    ? MOCK_FAQS.filter(
        (faq) =>
          faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
          faq.answer.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : MOCK_FAQS;

  const handleBack = () => {
    if (returnTo === 'mother-profile') {
      router.replace({
        pathname: '/(parent)/mother-profile',
        params: { returnTo: profileReturnTo ?? 'home' },
      } as never);
      return;
    }
    if (returnTo) {
      router.replace(getProfileReturnHref(returnTo) as never);
      return;
    }
    router.back();
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.pageTitle}>Help &amp; support</Text>

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

        <View style={styles.otherWaysSection}>
          <Text style={styles.otherWaysHeader}>OTHER WAYS TO REACH US</Text>
          <View style={styles.contactGrid}>
            <Pressable style={styles.contactCard}>
              <View style={styles.contactIconWrapGreen}>
                <Ionicons name="mail-outline" size={20} color={colors.primaryDark} />
              </View>
              <Text style={styles.contactTitle}>Email support</Text>
              <Text style={styles.contactSubtitle}>Reply within 24 hours</Text>
            </Pressable>

            <Pressable
              style={styles.contactCard}
              onPress={() => router.push('/(parent)/community')}
            >
              <View style={styles.contactIconWrapBeige}>
                <Ionicons name="chatbubbles-outline" size={20} color={colors.textTertiary} />
              </View>
              <Text style={styles.contactTitle}>Ask the community</Text>
              <Text style={styles.contactSubtitle}>Moms helping moms</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.emergencyCard}>
          <Text style={styles.emergencyTitle}>Emergency assistance</Text>
          <Text style={styles.emergencySubtitle}>24/7 safety hotline</Text>
        </View>
      </ScrollView>

      <View style={styles.header} pointerEvents="box-none">
        <Pressable style={styles.backBtn} onPress={handleBack} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
      </View>
    </View>
  );
}
