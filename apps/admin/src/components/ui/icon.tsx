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
  Megaphone,
  Images,
  MessagesSquare,
  Store,
  Video,
  Settings,
  ShieldCheck,
  Smartphone,
  // Chrome
  Menu as MenuIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Bell,
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  MoreVertical,
  LogOut,
  X,
  // Row actions
  Check,
  Copy,
  Ban,
  Pencil,
  Trash2,
  Send,
  Power,
  Eye,
  Lock,
  Tags,
  Plus,
  // Feedback
  CircleAlert,
  CircleCheck,
  CircleOff,
  Info,
  RefreshCw,
  TriangleAlert,
  // Configuration summary
  Clock,
  Hourglass,
  CalendarX2,
  MapPin,
  Mail,
  Briefcase,
  BellRing,
  Phone,
  // Reporting
  Wallet,
  Users,
  UsersRound,
  ClipboardList,
  // Care Points
  Gift,
  Coins,
  History,
  // Search fields
  Search,
  // Survey preview (rating questions)
  Star,
} from 'lucide-react';

/** Standard icon sizes (px). */
export const ICON_SIZE = {
  nav: 18,
  menu: 16,
  inline: 16,
  stat: 22,
  state: 26,
} as const;
