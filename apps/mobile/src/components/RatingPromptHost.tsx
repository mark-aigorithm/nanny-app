import React from 'react';

import RatingPromptSheet from '@mobile/components/RatingPromptSheet';
import { useIsUpdateRequired } from '@mobile/hooks/useAppVersionCheck';
import { usePendingRating } from '@mobile/hooks/usePendingRating';

/**
 * Mount once in the parent tab layout. Detects an unrated completed booking and
 * renders the mandatory rating sheet above all parent screens (but never above
 * the update-required blocker).
 */
export default function RatingPromptHost() {
  usePendingRating();
  const updateRequired = useIsUpdateRequired();
  if (updateRequired) return null;
  return <RatingPromptSheet />;
}
