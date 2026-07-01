'use client';

import { useEffect, useState, useCallback } from 'react';

interface HealthCheck {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  latency?: number;
  message?: string;
  lastChecked: string;
}

export default function HealthCheckPage() {
  const [checks, setChecks] = useState<HealthCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const runChecks = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/health');
      if (!res.ok) throw new Error('Health check failed');
      const data = await res.json();
      const checkList = Array.isArray(data.checks) ? data.checks : [];
      setChecks(checkList.map((c: Record<string, unknown>) => ({
        name: String(c.name || ''),
        status: String(c.status || 'unknown') as HealthCheck['status'],
        latency: typeof c.latency === 'number' ? c.latency : undefined,
        message: typeof c.message === 'string' ? c.message : undefined,
        lastChecked: new Date().toISOString(),
      })));
      setLastRefresh(new Date());
    } catch {
      setChecks([
        { name: 'Database', status: 'down', message: 'Could not connect', lastChecked: new Date().toISOString() },
        { name: 'API', status: 'down', message: 'Health endpoint unreachable', lastChecked: new Date().toISOString() },
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { runChecks(); }, [runChecks]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(runChecks, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, runChecks]);

  const overallStatus = checks.length === 0 ? 'unknown' :
    checks.every((c) => c.status === 'healthy') ? 'healthy' :
    checks.some((c) => c.status === 'down') ? 'down' : 'degraded';

  const statusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      case 'degraded': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
      case 'down': return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">System Health</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Real-time status of all system components
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto-refresh (30s)
          </label>
          <button
            onClick={runChecks}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className={`flex items-center gap-4 p-6 rounded-xl border ${
        overallStatus === 'healthy' ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' :
        overallStatus === 'degraded' ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800' :
        'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
      }`}>
        <div className={`w-16 h-16 rounded-full flex items-center justify-center text-3xl ${
          overallStatus === 'healthy' ? 'bg-green-200 dark:bg-green-800' :
          overallStatus === 'degraded' ? 'bg-yellow-200 dark:bg-yellow-800' :
          'bg-red-200 dark:bg-red-800'
        }`}>
          {overallStatus === 'healthy' ? '✅' : overallStatus === 'degraded' ? '⚠️' : '❌'}
        </div>
        <div>
          <h2 className={`text-xl font-bold ${
            overallStatus === 'healthy' ? 'text-green-900 dark:text-green-200' :
            overallStatus === 'degraded' ? 'text-yellow-900 dark:text-yellow-200' :
            'text-red-900 dark:text-red-200'
          }`}>
            System {overallStatus === 'healthy' ? 'Operational' : overallStatus === 'degraded' ? 'Degraded' : 'Down'}
          </h2>
          {lastRefresh && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Last checked: {lastRefresh.toLocaleTimeString()}
            </p>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Component Status</h2>
        </div>
        {loading && checks.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">Running checks...</div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {checks.map((check) => (
              <div key={check.name} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor(check.status)}`}>
                      {check.status}
                    </span>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">{check.name}</div>
                      {check.message && (
                        <div className="text-sm text-gray-500 dark:text-gray-400">{check.message}</div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    {check.latency !== undefined && (
                      <div className="text-sm font-mono text-gray-500 dark:text-gray-400">
                        {check.latency}ms
                      </div>
                    )}
                    <div className="text-xs text-gray-400 dark:text-gray-500">
                      {new Date(check.lastChecked).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
