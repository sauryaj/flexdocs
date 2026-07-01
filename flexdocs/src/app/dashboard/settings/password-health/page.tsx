'use client';

import { useEffect, useState, useCallback } from 'react';

interface PasswordHealthItem {
  id: string;
  name: string;
  username: string;
  strength: 'weak' | 'fair' | 'good' | 'strong' | 'excellent';
  score: number;
  reused: boolean;
  breach: boolean;
  old: boolean;
  lastChanged: string;
}

interface HealthReport {
  overall: number;
  total: number;
  weak: number;
  reused: number;
  breached: number;
  old: number;
  items: PasswordHealthItem[];
}

export default function PasswordHealthPage() {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'weak' | 'reused' | 'breached' | 'old'>('all');

  const loadReport = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/passwords/health');
      if (!res.ok) throw new Error('Failed to load health report');
      const data = await res.json();
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load health report');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadReport(); }, [loadReport]);

  const filteredItems = report?.items.filter((item) => {
    if (filter === 'all') return true;
    if (filter === 'weak') return item.strength === 'weak' || item.strength === 'fair';
    if (filter === 'reused') return item.reused;
    if (filter === 'breached') return item.breach;
    if (filter === 'old') return item.old;
    return true;
  }) || [];

  const strengthColor = (strength: string) => {
    switch (strength) {
      case 'weak': return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
      case 'fair': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400';
      case 'good': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
      case 'strong': return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      case 'excellent': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Password Health</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Review password strength, reuse, and breach status
        </p>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">Loading...</div>
      ) : report ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="text-3xl font-bold text-gray-900 dark:text-white">{report.overall}%</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Overall Score</div>
              <div className="mt-2 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    report.overall >= 80 ? 'bg-green-500' :
                    report.overall >= 60 ? 'bg-yellow-500' :
                    report.overall >= 40 ? 'bg-orange-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${report.overall}%` }}
                />
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="text-3xl font-bold text-red-600 dark:text-red-400">{report.weak}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Weak Passwords</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">{report.reused}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Reused Passwords</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="text-3xl font-bold text-red-600 dark:text-red-400">{report.breached}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Breached</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">{report.old}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Old (&gt;90 days)</div>
            </div>
          </div>

          <div className="flex gap-2">
            {(['all', 'weak', 'reused', 'breached', 'old'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  filter === f
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
                {f === 'weak' && report.weak > 0 && ` (${report.weak})`}
                {f === 'reused' && report.reused > 0 && ` (${report.reused})`}
                {f === 'breached' && report.breached > 0 && ` (${report.breached})`}
                {f === 'old' && report.old > 0 && ` (${report.old})`}
              </button>
            ))}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            {filteredItems.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                <div className="text-4xl mb-3">✅</div>
                <p>No passwords match the selected filter.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredItems.map((item) => (
                  <div key={item.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">{item.name}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">{item.username}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {item.breach && (
                          <span className="px-2 py-0.5 text-xs bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400 rounded-full">
                            Breached
                          </span>
                        )}
                        {item.reused && (
                          <span className="px-2 py-0.5 text-xs bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400 rounded-full">
                            Reused
                          </span>
                        )}
                        {item.old && (
                          <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400 rounded-full">
                            Old
                          </span>
                        )}
                        <span className={`px-2 py-0.5 text-xs rounded-full ${strengthColor(item.strength)}`}>
                          {item.strength}
                        </span>
                        <span className="text-sm font-mono text-gray-500 dark:text-gray-400">
                          {item.score}/100
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">No password data available</div>
      )}
    </div>
  );
}
