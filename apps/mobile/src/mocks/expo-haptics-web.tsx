/**
 * Minimal web stub for expo-haptics used during Vite preview builds. The real
 * package pulls in expo-modules-core, whose .ts declaration files the preview
 * bundler can't handle — and a browser has no haptic engine anyway.
 * `lib/haptics` already skips web; this only has to resolve.
 */
export enum ImpactFeedbackStyle {
  Light = 'light',
  Medium = 'medium',
  Heavy = 'heavy',
}

export async function impactAsync(_style?: ImpactFeedbackStyle): Promise<void> {}

export async function selectionAsync(): Promise<void> {}
