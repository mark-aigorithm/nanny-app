import React from 'react';
import {
  View,
  Text,
  StatusBar,
} from 'react-native';

import { Button } from '@mobile/components/ui';
import { styles } from './styles/splash-screen.styles';

interface Props {
  onGetStarted?: () => void;
}

export default function SplashScreen({ onGetStarted }: Props) {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Decorative background blobs */}
      <View style={styles.blobTopLeft} />
      <View style={styles.blobBottomRight} />

      {/* Center brand identity */}
      <View style={styles.centerContent}>
        <View style={styles.typographyCluster}>
          <Text style={styles.appName}>NannyMom</Text>
          <Text style={styles.tagline}>Care you can trust</Text>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.paginationDots}>
          <View style={[styles.dot, styles.dotActive]} />
          <View style={styles.dot} />
          <View style={styles.dot} />
        </View>

        <Button
          title="Get Started"
          onPress={onGetStarted ?? (() => {})}
          variant="primary"
          fullWidth
          style={styles.getStartedButton}
        />
      </View>
    </View>
  );
}
