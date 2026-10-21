import React, { useEffect } from 'react';
import { BackHandler, ScrollView, View } from 'react-native';
import { Text } from '@mobile/components/ui/text';

import { useBottomBarPadding } from '@mobile/hooks/useBottomInset';
import { UPDATE_IN_STORE_LABEL, storeLinkFallback } from '@mobile/lib/storeLabels';
import { colors, spacing } from '@mobile/theme';
import { Button, IconCircle, ScreenContainer } from '@mobile/components/ui';
import { styles } from './styles/update-required-screen.styles';

interface UpdateRequiredScreenProps {
  onUpdate: () => void;
  /** The store URL, when opening it failed; shown as text so she can still update. */
  storeError?: string | null;
}

/**
 * Full-screen "update required" state. UpdateGate renders it over the whole
 * app when this install is below the newest mandatory release. There is no
 * way past it but the store: the Android back button is swallowed.
 */
export default function UpdateRequiredScreen({
  onUpdate,
  storeError = null,
}: UpdateRequiredScreenProps) {
  const bottomPadding = useBottomBarPadding(spacing['4xl']);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, []);

  return (
    <ScreenContainer useSafeArea={false}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <IconCircle
          icon="arrow-up-circle-outline"
          size="xl"
          backgroundColor={colors.warmSubtle}
          iconColor={colors.primaryDark}
          style={styles.iconCircle}
        />
        <Text accessibilityRole="header" style={styles.headline}>
          Time to update
        </Text>
        <Text style={styles.body}>
          This version of the app is no longer supported. Update to keep booking and managing care.
        </Text>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: bottomPadding }]}>
        {storeError ? (
          <Text selectable accessibilityLiveRegion="polite" style={styles.storeError}>
            {storeLinkFallback(storeError)}
          </Text>
        ) : null}
        <Button title={UPDATE_IN_STORE_LABEL} onPress={onUpdate} />
      </View>
    </ScreenContainer>
  );
}
