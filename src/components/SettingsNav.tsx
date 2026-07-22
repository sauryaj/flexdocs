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
} from 'lucide-react';
import { cn } from '@/lib/utils';

const settingsNav = [
  { name: 'Profile Settings', href: '/dashboard/settings', icon: User },
  { name: '2FA / MFA', href: '/dashboard/settings/mfa', icon: Shield },
  { name: 'Sessions', href: '/dashboard/settings/sessions', icon: Activity },
  { name: 'API Keys', href: '/dashboard/settings/api-keys', icon: Key },
  { name: 'Webhooks', href: '/dashboard/settings/webhooks', icon: Zap },
  { name: 'Emergency Access', href: '/dashboard/settings/emergency-access', icon: Lock },
  { name: 'Import / Export', href: '/dashboard/settings/import-export', icon: FileBarChart },
  { name: 'Health Check', href: '/dashboard/settings/health', icon: HeartPulse },
  { name: 'API Docs', href: '/dashboard/settings/api-docs', icon: BookOpen },
  { name: 'Theme Presets', href: '/dashboard/settings/theme', icon: Palette },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav className="space-y-1 bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
      {settingsNav.map((item) => {
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
    </nav>
  );
}
