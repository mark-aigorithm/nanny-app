import React from 'react';
import {
  View,
  Text,
  Pressable,
  Image,
  StyleSheet,
  StatusBar,
} from 'react-native';

// ASSUMPTION: Brand icon sourced from Figma CDN — expires in 7 days.
// Replace with bundled local asset (e.g. require('@mobile/assets/icon-leaf.png')) before production.
const IMG_BRAND_ICON = 'https://www.figma.com/api/mcp/asset/a4c1ecbd-a133-4ba7-95bf-02f9b3d17210';

// ASSUMPTION: 'Get Started' navigates to the Onboarding flow.
// Wire up navigation.navigate('Onboarding') once the navigation stack is configured.

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
        <View style={styles.brandIconContainer}>
          <Image source={{ uri: IMG_BRAND_ICON }} style={styles.brandIcon} resizeMode="contain" />
        </View>

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

        <Pressable style={styles.getStartedButton} onPress={onGetStarted}>
          <Text style={styles.getStartedText}>Get Started</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignSelf: 'stretch',
    backgroundColor: '#fcf9f7',
    flexDirection: 'column',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
    paddingTop: 80,
    paddingBottom: 48,
  },

  // Background decorative blobs
  blobTopLeft: {
    position: 'absolute',
    top: -60,
    left: -60,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: '#ebddd2',
    opacity: 0.35,
  },
  blobBottomRight: {
    position: 'absolute',
    bottom: -60,
    right: -60,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: '#97a591',
    opacity: 0.2,
  },

  // Center content
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  brandIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: '#f0edeb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandIcon: {
    width: 34,
    height: 34,
  },
  typographyCluster: {
    alignItems: 'center',
    gap: 8,
  },
  appName: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 32,
    letterSpacing: -0.8,
    color: '#1b1c1b',
    lineHeight: 32,
    textAlign: 'center',
  },
  tagline: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 16,
    letterSpacing: 0.4,
    color: '#444842',
    lineHeight: 24,
    textAlign: 'center',
  },

  // Footer
  footer: {
    alignItems: 'center',
    gap: 0,
  },
  paginationDots: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 48,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ebddd2',
  },
  dotActive: {
    backgroundColor: '#97a591',
  },
  getStartedButton: {
    width: '100%',
    height: 56,
    borderRadius: 24,
    backgroundColor: '#556251',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  getStartedText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 16,
    color: '#fff',
    lineHeight: 24,
    textAlign: 'center',
  },
});
