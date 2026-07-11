import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import NotificationBellButton from '@mobile/components/NotificationBellButton';
import {
  colors,
  typeScale,
  spacing,
  screenPadding,
  STATUS_BAR_HEIGHT,
} from '@mobile/theme';

interface Props {
  title: string;
}

export default function NannyTabHeader({ title }: Props) {
  return (
    <View style={styles.header} pointerEvents="box-none">
      <View style={styles.headerRow}>
        <View style={styles.sideSlot} />
        <Text style={styles.headerTitle}>{title}</Text>
        <NotificationBellButton
          route="/(nanny)/notifications"
          iconColor={colors.textDark}
          style={styles.sideSlot}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    position: 'absolute',
    top: spacing.xs,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
    zIndex: 100,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: screenPadding,
    paddingTop: STATUS_BAR_HEIGHT + spacing.sm,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    ...typeScale.headingLg,
    color: colors.textPrimary,
    flex: 1,
    textAlign: 'center',
  },
  sideSlot: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
