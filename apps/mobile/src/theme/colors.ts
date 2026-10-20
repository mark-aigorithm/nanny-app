const palette = {
  // Primary palette
  primary: '#97a591',
  primaryDark: '#556251',
  primaryMuted: 'rgba(151,165,145,0.15)',

  // Backgrounds
  background: '#fdfaf8',
  surface: '#ffffff',
  surfaceMuted: '#f0edeb',

  // Taupe / warm neutrals
  taupe: '#e3d5ca',
  taupeLight: 'rgba(227,213,202,0.5)',
  taupeHeader: '#e3d5ca',
  warmBorder: '#ebddd2',
  warmLight: '#f5dec8',
  warmSubtle: '#f0e9df',

  // Text
  textPrimary: '#1b1c1b',
  textSecondary: '#444842',
  textMuted: '#7a7a7a',
  textTertiary: '#6b6158',
  textDark: '#2e2e2e',
  textPlaceholder: '#b0a89e',

  // Activity type tints
  tintPurple: '#ddd6ec',
  tintYellow: '#f5eac8',
  tintAmber: '#8b6914',

  // Bronze accent
  bronze: '#b89d78',

  // Neutral fills (skeletons, dividers, disabled)
  neutralLight: '#e5e2e0',
  errorLight: '#fdf0ee',

  // Accent / semantic
  gold: '#f5a623',
  goldWarm: '#c4a882',
  error: '#c0634a',
  errorDark: '#ba1a1a',
  favorited: '#e57373',
  success: '#6a9b6a',
  successDark: '#3d6b3d',
  successLight: '#d4e8d4',
  successText: '#2e5e2e',
  liveGreen: '#4ade80',

  // Utility
  white: '#ffffff',
  black: '#000000',
  transparent: 'transparent',
  overlay: 'rgba(0,0,0,0.4)',
  overlayLight: 'rgba(0,0,0,0.15)',
  borderSubtle: 'rgba(0,0,0,0.06)',
} as const;

export const colors = {
  ...palette,
  // Filled-button roles. Aliases of palette values, not new hues. The sage
  // `primary` stays the brand accent (active states, icons, tints), but white on
  // it is 2.59:1, so a filled CTA uses the deep sage (6.5:1, UI-sweep rule
  // "an enabled button never looks disabled"). Disabled is the neutral fill the
  // palette keeps for it, with a muted label, so it never reads as enabled.
  primaryAction: palette.primaryDark,
  onPrimaryAction: palette.white,
  actionDisabled: palette.neutralLight,
  onActionDisabled: palette.textMuted,
} as const;

export type ColorToken = keyof typeof colors;
