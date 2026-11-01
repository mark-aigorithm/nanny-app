import { renderHook } from '@testing-library/react-native';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, ScrollView } from 'react-native';

import { useClampedScroll } from '@mobile/hooks/useClampedScroll';

function setUp(viewport: number, scrolledTo: number) {
  const { result } = renderHook(() => useClampedScroll());
  const scrollTo = jest.fn();
  (result.current.ref as { current: unknown }).current = { scrollTo } as unknown as ScrollView;
  result.current.onLayout({ nativeEvent: { layout: { height: viewport } } } as LayoutChangeEvent);
  result.current.onScroll({
    nativeEvent: { contentOffset: { x: 0, y: scrolledTo } },
  } as NativeSyntheticEvent<NativeScrollEvent>);
  return { hook: result.current, scrollTo };
}

it('pulls the offset back when the content shrinks below it', () => {
  const { hook, scrollTo } = setUp(600, 900);
  hook.onContentSizeChange(360, 700);
  expect(scrollTo).toHaveBeenCalledWith({ y: 100, animated: false });
});

it('goes to the top when the content now fits the screen', () => {
  const { hook, scrollTo } = setUp(600, 900);
  hook.onContentSizeChange(360, 400);
  expect(scrollTo).toHaveBeenCalledWith({ y: 0, animated: false });
});

it('leaves the offset alone when the content still reaches it', () => {
  const { hook, scrollTo } = setUp(600, 300);
  hook.onContentSizeChange(360, 1200);
  expect(scrollTo).not.toHaveBeenCalled();
});
