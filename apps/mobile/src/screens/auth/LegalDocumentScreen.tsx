import React from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { LegalDocumentKeySchema } from '@nanny-app/shared';

import { Button, ScreenContainer, StackHeader } from '@mobile/components/ui';
import { useLegalDocument } from '@mobile/hooks/useSupport';
import { colors } from '@mobile/theme';

import { styles } from './styles/legal-document-screen.styles';

const FALLBACK_TITLES = { terms: 'Terms of Service', privacy: 'Privacy Policy' } as const;

/**
 * The Terms of Service or Privacy Policy, opened from the registration
 * wizard's Finish step (`/(auth)/legal/terms` or `/(auth)/legal/privacy`).
 * The text is written by operators in the console; this screen only shows it,
 * and works signed out.
 */
export default function LegalDocumentScreen() {
  const params = useLocalSearchParams<{ key?: string }>();
  const parsedKey = LegalDocumentKeySchema.safeParse(params.key);
  const key = parsedKey.success ? parsedKey.data : 'terms';
  const { data, isLoading, isError, refetch, isRefetching } = useLegalDocument(key);

  return (
    <ScreenContainer useSafeArea={false}>
      <StackHeader title={data?.title ?? FALLBACK_TITLES[key]} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {isLoading && (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} accessibilityLabel="Loading" />
          </View>
        )}
        {isError && (
          <View style={styles.center}>
            <Text style={styles.errorText}>We couldn’t load this document.</Text>
            <Button
              title="Try again"
              variant="outline"
              onPress={() => void refetch()}
              loading={isRefetching}
            />
          </View>
        )}
        {data && (
          <>
            {data.updatedAt && (
              <Text style={styles.updatedAt}>Last updated {formatDate(data.updatedAt)}</Text>
            )}
            <Text style={styles.body}>{data.body}</Text>
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
