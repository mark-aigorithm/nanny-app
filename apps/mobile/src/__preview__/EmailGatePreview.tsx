/* TEMPORARY — visual-validation harness. Delete after screenshots. */
import React from 'react';
import { View } from 'react-native';

import EmailVerifyModal from '@mobile/components/EmailVerifyModal';
import { useEmailGateStore } from '@mobile/store/emailGateStore';
import { colors } from '@mobile/theme';
import { PreviewProviders } from './harness';

useEmailGateStore.setState({ visible: true });

export default function EmailGatePreview() {
  return (
    <PreviewProviders>
      {/* The modal floats over whatever screen the mother tapped Book care on;
          a plain background stands in for it. */}
      <View style={{ flex: 1, backgroundColor: colors.background }} />
      <EmailVerifyModal />
    </PreviewProviders>
  );
}
