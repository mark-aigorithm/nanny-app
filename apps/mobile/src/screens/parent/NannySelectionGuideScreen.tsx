import React from 'react';
import { View, Text, ScrollView, Pressable, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors } from '@mobile/theme';
import { NANNY_SELECTION_GUIDE } from '@mobile/constants/nanny-selection-guide';
import { styles } from './styles/nanny-selection-guide-screen.styles';

export default function NannySelectionGuideScreen() {
  const router = useRouter();
  const { tag, title, readTime, intro, questions, tipTitle, tipBody } = NANNY_SELECTION_GUIDE;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.tag}>{tag}</Text>
        <Text style={styles.title}>{title}</Text>

        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{readTime}</Text>
          <View style={styles.metaDot} />
          <Text style={styles.metaText}>{questions.length} questions</Text>
        </View>

        <View style={styles.introCard}>
          <Text style={styles.introText}>{intro}</Text>
        </View>

        <Text style={styles.sectionLabel}>Questions to ask</Text>

        {questions.map((item) => (
          <View key={item.number} style={styles.questionCard}>
            <View style={styles.questionHeader}>
              <View style={styles.questionNumber}>
                <Text style={styles.questionNumberText}>{item.number}</Text>
              </View>
              <Text style={styles.questionText}>{item.question}</Text>
            </View>

            <View>
              <Text style={styles.blockLabel}>Why it matters</Text>
              <Text style={styles.blockText}>{item.whyItMatters}</Text>
            </View>

            <View>
              <Text style={styles.blockLabel}>Listen for</Text>
              <Text style={styles.blockText}>{item.listenFor}</Text>
            </View>
          </View>
        ))}

        <View style={styles.tipCard}>
          <Text style={styles.tipTitle}>{tipTitle}</Text>
          <Text style={styles.tipBody}>{tipBody}</Text>
        </View>

        <Pressable
          style={styles.ctaButton}
          onPress={() => router.push('/(parent)/search')}
        >
          <Text style={styles.ctaButtonText}>Browse nannies</Text>
        </Pressable>
      </ScrollView>

      <View style={styles.header} pointerEvents="box-none">
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
      </View>
    </View>
  );
}
