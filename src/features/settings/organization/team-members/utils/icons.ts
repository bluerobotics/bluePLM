/**
 * Type-safe Lucide icon lookup utility
 * 
 * This module provides a curated, type-safe registry of icons
 * used in team-members settings. Instead of using `as any` to
 * dynamically access Lucide icons, we use a typed registry.
 */
import type { LucideIcon } from 'lucide-react'
import {
  // Team icons
  Users,
  UserCircle,
  Building2,
  Boxes,
  Layers,
  Globe,
  Rocket,
  Star,
  Heart,
  Zap,
  Target,
  Flag,
  Crown,
  Award,
  Medal,
  Trophy,
  // Role icons
  Shield,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Key,
  Eye,
  EyeOff,
  // Title icons
  Briefcase,
  GraduationCap,
  Wrench,
  Hammer,
  Cog,
  Settings,
  Code,
  Terminal,
  Database,
  Server,
  Cloud,
  HardDrive,
  Cpu,
  Monitor,
  Laptop,
  Smartphone,
  // User icons
  User,
  UserPlus,
  UserMinus,
  UserCheck,
  UserX,
  CircleUser,
  // Common icons
  Folder,
  FolderOpen,
  File,
  FileText,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Clock,
  Bell,
  MessageSquare,
  Send,
  Check,
  X,
  Plus,
  Minus,
  Edit,
  Trash2,
  Copy,
  Link,
  ExternalLink,
  Download,
  Upload,
  Search,
  Filter,
  SortAsc,
  SortDesc,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  MoreHorizontal,
  MoreVertical,
  Menu,
  Grid,
  List,
  Layout,
  Home,
  Activity,
  BarChart,
  PieChart,
  TrendingUp,
  Sparkles,
  Lightbulb
} from 'lucide-react'

/**
 * Registry of allowed icon names mapped to their components.
 * Add new icons here as needed.
 */
export const ICON_REGISTRY: Record<string, LucideIcon> = {
  // Team icons
  Users,
  UserCircle,
  Building2,
  Boxes,
  Layers,
  Globe,
  Rocket,
  Star,
  Heart,
  Zap,
  Target,
  Flag,
  Crown,
  Award,
  Medal,
  Trophy,
  // Role icons
  Shield,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Key,
  Eye,
  EyeOff,
  // Title icons
  Briefcase,
  GraduationCap,
  Wrench,
  Hammer,
  Cog,
  Settings,
  Code,
  Terminal,
  Database,
  Server,
  Cloud,
  HardDrive,
  Cpu,
  Monitor,
  Laptop,
  Smartphone,
  // User icons
  User,
  UserPlus,
  UserMinus,
  UserCheck,
  UserX,
  CircleUser,
  // Common icons
  Folder,
  FolderOpen,
  File,
  FileText,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Clock,
  Bell,
  MessageSquare,
  Send,
  Check,
  X,
  Plus,
  Minus,
  Edit,
  Trash2,
  Copy,
  Link,
  ExternalLink,
  Download,
  Upload,
  Search,
  Filter,
  SortAsc,
  SortDesc,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  MoreHorizontal,
  MoreVertical,
  Menu,
  Grid,
  List,
  Layout,
  Home,
  Activity,
  BarChart,
  PieChart,
  TrendingUp,
  Sparkles,
  Lightbulb
}

/** Type representing all valid icon names */
export type IconName = keyof typeof ICON_REGISTRY

/**
 * Get a Lucide icon component by name with type safety.
 * Returns the fallback icon if the name is not in the registry.
 * 
 * @param iconName - The name of the icon (e.g., 'Users', 'Shield')
 * @param fallback - Fallback icon component (defaults to Users)
 * @returns The Lucide icon component
 * 
 * @example
 * ```tsx
 * const Icon = getIcon(team.icon, Users)
 * return <Icon size={16} />
 * ```
 */
export function getIcon(iconName: string | undefined | null, fallback: LucideIcon = Users): LucideIcon {
  if (!iconName) return fallback
  return ICON_REGISTRY[iconName] ?? fallback
}

/**
 * Get an icon for teams (defaults to Users)
 */
export function getTeamIcon(iconName: string | undefined | null): LucideIcon {
  return getIcon(iconName, Users)
}

/**
 * Get an icon for workflow roles (defaults to Shield)
 */
export function getRoleIcon(iconName: string | undefined | null): LucideIcon {
  return getIcon(iconName, Shield)
}

/**
 * Get an icon for job titles (defaults to Briefcase)
 */
export function getTitleIcon(iconName: string | undefined | null): LucideIcon {
  return getIcon(iconName, Briefcase)
}

/**
 * Check if an icon name is valid (exists in registry)
 */
export function isValidIconName(iconName: string): iconName is IconName {
  return iconName in ICON_REGISTRY
}

/**
 * Get all available icon names for picker components
 */
export function getAvailableIconNames(): IconName[] {
  return Object.keys(ICON_REGISTRY) as IconName[]
}
