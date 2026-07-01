'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Building2,
  FileText,
  Key,
  Globe,
  Lock,
  Tag,
  Settings,
  ChevronLeft,
  Menu,
  Box,
  CheckSquare,
  Activity,
  FileStack,
  Users,
  FileBarChart,
  Shield,
  ChevronDown,
  Building,
  Network,
  Server,
  Cloud,
  CalendarClock,
  Zap,
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/lib/ThemeContext';
import { useOrganization, Organization } from '@/lib/OrganizationContext';

const navigation = [
  {
    label: 'Overview',
    items: [
      { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Resources',
    items: [
      { name: 'Documents', href: '/dashboard/documents', icon: FileText },
      { name: 'Templates', href: '/dashboard/templates', icon: FileStack },
      { name: 'Passwords', href: '/dashboard/passwords', icon: Key },
      { name: 'Domains', href: '/dashboard/domains', icon: Globe },
      { name: 'SSL Certs', href: '/dashboard/ssl', icon: Lock },
      { name: 'Assets', href: '/dashboard/assets', icon: Box },
      { name: 'Checklists', href: '/dashboard/checklists', icon: CheckSquare },
      { name: 'Tags', href: '/dashboard/tags', icon: Tag },
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      { name: 'Network', href: '/dashboard/network', icon: Network },
      { name: 'Servers', href: '/dashboard/servers', icon: Server },
      { name: 'Cloud', href: '/dashboard/cloud', icon: Cloud },
      { name: 'Maintenance', href: '/dashboard/maintenance', icon: CalendarClock },
      { name: 'Status Pages', href: '/dashboard/status', icon: Activity },
      { name: 'Automation', href: '/dashboard/automation', icon: Zap },
      { name: '  Schedules', href: '/dashboard/automation/schedules', icon: CalendarClock },
      { name: '  Changes', href: '/dashboard/automation/changes', icon: Activity },
      { name: '  Docker', href: '/dashboard/automation/docker', icon: Box },
      { name: '  Cloud Costs', href: '/dashboard/automation/costs', icon: FileBarChart },
    ],
  },
  {
    label: 'Admin',
    items: [
      { name: 'Organizations', href: '/dashboard/organizations', icon: Building2 },
      { name: 'Activity', href: '/dashboard/activity', icon: Activity },
      { name: 'Users', href: '/dashboard/users', icon: Users },
      { name: 'Reports', href: '/dashboard/reports', icon: FileBarChart },
      { name: 'Backups', href: '/dashboard/backups', icon: FileStack },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  useTheme();
  const { selectedOrg, setSelectedOrg } = useOrganization();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoadingOrgs(true);
    fetch('/api/organizations')
      .then((res) => res.json())
      .then((data) => {
        setOrganizations(Array.isArray(data) ? data : data.organizations || []);
      })
      .catch(() => {})
      .finally(() => setLoadingOrgs(false));
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOrgDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isActive = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(href));

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg"
        style={{ backgroundColor: 'var(--accent)', color: 'white' }}
      >
        <Menu className="w-5 h-5" />
      </button>

      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed left-0 top-0 h-full z-50 transition-all duration-300 flex flex-col',
          collapsed ? 'w-[60px]' : 'w-60',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
        style={{ backgroundColor: 'var(--sidebar-bg)' }}
      >
        {/* Logo */}
        <div
          className={cn(
            'flex items-center h-14 px-3',
            collapsed ? 'justify-center' : 'justify-between'
          )}
          style={{ borderBottom: '1px solid var(--sidebar-border)' }}
        >
          {!collapsed && (
            <Link href="/dashboard" className="flex items-center gap-2.5">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs text-white"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                FD
              </div>
              <span className="font-semibold text-[15px] text-white tracking-tight">
                FlexDocs
              </span>
            </Link>
          )}
          {collapsed && (
            <Link
              href="/dashboard"
              className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs text-white"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              FD
            </Link>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 rounded-md hidden lg:flex items-center justify-center transition-colors"
            style={{ color: 'var(--sidebar-text)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#cbd5e1')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '')}
          >
            <ChevronLeft
              className={cn(
                'w-4 h-4 transition-transform duration-200',
                collapsed && 'rotate-180'
              )}
            />
          </button>
        </div>

        {/* Organization Selector */}
        {!collapsed && (
          <div className="px-2 pt-3 pb-1" ref={dropdownRef}>
            <button
              onClick={() => setOrgDropdownOpen(!orgDropdownOpen)}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm font-medium transition-all duration-150 hover:bg-white/5"
              style={{ color: 'var(--sidebar-text)' }}
            >
              <div
                className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: selectedOrg ? 'var(--accent)' : 'var(--sidebar-bg-active)' }}
              >
                <Building className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="flex-1 text-left truncate">
                {selectedOrg ? selectedOrg.name : 'All Organizations'}
              </span>
              <ChevronDown
                className={cn(
                  'w-3.5 h-3.5 transition-transform duration-200',
                  orgDropdownOpen && 'rotate-180'
                )}
              />
            </button>

            {orgDropdownOpen && (
              <div
                className="mt-1 rounded-lg shadow-xl overflow-hidden max-h-60 overflow-y-auto"
                style={{
                  backgroundColor: 'var(--card-bg)',
                  border: '1px solid var(--card-border)',
                }}
              >
                <button
                  onClick={() => {
                    setSelectedOrg(null);
                    setOrgDropdownOpen(false);
                  }}
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm transition-colors hover:bg-[var(--surface-2)]',
                    !selectedOrg && 'font-medium'
                  )}
                  style={{ color: !selectedOrg ? 'var(--accent)' : 'var(--foreground)' }}
                >
                  All Organizations
                </button>
                {organizations.map((org) => (
                  <button
                    key={org.id}
                    onClick={() => {
                      setSelectedOrg(org);
                      setOrgDropdownOpen(false);
                    }}
                    className={cn(
                      'w-full text-left px-3 py-2 text-sm transition-colors hover:bg-[var(--surface-2)]',
                      selectedOrg?.id === org.id && 'font-medium'
                    )}
                    style={{ color: selectedOrg?.id === org.id ? 'var(--accent)' : 'var(--foreground)' }}
                  >
                    {org.name}
                  </button>
                ))}
                {organizations.length === 0 && !loadingOrgs && (
                  <div className="px-3 py-2 text-sm" style={{ color: 'var(--muted)' }}>
                    No organizations yet
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Navigation groups */}
        <nav className="flex-1 px-2 py-3 overflow-y-auto">
          {navigation.map((group, gi) => (
            <div key={group.label}>
              {gi > 0 && <div className="sidebar-divider" />}
              {!collapsed && <div className="sidebar-label">{group.label}</div>}
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn('sidebar-nav-item', isActive(item.href) && 'active')}
                    title={collapsed ? item.name : undefined}
                  >
                    <item.icon className="w-4 h-4 flex-shrink-0" />
                    {!collapsed && <span>{item.name}</span>}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Settings — bottom */}
        <div className="px-2 pb-3 pt-2" style={{ borderTop: '1px solid var(--sidebar-border)' }}>
          {!collapsed && <div className="sidebar-label">Settings</div>}
          <div className="space-y-0.5">
            <Link
              href="/dashboard/settings"
              className={cn('sidebar-nav-item', pathname === '/dashboard/settings' && 'active')}
              title={collapsed ? 'General' : undefined}
            >
              <Settings className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span>General</span>}
            </Link>
            <Link
              href="/dashboard/settings/mfa"
              className={cn('sidebar-nav-item', pathname === '/dashboard/settings/mfa' && 'active')}
              title={collapsed ? '2FA / MFA' : undefined}
            >
              <Shield className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span>2FA / MFA</span>}
            </Link>
            <Link
              href="/dashboard/settings/sessions"
              className={cn('sidebar-nav-item', pathname === '/dashboard/settings/sessions' && 'active')}
              title={collapsed ? 'Sessions' : undefined}
            >
              <Activity className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span>Sessions</span>}
            </Link>
            <Link
              href="/dashboard/settings/api-keys"
              className={cn('sidebar-nav-item', pathname === '/dashboard/settings/api-keys' && 'active')}
              title={collapsed ? 'API Keys' : undefined}
            >
              <Key className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span>API Keys</span>}
            </Link>
            <Link
              href="/dashboard/settings/webhooks"
              className={cn('sidebar-nav-item', pathname === '/dashboard/settings/webhooks' && 'active')}
              title={collapsed ? 'Webhooks' : undefined}
            >
              <Zap className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span>Webhooks</span>}
            </Link>
            <Link
              href="/dashboard/settings/emergency-access"
              className={cn('sidebar-nav-item', pathname === '/dashboard/settings/emergency-access' && 'active')}
              title={collapsed ? 'Emergency Access' : undefined}
            >
              <Lock className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span>Emergency Access</span>}
            </Link>
            <Link
              href="/dashboard/settings/import-export"
              className={cn('sidebar-nav-item', pathname === '/dashboard/settings/import-export' && 'active')}
              title={collapsed ? 'Import / Export' : undefined}
            >
              <FileBarChart className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span>Import / Export</span>}
            </Link>
            <Link
              href="/dashboard/settings/health"
              className={cn('sidebar-nav-item', pathname === '/dashboard/settings/health' && 'active')}
              title={collapsed ? 'Health Check' : undefined}
            >
              <Activity className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span>Health Check</span>}
            </Link>
            <Link
              href="/dashboard/settings/api-docs"
              className={cn('sidebar-nav-item', pathname === '/dashboard/settings/api-docs' && 'active')}
              title={collapsed ? 'API Docs' : undefined}
            >
              <FileText className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span>API Docs</span>}
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
}
