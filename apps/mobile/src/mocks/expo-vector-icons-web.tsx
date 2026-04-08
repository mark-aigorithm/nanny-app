/**
 * Minimal web stub for @expo/vector-icons used during Vite preview builds.
 * Maps common Ionicons names to Unicode symbols so the preview renders without
 * needing the native font glyphs.
 */
import React from 'react';
import { Text } from 'react-native';

const ICON_MAP: Record<string, string> = {
  'notifications-outline': '🔔',
  'search-outline': '🔍',
  'home': '⌂',
  'people-outline': '👥',
  'chatbubble-outline': '💬',
  'add': '+',
  'star': '★',
  'chevron-forward': '›',
};

type IconProps = {
  name: string;
  size?: number;
  color?: string;
  style?: object;
};

function Icon({ name, size = 20, color = '#000', style }: IconProps) {
  return (
    <Text style={[{ fontSize: size, color, lineHeight: size + 4 }, style]}>
      {ICON_MAP[name] ?? '·'}
    </Text>
  );
}

export const Ionicons = Icon;
export default { Ionicons: Icon };
