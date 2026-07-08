import React from 'react';
import { View, StyleSheet } from 'react-native';

import { SearchBar } from '@mobile/components/ui';
import { colors, screenPadding, spacing, HEADER_HEIGHT } from '@mobile/theme';

interface ParentTabSearchStripProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  onClear?: () => void;
}

export default function ParentTabSearchStrip({
  value,
  onChangeText,
  placeholder,
  onClear,
}: ParentTabSearchStripProps) {
  return (
    <View style={styles.searchStrip}>
      <SearchBar
        variant="elevated"
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        showClearButton
        onClear={onClear ?? (() => onChangeText(''))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  searchStrip: {
    position: 'absolute',
    top: HEADER_HEIGHT,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
    paddingHorizontal: screenPadding,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    zIndex: 99,
  },
});
