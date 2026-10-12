import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

/**
 * Whether the software keyboard is up. A composer pinned to the bottom edge
 * pads for the system's bottom bar only while the keyboard is down — the
 * keyboard covers that bar, so keeping the padding would leave a gap above it.
 */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}
