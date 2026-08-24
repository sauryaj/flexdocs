'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  User,
  Shield,
  Activity,
  Key,
  Zap,
  Lock,
  FileBarChart,
  HeartPulse,
  BookOpen,
  Palette,
  Bell,
  Cloud,
  UsersRound,
  LayoutGrid,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface SettingsNavItem {
  name: string;
  href: string;
  icon: typeof User;
  /** Only show for admin/editor roles */
  staffOnly?: boolean;
}

interface SettingsNavGroup {
  label: string;
  items: SettingsNavItem[];
}

const settingsNav: SettingsNavGroup[] = [
  {
    label: 'Account',
    items: [
      { name: 'Profile', href: '/dashboard/settings', icon: User },
      { name: 'Appearance', href: '/dashboard/settings/theme', icon: Palette },
      { name: 'Notifications', href: '/dashboard/settings/notifications', icon: Bell },
    ],
  },
  {
    label: 'Security',
    items: [
      { name: 'Two-Factor Auth', href: '/dashboard/settings/mfa', icon: Shield },
      { name: 'Sessions', href: '/dashboard/settings/sessions', icon: Activity },
      { name: 'Emergency Access', href: '/dashboard/settings/emergency-access', icon: Lock },
      { name: 'Password Health', href: '/dashboard/settings/password-health', icon: ShieldCheck },
    ],
  },
  {
    label: 'Workspace',
    items: [
      { name: 'Members', href: '/dashboard/settings/members', icon: UsersRound, staffOnly: true },
      { name: 'Integrations', href: '/dashboard/settings/integrations', icon: Cloud, staffOnly: true },
      { name: 'Asset Layouts', href: '/dashboard/asset-layouts', icon: LayoutGrid, staffOnly: true },
      { name: 'API Keys', href: '/dashboard/settings/api-keys', icon: Key },
      { name: 'Webhooks', href: '/dashboard/settings/webhooks', icon: Zap, staffOnly: true },
      { name: 'Import / Export', href: '/dashboard/settings/import-export', icon: FileBarChart },
    ],
  },
  {
    label: 'System',
    items: [
      { name: 'Health Check', href: '/dashboard/settings/health', icon: HeartPulse, staffOnly: true },
      { name: 'API Docs', href: '/dashboard/settings/api-docs', icon: BookOpen },
    ],
  },
];

export function SettingsNav() {
  const pathname = usePathname();
  const [isStaff, setIsStaff] = useState(false);

  useEffect(() => {
    fetch('/api/me/org-scope')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setIsStaff(d?.mode === 'all'))
      .catch(() => {});
  }, []);

  return (
    <nav
      className="space-y-4 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs"
      aria-label="Settings sections"
    >
      {settingsNav.map((group) => {
        const items = group.items.filter((item) => !item.staffOnly || isStaff);
        if (items.length === 0) return null;
        return (
          <div key={group.label}>
            <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {items.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-all',
                      active
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                    )}
                  >
                    <item.icon className="w-4 h-4 flex-shrink-0" />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
