import { Image, View, Text, StyleSheet } from 'react-native';

import { colors, radii } from '@mobile/lib/theme';

type AvatarProps = {
  uri?: string;
  name?: string;
  size?: number;
  showBadge?: boolean;
  badgeColor?: string;
};

export function Avatar({ uri, name, size = 40, showBadge, badgeColor = colors.success }: AvatarProps) {
  const initials = name
    ? name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  return (
    <View style={[styles.wrapper, { width: size, height: size }]}>
      {uri ? (
        <Image source={{ uri }} style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]} />
      ) : (
        <View style={[styles.fallback, { width: size, height: size, borderRadius: size / 2 }]}>
          <Text style={[styles.initials, { fontSize: size * 0.38 }]}>{initials}</Text>
        </View>
      )}
      {showBadge && (
        <View style={[styles.badge, { backgroundColor: badgeColor, width: size * 0.3, height: size * 0.3, borderRadius: size * 0.15 }]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'relative' },
  image: { resizeMode: 'cover' },
  fallback: {
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  initials: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  badge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    borderWidth: 2,
    borderColor: colors.white,
  },
});
