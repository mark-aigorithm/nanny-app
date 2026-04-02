/**
 * NannyMom Design System
 * Single source of truth for colors, typography, spacing, and radii.
 */

export const colors = {
  primary: '#137FEC',
  communityPink: '#EA57A1',
  careMint: '#A8E6CF',
  nannyGreen: '#2D9B6F',

  // Activity color coding
  activityMeal: '#FFB347',
  activityNap: '#C3B1E1',
  activityDiaper: '#A8E6CF',
  activityPlay: '#FFE08A',

  // Neutrals
  background: '#FFFFFF',
  surface: '#F7F8FA',
  textPrimary: '#1A1A2E',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',

  // Semantic
  error: '#EF4444',
  success: '#22C55E',
  warning: '#F59E0B',

  // UI
  border: '#E5E7EB',
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(0,0,0,0.4)',
  badgeRed: '#EF4444',
} as const;

export const fonts = {
  regular: 'System',
  medium: 'System',
  semiBold: 'System',
  bold: 'System',
} as const;

export const fontSizes = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  full: 9999,
} as const;

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
} as const;

const theme = { colors, fonts, fontSizes, spacing, radii, shadows } as const;
export type Theme = typeof theme;
export default theme;
