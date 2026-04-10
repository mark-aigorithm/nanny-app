import type { Ionicons } from '@expo/vector-icons';

export interface PromoCard {
  id: string;
  title: string;
  subtitle: string;
  cta: string;
  image: string;
}

export interface QuickAction {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  bgColor: string;
  iconColor: string;
  route: string;
}
