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

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">System Settings</h1>
        <p className="text-slate-500 text-xs mt-1">Configure your personal profile, security keys, automations, and presets.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left Side Settings Navigation Pane */}
        <aside className="w-full lg:w-64 flex-shrink-0">
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
        </aside>

        {/* Right Side Settings Panel Area */}
        <main className="flex-1 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          {children}
        </main>
      </div>
    </div>
  );
}
