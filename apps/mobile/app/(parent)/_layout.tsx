import { Stack } from 'expo-router';

import RatingPromptHost from '@mobile/components/RatingPromptHost';
import RegisterPromptModal from '@mobile/components/RegisterPromptModal';
import IdUploadModal from '@mobile/components/IdUploadModal';
import { useReducedMotion } from '@mobile/hooks/useReducedMotion';

// A screen opened straight from a link or a notification still has the tabs
// underneath it, so back lands somewhere instead of leaving the app.
export const unstable_settings = { anchor: '(tabs)' };

/**
 * The parent area is a Stack over the (tabs) group: every detail screen and
 * flow (book/, packages/, chat/…) is pushed on top of the tabs, so back —
 * header or hardware — returns to the screen it was opened from.
 */
export default function ParentLayout() {
  const reducedMotion = useReducedMotion();

  return (
    <>
      <RegisterPromptModal />
      <IdUploadModal />
      <Stack screenOptions={{ headerShown: false, animation: reducedMotion ? 'none' : 'default' }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
      <RatingPromptHost />
    </>
  );
}
