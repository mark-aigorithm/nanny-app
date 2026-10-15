import React from 'react';
import { View } from 'react-native';

import { Text } from '@mobile/components/ui/text';
import { styles } from './chat.styles';

interface MessageBubbleProps {
  content: string;
  /** True for the signed-in user's own messages (right, filled). */
  sent: boolean;
  time: string;
}

export function MessageBubble({ content, sent, time }: MessageBubbleProps) {
  return (
    <View style={[styles.messageBubbleWrap, sent ? styles.messageSent : styles.messageReceived]}>
      <View style={[styles.messageBubble, sent ? styles.bubbleSent : styles.bubbleReceived]}>
        <Text style={[styles.messageText, sent ? styles.messageTextSent : styles.messageTextReceived]}>
          {content}
        </Text>
      </View>
      <View style={[styles.timeRow, sent ? styles.timeRowSent : styles.timeRowReceived]}>
        <Text style={styles.timeText}>{time}</Text>
      </View>
    </View>
  );
}
