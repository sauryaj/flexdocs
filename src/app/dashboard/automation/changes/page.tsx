'use client';

import { useState, useEffect } from 'react';
import { useOrganization } from '@/lib/OrganizationContext';
import { useToast } from '@/components/Toast';
import { AlertTriangle, CheckCircle, Bell, RefreshCw, Server, Cloud, Network, Loader2 } from 'lucide-react';

interface InfraChange {
  id: string;
  resourceType: string;
  resourceId: string;
  changeType: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  summary: string;
  detectedAt: string;
  acknowledged: boolean;
  acknowledgedAt: string | null;
}

export default function ChangesPage() {
  const { selectedOrg } = useOrganization();
  const { toast } = useToast();
  const [changes, setChanges] = useState<InfraChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);

  useEffect(() => { fetchChanges(); }, [selectedOrg]);

  const fetchChanges = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedOrg?.id) params.set('organizationId', selectedOrg.id);
      const res = await fetch(`/api/automation/changes?${params}`);
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setChanges(Array.isArray(data) ? data : data.items || []);
    } catch (err) {
      console.error('Failed to fetch changes', err);
    } finally {
      setLoading(false);
    }
  };

  const detectChanges = async () => {
    setDetecting(true);
    try {
      const res = await fetch('/api/automation/changes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'detect', organizationId: selectedOrg?.id }),
      });
      if (!res.ok) throw new Error('Detection failed');
      toast('success', 'Change detection complete');
      fetchChanges();
    } catch {
      toast('error', 'Failed to detect changes');
    } finally {
      setDetecting(false);
    }
  };

  const acknowledge = async (id: string) => {
    await fetch('/api/automation/changes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'acknowledge', changeId: id }),
    });
    fetchChanges();
  };

  const unacknowledged = changes.filter((c) => !c.acknowledged);
  const acknowledged = changes.filter((c) => c.acknowledged);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'server': return <Server className="w-4 h-4" />;
      case 'cloud': return <Cloud className="w-4 h-4" />;
      case 'network': return <Network className="w-4 h-4" />;
      default: return <AlertTriangle className="w-4 h-4" />;
    }
  };

  const getChangeColor = (changeType: string) => {
    switch (changeType) {
      case 'created': return 'text-green-500 bg-green-500/10';
      case 'updated': return 'text-amber-500 bg-amber-500/10';
      case 'deleted': return 'text-red-500 bg-red-500/10';
      case 'status_changed': return 'text-blue-500 bg-blue-500/10';
      default: return 'text-[var(--text-muted)] bg-[var(--surface-2)]';
    }
  };

  return (
    <div className="space-y-6 page-enter">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Infrastructure Changes</h1>
          <p className="text-[var(--text-muted)] mt-1">Track and acknowledge infrastructure modifications</p>
        </div>
        <button onClick={detectChanges} disabled={detecting} className="btn-primary flex items-center gap-2">
          {detecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {detecting ? 'Scanning...' : 'Detect Changes'}
        </button>
      </div>

      {unacknowledged.length > 0 && (
        <div className="card p-4 border-amber-500/50 bg-amber-500/5">
          <div className="flex items-center gap-2 mb-3">
            <Bell className="w-5 h-5 text-amber-500" />
            <h3 className="font-semibold text-amber-500">{unacknowledged.length} Unacknowledged Changes</h3>
          </div>
          <div className="space-y-2">
            {unacknowledged.map((change) => (
              <div key={change.id} className="flex items-center justify-between p-3 bg-[var(--surface-1)] rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${getChangeColor(change.changeType)}`}>
                    {getTypeIcon(change.resourceType)}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{change.summary}</p>
                    <p className="text-xs text-[var(--text-muted)]">{new Date(change.detectedAt).toLocaleString()}</p>
                  </div>
                </div>
                <button onClick={() => acknowledge(change.id)} className="btn-secondary text-xs flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Acknowledge
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="card h-20 animate-shimmer" />)}
        </div>
      ) : changes.length === 0 ? (
        <div className="card p-12 text-center">
          <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-3" />
          <h3 className="font-semibold mb-1">No changes detected</h3>
          <p className="text-sm text-[var(--text-muted)]">Click "Detect Changes" to scan for infrastructure modifications</p>
        </div>
      ) : (
        <div className="space-y-2">
          {changes.map((change) => (
            <div key={change.id} className={`card p-4 flex items-center gap-4 ${change.acknowledged ? 'opacity-60' : ''}`}>
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getChangeColor(change.changeType)}`}>
                {getTypeIcon(change.resourceType)}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{change.summary}</p>
                <div className="flex items-center gap-3 text-xs text-[var(--text-muted)] mt-1">
                  <span className="badge">{change.resourceType}</span>
                  <span>{change.changeType}</span>
                  <span>{new Date(change.detectedAt).toLocaleString()}</span>
                </div>
              </div>
              {change.acknowledged ? (
                <span className="text-xs text-green-500 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Acknowledged</span>
              ) : (
                <button onClick={() => acknowledge(change.id)} className="btn-secondary text-xs">Acknowledge</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
