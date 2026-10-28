import {
  Building2,
  FileUp,
  Landmark,
  LayoutDashboard,
  ReceiptText,
  Scale,
  Settings,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { et } from '@/i18n/et';

export type Section = keyof typeof et.nav;

export interface NavItem {
  section: Section;
  path: string;
  icon: LucideIcon;
}

/** Sidebar order and Estonian URL slugs. */
export const navItems: readonly NavItem[] = [
  { section: 'dashboard', path: '/', icon: LayoutDashboard },
  { section: 'properties', path: '/kinnisvara', icon: Building2 },
  { section: 'tenants', path: '/uurnikud', icon: Users },
  { section: 'transactions', path: '/tulud-kulud', icon: ReceiptText },
  { section: 'loans', path: '/laenud', icon: Landmark },
  { section: 'forecast', path: '/prognoos', icon: TrendingUp },
  { section: 'compare', path: '/vordlus', icon: Scale },
  { section: 'import', path: '/import', icon: FileUp },
  { section: 'settings', path: '/seaded', icon: Settings },
];
