import React from 'react';

import RatingPromptSheet from '@mobile/components/RatingPromptSheet';
import { useIsUpdateRequired } from '@mobile/hooks/useAppVersionCheck';
import { usePendingRating } from '@mobile/hooks/usePendingRating';
import { useUpdateSheetStore } from '@mobile/store/updateSheetStore';

/**
 * Mount once in the parent tab layout. Detects an unrated completed booking and
 * renders the mandatory rating sheet above all parent screens (but never above
 * the update-required blocker, and not while the optional update sheet is up,
 * so the two never stack).
 */
export default function RatingPromptHost() {
  usePendingRating();
  const updateRequired = useIsUpdateRequired();
  const updateSheetVisible = useUpdateSheetStore((s) => s.visible);
  if (updateRequired || updateSheetVisible) return null;
  return <RatingPromptSheet />;
}
