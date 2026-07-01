'use client';

import { useState, useEffect } from 'react';
import { useOrganization } from '@/lib/OrganizationContext';
import { useToast } from '@/components/Toast';
import { ConfirmDialog } from '@/components/UIComponents';
import { Clock, Play, Pause, Trash2, Plus, Loader2, Calendar } from 'lucide-react';

interface ScheduledScan {
  id: string;
  name: string;
  type: string;
  config: string;
  cronExpression: string;
  isActive: boolean;
  lastRunAt: string | null;
  lastResult: string | null;
  createdAt: string;
}

export default function AutomationSchedulesPage() {
  const { selectedOrg } = useOrganization();
  const { toast } = useToast();
  const [scans, setScans] = useState<ScheduledScan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ScheduledScan | null>(null);

  useEffect(() => { fetchScans(); }, [selectedOrg]);

  const fetchScans = async () => {
    try {
      const res = await fetch('/api/automation/scans');
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setScans(Array.isArray(data) ? data : data.items || []);
    } catch (err) {
      console.error('Failed to fetch scans', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleScan = async (scan: ScheduledScan) => {
    try {
      await fetch('/api/automation/scans', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: scan.id, isActive: !scan.isActive, cronExpression: scan.cronExpression }),
      });
      toast('success', scan.isActive ? 'Scan paused' : 'Scan resumed');
      fetchScans();
    } catch {
      toast('error', 'Failed to toggle scan');
    }
  };

  const deleteScan = async (id: string) => {
    try {
      await fetch(`/api/automation/scans?id=${id}`, { method: 'DELETE' });
      toast('success', 'Scan deleted');
      fetchScans();
    } catch {
      toast('error', 'Failed to delete scan');
    }
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'cloud-discovery': 'Cloud Discovery',
      'network-scan': 'Network Scan',
      'ssh-discovery': 'SSH Discovery',
      'docker-discover': 'Docker Discovery',
      'cost-sync': 'Cost Sync',
    };
    return labels[type] || type;
  };

  return (
    <div className="space-y-6 page-enter">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Scheduled Automation</h1>
          <p className="text-[var(--text-muted)] mt-1">Automated recurring scans and discovery</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Schedule
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="card h-24 animate-shimmer" />)}
        </div>
      ) : scans.length === 0 ? (
        <div className="card p-12 text-center">
          <Calendar className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3" />
          <h3 className="font-semibold mb-1">No scheduled scans</h3>
          <p className="text-sm text-[var(--text-muted)]">Create a schedule to automate infrastructure discovery</p>
        </div>
      ) : (
        <div className="space-y-3">
          {scans.map((scan) => {
            let result: Record<string, unknown> = {};
            try { result = JSON.parse(scan.lastResult || '{}'); } catch { /* ignore parse error */ }
            return (
              <div key={scan.id} className="card p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${scan.isActive ? 'bg-green-500/10 text-green-500' : 'bg-[var(--surface-2)] text-[var(--text-muted)]'}`}>
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-medium">{scan.name}</h3>
                    <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
                      <span className="badge">{getTypeLabel(scan.type)}</span>
                      <span>Cron: {scan.cronExpression}</span>
                      {scan.lastRunAt && <span>Last: {new Date(scan.lastRunAt).toLocaleString()}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {scan.lastResult && (
                    <div className="text-xs text-right mr-4">
                      <div className="text-green-500">{String((result.created as number) || 0)} created</div>
                      {(result.errors as number) > 0 && <div className="text-red-500">{String(result.errors)} errors</div>}
                    </div>
                  )}
                  <button onClick={() => toggleScan(scan)} className={`p-2 rounded-lg ${scan.isActive ? 'text-amber-500 hover:bg-amber-500/10' : 'text-green-500 hover:bg-green-500/10'}`}>
                    {scan.isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  <button onClick={() => setDeleteTarget(scan)} className="p-2 rounded-lg text-red-500 hover:bg-red-500/10">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && <CreateScanModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); fetchScans(); }} orgId={selectedOrg?.id} />}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) deleteScan(deleteTarget.id); setDeleteTarget(null); }}
        title="Delete Scheduled Scan"
        message={`Are you sure you want to delete "${deleteTarget?.name || ''}"? This cannot be undone.`}
      />
    </div>
  );
}

function CreateScanModal({ onClose, onCreated, orgId }: { onClose: () => void; onCreated: () => void; orgId?: string }) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [type, setType] = useState('cloud-discovery');
  const [cron, setCron] = useState('0 2 * * 0');
  const [config, setConfig] = useState('{\n  "credentials": {\n    "accessKeyId": "",\n    "secretAccessKey": "",\n    "region": "us-east-1"\n  }\n}');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/automation/scans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type, config: JSON.parse(config), cronExpression: cron, organizationId: orgId }),
      });
      if (!res.ok) throw new Error('Failed to create');
      toast('success', 'Scan created');
      onCreated();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to create scan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose} role="dialog" aria-modal="true" aria-label="Create scan">
      <div className="card w-full max-w-lg p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold">Create Scheduled Scan</h2>
        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Name</label>
          <input className="input-field w-full" placeholder="Weekly Cloud Scan" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Type</label>
            <select className="input-field w-full" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="cloud-discovery">Cloud Discovery</option>
              <option value="network-scan">Network Scan</option>
              <option value="ssh-discovery">SSH Discovery</option>
              <option value="docker-discover">Docker Discovery</option>
              <option value="cost-sync">Cost Sync</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Cron Expression</label>
            <input className="input-field w-full" placeholder="0 2 * * 0" value={cron} onChange={(e) => setCron(e.target.value)} />
            <div className="text-xs text-[var(--text-muted)] mt-1">e.g. 0 2 * * 0 = every Sunday 2am</div>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Config (JSON)</label>
          <textarea className="input-field w-full font-mono text-sm h-32" value={config} onChange={(e) => setConfig(e.target.value)} />
        </div>
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleCreate} disabled={loading || !name} className="btn-primary flex items-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
