import React from 'react';

import NannyShiftPromptModal from '@mobile/components/NannyShiftPromptModal';
import { useIsUpdateRequired } from '@mobile/hooks/useAppVersionCheck';
import { useUpdateSheetStore } from '@mobile/store/updateSheetStore';

/**
 * Mount once in the nanny tab layout so shift prompts render above all screens
 * (but never above the update-required blocker, and not while the optional
 * update sheet is up, so the two never stack).
 */
export default function NannyShiftPromptHost() {
  const updateRequired = useIsUpdateRequired();
  const updateSheetVisible = useUpdateSheetStore((s) => s.visible);
  if (updateRequired || updateSheetVisible) return null;
  return <NannyShiftPromptModal />;
}
