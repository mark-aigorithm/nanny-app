import React, { useEffect, useRef, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@mobile/components/ui/text';
import { colors, spacing, typeScale } from '@mobile/theme';

interface Props {
  photos: string[];
  /** Index of the photo to show, or null when the viewer is closed. */
  index: number | null;
  onClose: () => void;
}

/**
 * A care-log photo on a dark backdrop at the screen's full size, uncropped.
 * With more than one photo, swiping sideways pages through them.
 */
export function CarePhotoViewer({ photos, index, onClose }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [current, setCurrent] = useState(index ?? 0);

  useEffect(() => {
    if (index !== null) setCurrent(index);
  }, [index]);

  if (index === null) return null;

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setCurrent(Math.round(event.nativeEvent.contentOffset.x / width));
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop} testID="care-log-entry.viewer">
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          // contentOffset is iOS-only, so open on the tapped photo once laid out.
          onLayout={() => scrollRef.current?.scrollTo({ x: index * width, animated: false })}
          onMomentumScrollEnd={onScrollEnd}
        >
          {photos.map((uri, i) => (
            <Image
              key={uri}
              source={{ uri }}
              style={{ width, height }}
              resizeMode="contain"
              accessibilityLabel={`Photo ${i + 1} of ${photos.length}`}
            />
          ))}
        </ScrollView>

        <View style={[styles.bar, { top: insets.top + spacing.sm }]}>
          {photos.length > 1 ? (
            <Text style={styles.counter}>{`${current + 1} of ${photos.length}`}</Text>
          ) : (
            <View />
          )}
          <Pressable
            onPress={onClose}
            style={styles.close}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close photo"
          >
            <Ionicons name="close" size={24} color={colors.white} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const CLOSE = 44;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.black,
  },
  bar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  counter: {
    ...typeScale.labelMd,
    color: colors.white,
  },
  close: {
    width: CLOSE,
    height: CLOSE,
    borderRadius: CLOSE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay,
  },
});
