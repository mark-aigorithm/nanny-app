import React from 'react';
import type { ReactNode } from 'react';
import { View, StatusBar, StyleSheet } from 'react-native';
import type { ViewStyle, StyleProp } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Edge } from 'react-native-safe-area-context';

import { colors } from '@mobile/theme';

interface ScreenContainerProps {
  children: ReactNode;
  backgroundColor?: string;
  statusBarStyle?: 'dark-content' | 'light-content';
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
  useSafeArea?: boolean;
}

export default function ScreenContainer({
  children,
  backgroundColor = colors.background,
  statusBarStyle = 'dark-content',
  edges = ['top', 'bottom'],
  style,
  useSafeArea = true,
}: ScreenContainerProps) {
  const Container = useSafeArea ? SafeAreaView : View;

  return (
    <Container
      style={[styles.container, { backgroundColor }, style]}
      {...(useSafeArea ? { edges } : {})}
    >
      <StatusBar barStyle={statusBarStyle} backgroundColor={backgroundColor} />
      {children}
    </Container>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
