import { useCallback, useRef } from 'react';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, ScrollView } from 'react-native';

/**
 * Keeps a ScrollView's offset inside its content when the content shrinks.
 *
 * Android leaves the old offset in place when content gets shorter, so a list
 * that was scrolled down and then emptied (a booking leaving Upcoming, a
 * banner going away) shows blank space with everything above it out of reach
 * until she happens to drag. Spread the returned props on the ScrollView.
 */
export function useClampedScroll() {
  const ref = useRef<ScrollView>(null);
  const offsetY = useRef(0);
  const viewportHeight = useRef(0);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    offsetY.current = event.nativeEvent.contentOffset.y;
  }, []);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    viewportHeight.current = event.nativeEvent.layout.height;
  }, []);

  const onContentSizeChange = useCallback((_width: number, height: number) => {
    const maxOffset = Math.max(0, height - viewportHeight.current);
    if (offsetY.current > maxOffset) {
      offsetY.current = maxOffset;
      ref.current?.scrollTo({ y: maxOffset, animated: false });
    }
  }, []);

  return { ref, onScroll, onLayout, onContentSizeChange, scrollEventThrottle: 16 };
}
