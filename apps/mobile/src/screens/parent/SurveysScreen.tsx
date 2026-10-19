import React from 'react';
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

/** Her PENDING and SKIPPED surveys; a skipped one can still be answered. */
export default function SurveysScreen() {
  const router = useRouter();
  const bottomPadding = useBottomBarPadding(spacing['4xl']);
  const { data, isLoading, isError, refetch } = usePendingSurveys();

  return (
    <ScreenContainer useSafeArea={false}>
      <StackHeader title="Surveys" />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : isError || !data ? (
          <View style={styles.center}>
            <Text style={styles.empty}>Couldn’t load your surveys.</Text>
            <Button title="Try again" variant="outline" onPress={() => void refetch()} />
          </View>
        ) : data.length === 0 ? (
          <Text style={styles.empty}>You're all caught up.</Text>
        ) : (
          data.map((s) => (
            <PressableScale
              key={s.id}
              accessibilityRole="button"
              onPress={() => navigateToSurvey(router, s.id)}
            >
              <Card>
                <View style={styles.row}>
                  <View style={styles.rowText}>
                    <Text style={styles.title}>{s.title}</Text>
                    <Text style={styles.meta}>
                      {`${s.questionCount} question${s.questionCount === 1 ? '' : 's'}`}
                    </Text>
                    {s.status === 'SKIPPED' ? (
                      <View style={styles.tag}>
                        <Text style={styles.tagText}>Skipped</Text>
                      </View>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                </View>
              </Card>
            </PressableScale>
          ))
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
