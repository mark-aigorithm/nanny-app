import React from 'react';
import { View } from 'react-native';

import { Text } from '@mobile/components/ui/text';
import { formatDateDivider } from './groupMessagesByDay';
import { styles } from './chat.styles';

export function DateDivider({ date }: { date: string }) {
  return (
    <View style={styles.dateDividerWrap}>
      <View style={styles.dateDivider}>
        <Text style={styles.dateDividerText}>{formatDateDivider(date)}</Text>
      </View>
    </View>
  );
}
