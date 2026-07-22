/**
 * Centralised lucide icon set + sizing convention so icon usage stays
 * consistent across the admin app. Import icons from here, not directly
 * from 'lucide-react', and prefer the size constants below.
 */
export type { LucideIcon } from 'lucide-react';

export {
  // Navigation
  LayoutDashboard,
  CalendarClock,
  UserPlus,
  Ticket,
  Sparkles,
  BadgeCheck,
  Package,
  Video,
  Settings,
  ShieldCheck,
  // Chrome
  Menu as MenuIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Bell,
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  MoreVertical,
  LogOut,
  X,
  // Row actions
  Check,
  Ban,
  Pencil,
  Trash2,
  Power,
  Eye,
  Tags,
  Plus,
  // Feedback
  CircleAlert,
  CircleCheck,
  Info,
  RefreshCw,
  // Reporting
  Wallet,
  Users,
  ClipboardList,
  Receipt,
  // Care Points
  Gift,
  Coins,
  History,
} from 'lucide-react';

/** Standard icon sizes (px). */
export const ICON_SIZE = {
  nav: 18,
  menu: 16,
  inline: 16,
  stat: 22,
  state: 26,
} as const;
