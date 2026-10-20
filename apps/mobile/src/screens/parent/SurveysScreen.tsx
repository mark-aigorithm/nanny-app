import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Text } from '@mobile/components/ui/text';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { Button, Card, PressableScale, ScreenContainer, StackHeader } from '@mobile/components/ui';
import { useBottomBarPadding } from '@mobile/hooks/useBottomInset';
import { usePendingSurveys } from '@mobile/hooks/useSurveys';
import { navigateToSurvey } from '@mobile/lib/notificationNavigation';
import { colors, spacing } from '@mobile/theme';
import { styles } from './styles/surveys-screen.styles';

/** The one name per status, here and wherever a survey's state is shown. */
const STATUS_LABEL = { PENDING: 'New', SKIPPED: 'Skipped' } as const;

/** Her PENDING and SKIPPED surveys; a skipped one can still be answered. */
export default function SurveysScreen() {
  const router = useRouter();
  const bottomPadding = useBottomBarPadding(spacing['4xl']);
  const { data, isLoading, isError, refetch } = usePendingSurveys();
  const [scrolled, setScrolled] = useState(false);

  return (
    <ScreenContainer useSafeArea={false}>
      <StackHeader title="Surveys" scrolled={scrolled} />
      <ScrollView
        onScroll={(e) => setScrolled(e.nativeEvent.contentOffset.y > 0)}
        scrollEventThrottle={16}
        contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primaryDark} accessibilityLabel="Loading surveys" />
          </View>
        ) : isError || !data ? (
          <View style={styles.center}>
            <Text style={styles.empty}>Couldn’t load your surveys.</Text>
            <Button title="Try again" variant="secondary" onPress={() => void refetch()} />
          </View>
        ) : data.length === 0 ? (
          <Text style={styles.empty}>You're all caught up.</Text>
        ) : (
          data.map((s) => {
            const questions = `${s.questionCount} question${s.questionCount === 1 ? '' : 's'}`;
            const status = STATUS_LABEL[s.status];
            return (
              <PressableScale
                key={s.id}
                accessibilityRole="button"
                accessibilityLabel={`${s.title}, ${questions}, ${status.toLowerCase()}`}
                onPress={() => navigateToSurvey(router, s.id)}
              >
                <Card>
                  <View style={styles.row}>
                    <View style={styles.rowText}>
                      <Text style={styles.title}>{s.title}</Text>
                      <Text style={styles.meta}>{questions}</Text>
                      <View style={[styles.tag, s.status === 'PENDING' && styles.tagNew]}>
                        <Text style={styles.tagText}>{status}</Text>
                      </View>
                    </View>
                    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                    </View>
                  </View>
                </Card>
              </PressableScale>
            );
          })
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
