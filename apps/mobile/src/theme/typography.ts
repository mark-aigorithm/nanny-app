import type { TextStyle } from 'react-native';

export const fontFamily = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semiBold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extraBold: 'Manrope_800ExtraBold',
} as const;

export const typeScale = {
  displayLg: {
    fontFamily: fontFamily.bold,
    fontSize: 32,
    letterSpacing: -0.8,
  } as TextStyle,
  displayMd: {
    fontFamily: fontFamily.bold,
    fontSize: 28,
    letterSpacing: -0.7,
  } as TextStyle,
  displaySm: {
    fontFamily: fontFamily.bold,
    fontSize: 26,
    letterSpacing: -0.6,
  } as TextStyle,
  headingLg: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
  } as TextStyle,
  headingMd: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    letterSpacing: -0.9,
  } as TextStyle,
  headingSm: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    letterSpacing: -0.4,
  } as TextStyle,
  bodyLg: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 24,
  } as TextStyle,
  bodyMd: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 22,
  } as TextStyle,
  bodySm: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19.5,
  } as TextStyle,
  labelLg: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
  } as TextStyle,
  labelMd: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
  } as TextStyle,
  labelSm: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    lineHeight: 19.5,
  } as TextStyle,
  caption: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
  } as TextStyle,
  captionBold: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
  } as TextStyle,
  overline: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  } as TextStyle,
} as const;
