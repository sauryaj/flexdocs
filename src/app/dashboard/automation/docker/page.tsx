'use client';

import { useState, useEffect } from 'react';
import { useOrganization } from '@/lib/OrganizationContext';
import { useToast } from '@/components/Toast';
import { Box, RefreshCw, Loader2, Server, HardDrive, Network, Database } from 'lucide-react';

interface DockerHost {
  id: string;
  name: string;
  endpoint: string;
  type: string;
  status: string;
  version: string;
  containers: number;
  images: number;
  networks: number;
  volumes: number;
  metadata: string;
  lastScanAt: string | null;
  containers_data?: { id: string; name: string; image: string; status: string; state: string }[];
}

export default function DockerPage() {
  const { selectedOrg } = useOrganization();
  const { toast } = useToast();
  const [hosts, setHosts] = useState<DockerHost[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [endpoint, setEndpoint] = useState('');

  useEffect(() => { fetchHosts(); }, [selectedOrg]);

  const fetchHosts = async () => {
    try {
      const res = await fetch('/api/automation/docker');
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setHosts(Array.isArray(data) ? data : data.items || []);
    } catch (err) {
      console.error('Failed to fetch Docker hosts', err);
    } finally {
      setLoading(false);
    }
  };

  const scanDocker = async () => {
    setScanning(true);
    try {
      const res = await fetch('/api/automation/docker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: endpoint || undefined, organizationId: selectedOrg?.id }),
      });
      if (!res.ok) throw new Error('Scan failed');
      toast('success', 'Docker scan complete');
      fetchHosts();
    } catch {
      toast('error', 'Failed to scan Docker');
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="space-y-6 page-enter">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Docker Discovery</h1>
          <p className="text-[var(--text-muted)] mt-1">Discover and monitor Docker containers</p>
        </div>
        <button onClick={scanDocker} disabled={scanning} className="btn-primary flex items-center gap-2">
          {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {scanning ? 'Scanning...' : 'Scan Docker Host'}
        </button>
      </div>

      <div className="card p-4">
        <div className="flex gap-3">
          <input className="input-field flex-1" placeholder="Docker endpoint (default: /var/run/docker.sock)" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="card h-32 animate-shimmer" />)}
        </div>
      ) : hosts.length === 0 ? (
        <div className="card p-12 text-center">
          <Box className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3" />
          <h3 className="font-semibold mb-1">No Docker hosts discovered</h3>
          <p className="text-sm text-[var(--text-muted)]">Click "Scan Docker Host" to discover containers</p>
        </div>
      ) : (
        <div className="space-y-4">
          {hosts.map((host) => {
            let meta: any;
            try { meta = JSON.parse(host.metadata || '{}'); } catch { meta = {}; }

            return (
              <div key={host.id} className="card p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                      <Box className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{host.name}</h3>
                      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                        <span className="badge">{host.type}</span>
                        <span>v{host.version}</span>
                        {host.lastScanAt && <span>Last scan: {new Date(host.lastScanAt).toLocaleString()}</span>}
                      </div>
                    </div>
                  </div>
                  <div className={`w-3 h-3 rounded-full ${host.status === 'active' ? 'bg-green-500' : 'bg-red-500'}`} />
                </div>

                <div className="grid grid-cols-4 gap-4">
                  <div className="p-3 bg-[var(--surface-1)] rounded-lg text-center">
                    <Server className="w-5 h-5 mx-auto mb-1 text-[var(--accent)]" />
                    <div className="text-lg font-bold">{host.containers}</div>
                    <div className="text-xs text-[var(--text-muted)]">Containers</div>
                  </div>
                  <div className="p-3 bg-[var(--surface-1)] rounded-lg text-center">
                    <HardDrive className="w-5 h-5 mx-auto mb-1 text-green-500" />
                    <div className="text-lg font-bold">{host.images}</div>
                    <div className="text-xs text-[var(--text-muted)]">Images</div>
                  </div>
                  <div className="p-3 bg-[var(--surface-1)] rounded-lg text-center">
                    <Network className="w-5 h-5 mx-auto mb-1 text-purple-500" />
                    <div className="text-lg font-bold">{host.networks}</div>
                    <div className="text-xs text-[var(--text-muted)]">Networks</div>
                  </div>
                  <div className="p-3 bg-[var(--surface-1)] rounded-lg text-center">
                    <Database className="w-5 h-5 mx-auto mb-1 text-amber-500" />
                    <div className="text-lg font-bold">{host.volumes}</div>
                    <div className="text-xs text-[var(--text-muted)]">Volumes</div>
                  </div>
                </div>

                {meta.cpus && (
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div><span className="text-[var(--text-muted)]">OS:</span> {meta.operatingSystem}</div>
                    <div><span className="text-[var(--text-muted)]">CPU:</span> {meta.cpus} cores</div>
                    <div><span className="text-[var(--text-muted)]">Memory:</span> {Math.round((meta.totalMemory || 0) / 1073741824)} GB</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
