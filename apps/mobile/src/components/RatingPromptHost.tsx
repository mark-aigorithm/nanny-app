import React from 'react';

import RatingPromptSheet from '@mobile/components/RatingPromptSheet';
import { usePendingRating } from '@mobile/hooks/usePendingRating';

/**
 * Mount once in the parent tab layout. Detects an unrated completed booking and
 * renders the mandatory rating sheet above all parent screens.
 */
export default function RatingPromptHost() {
  usePendingRating();
  return <RatingPromptSheet />;
}
