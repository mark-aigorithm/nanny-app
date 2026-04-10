import React from 'react';
import type { ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { colors, fontFamily, spacing, HEADER_HEIGHT, STATUS_BAR_HEIGHT } from '@mobile/theme';

interface HeaderProps {
  title?: string;
  showBackButton?: boolean;
  onBack?: () => void;
  rightElement?: ReactNode;
  leftElement?: ReactNode;
  transparent?: boolean;
  style?: StyleProp<ViewStyle>;
}

export default function Header({
  title,
  showBackButton = true,
  onBack,
  rightElement,
  leftElement,
  transparent = false,
  style,
}: HeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  return (
    <View
      style={[
        styles.container,
        transparent ? styles.transparent : styles.opaque,
        style,
      ]}
    >
      <View style={styles.row}>
        {showBackButton ? (
          <Pressable onPress={handleBack} style={styles.backButton} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </Pressable>
        ) : leftElement ? (
          <View style={styles.leftElement}>{leftElement}</View>
        ) : (
          <View style={styles.placeholder} />
        )}

        {title && (
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        )}

        {rightElement ? (
          <View style={styles.rightElement}>{rightElement}</View>
        ) : (
          <View style={styles.placeholder} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: HEADER_HEIGHT,
    paddingTop: STATUS_BAR_HEIGHT,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    zIndex: 100,
  },
  transparent: {
    backgroundColor: colors.transparent,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  opaque: {
    backgroundColor: colors.taupeHeader,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 56,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leftElement: {
    minWidth: 40,
  },
  rightElement: {
    minWidth: 40,
    alignItems: 'flex-end',
  },
  placeholder: {
    width: 40,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: colors.textPrimary,
    marginHorizontal: spacing.sm,
  },
});
