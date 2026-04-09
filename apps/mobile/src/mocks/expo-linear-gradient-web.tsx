/**
 * Minimal web stub for expo-linear-gradient used during Vite preview builds.
 * Renders a plain View with a CSS linear-gradient background.
 */
import React from 'react';
import { View } from 'react-native';

type LinearGradientProps = {
  colors: string[];
  locations?: number[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  style?: any;
  children?: React.ReactNode;
};

export function LinearGradient({ colors, style, children }: LinearGradientProps) {
  const gradientCSS = `linear-gradient(to bottom, ${colors.join(', ')})`;
  return (
    <View style={[style, { backgroundImage: gradientCSS } as any]}>
      {children}
    </View>
  );
}

export default LinearGradient;
