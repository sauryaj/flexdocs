'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Shield, AlertTriangle, RefreshCw, Clock, Copy, Key, Lock, ArrowLeft,
  TrendingDown,
} from 'lucide-react';

interface PasswordHealth {
  totalPasswords: number;
  weakPasswords: number;
  reusedPasswords: number;
  oldPasswords: number;
  expiringPasswords: number;
  breachedPasswords: number;
  withTotp: number;
  withoutTotp: number;
  avgAge: number;
  weakest: { name: string; score: number }[];
  oldest: { name: string; daysOld: number }[];
  reused: { name: string; count: number }[];
  expiring: { name: string; daysUntilExpiry: number }[];
}

export default function PasswordHealthPage() {
  const [health, setHealth] = useState<PasswordHealth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadHealth(); }, []);

  const loadHealth = async () => {
    setLoading(true);
    const res = await fetch('/api/passwords/health');
    if (res.ok) setHealth(await res.json());
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!health) return null;

  const healthScore = health.totalPasswords > 0
    ? Math.round(((health.totalPasswords - health.weakPasswords - health.reusedPasswords - health.breachedPasswords) / health.totalPasswords) * 100)
    : 100;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/passwords" className="p-2 hover:bg-slate-100 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Shield className="w-6 h-6" /> Password Health
            </h1>
            <p className="text-slate-500">Overview of your password security posture</p>
          </div>
        </div>
        <button onClick={loadHealth} className="btn-secondary flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Health Score */}
      <div className="card p-8 text-center">
        <div className="relative inline-flex items-center justify-center">
          <svg className="w-32 h-32" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="54" fill="none" stroke="#e2e8f0" strokeWidth="8" />
            <circle
              cx="60" cy="60" r="54" fill="none"
              stroke={healthScore >= 80 ? '#22c55e' : healthScore >= 50 ? '#eab308' : '#dc2626'}
              strokeWidth="8"
              strokeDasharray={`${(healthScore / 100) * 339.292} 339.292`}
              strokeLinecap="round"
              transform="rotate(-90 60 60)"
            />
          </svg>
          <div className="absolute">
            <p className="text-4xl font-bold" style={{ color: healthScore >= 80 ? '#22c55e' : healthScore >= 50 ? '#eab308' : '#dc2626' }}>
              {healthScore}
            </p>
            <p className="text-sm text-slate-500">/ 100</p>
          </div>
        </div>
        <p className="mt-4 text-lg font-medium text-slate-700">
          {healthScore >= 80 ? 'Good' : healthScore >= 50 ? 'Needs Improvement' : 'Poor'} Password Health
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: health.totalPasswords, icon: Key, color: 'text-blue-600 bg-blue-50' },
          { label: 'Weak', value: health.weakPasswords, icon: TrendingDown, color: 'text-red-600 bg-red-50' },
          { label: 'Reused', value: health.reusedPasswords, icon: Copy, color: 'text-orange-600 bg-orange-50' },
          { label: 'Breached', value: health.breachedPasswords, icon: AlertTriangle, color: 'text-red-600 bg-red-50' },
          { label: 'Old (90d+)', value: health.oldPasswords, icon: Clock, color: 'text-amber-600 bg-amber-50' },
          { label: 'Expiring', value: health.expiringPasswords, icon: Clock, color: 'text-orange-600 bg-orange-50' },
          { label: 'With TOTP', value: health.withTotp, icon: Lock, color: 'text-green-600 bg-green-50' },
          { label: 'Avg Age', value: `${health.avgAge}d`, icon: Clock, color: 'text-slate-600 bg-slate-50' },
        ].map((item) => (
          <div key={item.label} className={`card p-4 flex items-center gap-3 ${item.color}`}>
            <item.icon className="w-5 h-5" />
            <div>
              <p className="text-2xl font-bold">{item.value}</p>
              <p className="text-xs opacity-75">{item.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Weak Passwords */}
      {health.weakest.length > 0 && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-red-600">
            <TrendingDown className="w-5 h-5" /> Weakest Passwords
          </h2>
          <div className="space-y-2">
            {health.weakest.map((p, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                <span className="font-medium">{p.name}</span>
                <span className="text-sm text-red-600">Score: {p.score}/100</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reused Passwords */}
      {health.reused.length > 0 && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-orange-600">
            <Copy className="w-5 h-5" /> Reused Passwords
          </h2>
          <div className="space-y-2">
            {health.reused.map((p, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
                <span className="font-medium">{p.name}</span>
                <span className="text-sm text-orange-600">Used {p.count} times</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expiring Soon */}
      {health.expiring.length > 0 && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-amber-600">
            <Clock className="w-5 h-5" /> Expiring Soon
          </h2>
          <div className="space-y-2">
            {health.expiring.map((p, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-amber-50 rounded-lg">
                <span className="font-medium">{p.name}</span>
                <span className={`text-sm font-medium ${p.daysUntilExpiry <= 7 ? 'text-red-600' : 'text-amber-600'}`}>
                  {p.daysUntilExpiry}d remaining
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Oldest Passwords */}
      {health.oldest.length > 0 && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-slate-600">
            <Clock className="w-5 h-5" /> Oldest Passwords
          </h2>
          <div className="space-y-2">
            {health.oldest.map((p, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <span className="font-medium">{p.name}</span>
                <span className="text-sm text-slate-500">{p.daysOld} days old</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
