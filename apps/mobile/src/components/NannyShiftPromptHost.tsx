import React from 'react';

import NannyShiftPromptModal from '@mobile/components/NannyShiftPromptModal';
import { useIsUpdateRequired } from '@mobile/hooks/useAppVersionCheck';

/**
 * Mount once in the nanny tab layout so shift prompts render above all screens
 * (but never above the update-required blocker).
 */
export default function NannyShiftPromptHost() {
  const updateRequired = useIsUpdateRequired();
  if (updateRequired) return null;
  return <NannyShiftPromptModal />;
}
