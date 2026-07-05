import React from 'react';

import NannyShiftPromptModal from '@mobile/components/NannyShiftPromptModal';

/** Mount once in the nanny tab layout so shift prompts render above all screens. */
export default function NannyShiftPromptHost() {
  return <NannyShiftPromptModal />;
}
