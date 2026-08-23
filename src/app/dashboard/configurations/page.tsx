'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Server,
  HardDrive,
  ShieldAlert,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Search,
  Plus,
  Globe,
  Lock,
  Cpu,
  Monitor,
  Wifi,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { useOrganization } from '@/lib/OrganizationContext';

interface ConfigurationItem {
  id: string;
  name: string;
  type: 'server' | 'workstation' | 'firewall' | 'switch' | 'router';
  hostname?: string | null;
  ipAddress?: string | null;
  os?: string | null;
  warrantyExpiry?: string | null;
  status: string;
  organizationName?: string;
}

interface ExpiryItem {
  id: string;
  name: string;
  type: 'warranty' | 'ssl' | 'domain';
  expiresAt: string;
  daysRemaining: number;
  href: string;
}

import { AgentScriptModal } from '@/components/AgentScriptModal';

export default function ConfigurationsPage() {
  const { selectedOrg } = useOrganization();
  const [servers, setServers] = useState<any[]>([]);
  const [sslCerts, setSslCerts] = useState<any[]>([]);
  const [domains, setDomains] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAgentModal, setShowAgentModal] = useState(false);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [expiryFilter, setExpiryFilter] = useState<'30' | '60' | '90' | 'all'>('90');

  useEffect(() => {
    fetchData();
  }, [selectedOrg]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const orgParam = selectedOrg?.id ? `?organizationId=${selectedOrg.id}` : '';
      const [serversRes, sslRes, domainsRes] = await Promise.all([
        fetch(`/api/servers${orgParam}`),
        fetch(`/api/ssl${orgParam}`),
        fetch(`/api/domains${orgParam}`),
      ]);

      if (serversRes.ok) {
        const data = await serversRes.json();
        setServers(data.items || data);
      }
      if (sslRes.ok) setSslCerts(await sslRes.json());
      if (domainsRes.ok) {
        const data = await domainsRes.json();
        setDomains(data.items || data);
      }
    } catch {
      // Error loading configurations
    } finally {
      setLoading(false);
    }
  };

  // Build Expiry Radar List
  const now = new Date();
  const expiryRadar: ExpiryItem[] = [];

  servers.forEach((s) => {
    if (s.warrantyExpiry) {
      const expDate = new Date(s.warrantyExpiry);
      const days = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
      if (days <= 90) {
        expiryRadar.push({
          id: s.id,
          name: `${s.name} (Warranty)`,
          type: 'warranty',
          expiresAt: s.warrantyExpiry,
          daysRemaining: days,
          href: `/dashboard/servers/${s.id}`,
        });
      }
    }
  });

  sslCerts.forEach((c) => {
    if (c.validTo) {
      const expDate = new Date(c.validTo);
      const days = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
      if (days <= 90) {
        expiryRadar.push({
          id: c.id,
          name: `${c.hostname} (SSL Cert)`,
          type: 'ssl',
          expiresAt: c.validTo,
          daysRemaining: days,
          href: `/dashboard/ssl/${c.id}`,
        });
      }
    }
  });

  domains.forEach((d) => {
    if (d.expiresAt) {
      const expDate = new Date(d.expiresAt);
      const days = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
      if (days <= 90) {
        expiryRadar.push({
          id: d.id,
          name: `${d.name} (Domain)`,
          type: 'domain',
          expiresAt: d.expiresAt,
          daysRemaining: days,
          href: `/dashboard/domains/${d.id}`,
        });
      }
    }
  });

  expiryRadar.sort((a, b) => a.daysRemaining - b.daysRemaining);

  const filteredExpiry = expiryRadar.filter((item) => {
    if (expiryFilter === '30') return item.daysRemaining <= 30;
    if (expiryFilter === '60') return item.daysRemaining <= 60;
    if (expiryFilter === '90') return item.daysRemaining <= 90;
    return true;
  });

  const filteredServers = servers.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.hostname && s.hostname.toLowerCase().includes(search.toLowerCase())) ||
    (s.ipAddress && s.ipAddress.includes(search))
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Configurations & Expiry Radar
          </h1>
          <p className="text-slate-500 text-sm">
            Unified IT Glue configurations inventory & hardware/SSL/domain expiry tracking
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowAgentModal(true)}
            className="btn-secondary flex items-center gap-1.5 text-xs font-semibold"
          >
            <Cpu className="w-3.5 h-3.5 text-blue-500" />
            Deploy Agent Script
          </button>
          <Link href="/dashboard/servers/new" className="btn-primary flex items-center gap-2 text-xs">
            <Plus className="w-4 h-4" />
            Add Configuration
          </Link>
        </div>
      </div>

      <AgentScriptModal
        isOpen={showAgentModal}
        onClose={() => setShowAgentModal(false)}
        organizationId={selectedOrg?.id}
      />

      {/* Expiry Radar Banner */}
      <div className="card p-5 border-l-4 border-amber-500 bg-gradient-to-r from-amber-500/5 to-transparent">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-600" />
            <h2 className="font-semibold text-slate-900 dark:text-white text-base">
              Expiry Radar (Next 90 Days)
            </h2>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300">
              {expiryRadar.length} items requiring attention
            </span>
          </div>

          <div className="flex items-center gap-1 text-xs">
            <span className="text-slate-500 mr-1 font-medium">Show:</span>
            {(['30', '60', '90', 'all'] as const).map((days) => (
              <button
                key={days}
                onClick={() => setExpiryFilter(days)}
                className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                  expiryFilter === days
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                }`}
              >
                {days === 'all' ? 'All' : `< ${days}d`}
              </button>
            ))}
          </div>
        </div>

        {filteredExpiry.length === 0 ? (
          <p className="text-xs text-slate-400 py-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 inline mr-1" />
            No warranties, SSL certs, or domains expiring in this window.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
            {filteredExpiry.slice(0, 6).map((item) => (
              <Link
                key={`${item.type}-${item.id}`}
                href={item.href}
                className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:shadow-md transition-all flex items-center justify-between group"
              >
                <div className="min-w-0 flex-1 pr-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 truncate">
                    {item.type === 'warranty' && <Server className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
                    {item.type === 'ssl' && <Lock className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
                    {item.type === 'domain' && <Globe className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />}
                    <span className="truncate">{item.name}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Expires: {formatDate(item.expiresAt)}
                  </div>
                </div>

                <span
                  className={`text-xs font-bold px-2 py-1 rounded-md flex-shrink-0 ${
                    item.daysRemaining <= 14
                      ? 'bg-red-100 text-red-700 dark:bg-red-950/80 dark:text-red-300 animate-pulse'
                      : item.daysRemaining <= 30
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                      : 'bg-blue-50 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300'
                  }`}
                >
                  {item.daysRemaining <= 0 ? 'EXPIRED' : `${item.daysRemaining} days`}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Configurations Table / Grid */}
      <div className="card p-5 space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search configurations by name, hostname, IP..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field pl-9 text-xs py-2"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center">
            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-blue-600 mx-auto" />
          </div>
        ) : filteredServers.length === 0 ? (
          <div className="text-center py-10 border rounded-lg border-dashed">
            <Cpu className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-600">No configurations found</p>
            <p className="text-xs text-slate-400 mt-1">Add servers, switches, or workstations to start tracking.</p>
          </div>
        ) : (
          <div className="divide-y border rounded-lg overflow-hidden">
            {filteredServers.map((server) => (
              <div
                key={server.id}
                className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                    <Server className="w-5 h-5" />
                  </div>
                  <div>
                    <Link
                      href={`/dashboard/servers/${server.id}`}
                      className="font-semibold text-sm text-slate-900 dark:text-white hover:text-blue-600 truncate block"
                    >
                      {server.name}
                    </Link>
                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                      {server.hostname && <span>Host: {server.hostname}</span>}
                      {server.ipAddress && <span>IP: {server.ipAddress}</span>}
                      {server.os && <span>OS: {server.os}</span>}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {server.warrantyExpiry && (
                    <div className="text-right text-xs">
                      <div className="text-slate-400 font-medium">Warranty Expiry</div>
                      <div className="text-slate-700 dark:text-slate-300 font-mono">
                        {formatDate(server.warrantyExpiry)}
                      </div>
                    </div>
                  )}
                  {(() => {
                    const ageDays = Math.floor((Date.now() - new Date(server.updatedAt).getTime()) / 86400000);
                    const fresh = ageDays < 7;
                    const stale = ageDays > 30;
                    return (
                      <span
                        className={`badge ${fresh ? 'badge-green' : stale ? 'badge-red' : 'badge-yellow'}`}
                        title={`Last updated ${ageDays} day${ageDays === 1 ? '' : 's'} ago`}
                      >
                        {fresh ? 'Fresh' : stale ? `Stale ${ageDays}d` : `${ageDays}d old`}
                      </span>
                    );
                  })()}
                  <span className="badge badge-green capitalize">{server.status || 'active'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
