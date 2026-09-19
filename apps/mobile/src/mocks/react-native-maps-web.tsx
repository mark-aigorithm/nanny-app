/**
 * Minimal web stub for react-native-maps used during Vite preview builds. The
 * library ships JSX in .js files, which the preview bundler cannot parse, and
 * a native map has no web rendering anyway — a muted placeholder stands in
 * where the map would be so the surrounding layout can be judged.
 */
import React from 'react';
import { View } from 'react-native';

type AnyProps = { style?: unknown; children?: React.ReactNode; [key: string]: unknown };

function MapView({ style, children }: AnyProps) {
  return <View style={[style as never, { backgroundColor: '#e3d5ca' }]}>{children}</View>;
}

export function Marker(_props: AnyProps) {
  return null;
}

export const PROVIDER_GOOGLE = 'google';
export default MapView;
