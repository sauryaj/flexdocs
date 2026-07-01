'use client';

import { useState, useEffect } from 'react';
import { useOrganization } from '@/lib/OrganizationContext';
import { useToast } from '@/components/Toast';
import { DollarSign, TrendingUp, AlertTriangle, Plus, Loader2, RefreshCw } from 'lucide-react';

interface CostEntry {
  id: string;
  provider: string;
  service: string;
  amount: number;
  period: string;
  fetchedAt: string;
}

interface CostBudget {
  id: string;
  name: string;
  monthlyLimit: number;
  alertThreshold: number;
  service: string | null;
}

export default function CloudCostsPage() {
  const { selectedOrg } = useOrganization();
  const { toast } = useToast();
  const [entries, setEntries] = useState<CostEntry[]>([]);
  const [budgets, setBudgets] = useState<CostBudget[]>([]);
  const [totalCost, setTotalCost] = useState(0);
  const [byService, setByService] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [showBudget, setShowBudget] = useState(false);
  const [credentials, setCredentials] = useState({ accessKeyId: '', secretAccessKey: '', region: 'us-east-1' });

  useEffect(() => { fetchCosts(); }, [selectedOrg]);

  const fetchCosts = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedOrg?.id) params.set('organizationId', selectedOrg.id);
      const res = await fetch(`/api/automation/costs?${params}`);
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setEntries(data.entries || []);
      setBudgets(data.budgets || []);
      setTotalCost(data.totalCost || 0);
      setByService(data.byService || {});
    } catch (err) {
      console.error('Failed to fetch costs', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchFromAWS = async () => {
    setFetching(true);
    try {
      const res = await fetch('/api/automation/costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fetch', credentials, organizationId: selectedOrg?.id }),
      });
      if (!res.ok) throw new Error('Fetch failed');
      toast('success', 'Cost data fetched');
      fetchCosts();
    } catch {
      toast('error', 'Failed to fetch AWS costs');
    } finally {
      setFetching(false);
    }
  };

  const sortedServices = Object.entries(byService).sort((a, b) => b[1] - a[1]);
  const maxCost = sortedServices[0]?.[1] || 1;

  return (
    <div className="space-y-6 page-enter">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cloud Costs</h1>
          <p className="text-[var(--text-muted)] mt-1">Track and analyze cloud spending</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowBudget(!showBudget)} className="btn-secondary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Budget
          </button>
          <button onClick={fetchFromAWS} disabled={fetching} className="btn-primary flex items-center gap-2">
            {fetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {fetching ? 'Fetching...' : 'Fetch from AWS'}
          </button>
        </div>
      </div>

      {showBudget && (
        <div className="card p-4 space-y-3">
          <h3 className="font-semibold">Fetch AWS Costs</h3>
          <div className="grid grid-cols-3 gap-3">
            <input className="input-field" placeholder="Access Key ID" value={credentials.accessKeyId} onChange={(e) => setCredentials({ ...credentials, accessKeyId: e.target.value })} />
            <input className="input-field" type="password" placeholder="Secret Key" value={credentials.secretAccessKey} onChange={(e) => setCredentials({ ...credentials, secretAccessKey: e.target.value })} />
            <select className="input-field" value={credentials.region} onChange={(e) => setCredentials({ ...credentials, region: e.target.value })}>
              <option value="us-east-1">US East</option>
              <option value="us-west-2">US West</option>
              <option value="eu-west-1">EU Ireland</option>
            </select>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-[var(--text-muted)]">Total This Month</p>
              <p className="text-2xl font-bold">${totalCost.toLocaleString()}</p>
            </div>
          </div>
        </div>
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center text-green-500">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-[var(--text-muted)]">Services Tracked</p>
              <p className="text-2xl font-bold">{sortedServices.length}</p>
            </div>
          </div>
        </div>
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-[var(--text-muted)]">Budgets</p>
              <p className="text-2xl font-bold">{budgets.length}</p>
            </div>
          </div>
        </div>
      </div>

      {budgets.length > 0 && (
        <div className="card p-4">
          <h3 className="font-semibold mb-3">Budgets</h3>
          <div className="space-y-2">
            {budgets.map((budget) => {
              const spent = budget.service ? (byService[budget.service] || 0) : totalCost;
              const pct = Math.round((spent / budget.monthlyLimit) * 100);
              return (
                <div key={budget.id} className="p-3 bg-[var(--surface-1)] rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium">{budget.name}</span>
                    <span className={`text-sm font-bold ${pct >= 100 ? 'text-red-500' : pct >= budget.alertThreshold ? 'text-amber-500' : 'text-green-500'}`}>
                      ${spent.toLocaleString()} / ${budget.monthlyLimit.toLocaleString()}
                    </span>
                  </div>
                  <div className="w-full bg-[var(--surface-2)] rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${pct >= 100 ? 'bg-red-500' : pct >= budget.alertThreshold ? 'bg-amber-500' : 'bg-green-500'}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="card h-16 animate-shimmer" />)}
        </div>
      ) : sortedServices.length === 0 ? (
        <div className="card p-12 text-center">
          <DollarSign className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3" />
          <h3 className="font-semibold mb-1">No cost data</h3>
          <p className="text-sm text-[var(--text-muted)]">Click "Fetch from AWS" to pull cost data</p>
        </div>
      ) : (
        <div className="card p-4">
          <h3 className="font-semibold mb-3">Cost by Service</h3>
          <div className="space-y-2">
            {sortedServices.map(([service, cost]) => (
              <div key={service} className="flex items-center gap-3">
                <span className="text-sm w-48 truncate">{service}</span>
                <div className="flex-1 bg-[var(--surface-2)] rounded-full h-4">
                  <div className="h-4 rounded-full bg-[var(--accent)]" style={{ width: `${(cost / maxCost) * 100}%` }} />
                </div>
                <span className="text-sm font-mono w-24 text-right">${cost.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
