'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

const STATUS_META: Record<string, { label: string; color: string }> = {
  operational: { label: 'Operational', color: 'bg-green-500' },
  degraded: { label: 'Degraded Performance', color: 'bg-amber-500' },
  'partial-outage': { label: 'Partial Outage', color: 'bg-orange-500' },
  'major-outage': { label: 'Major Outage', color: 'bg-red-500' },
};

const INCIDENT_META: Record<string, { label: string; color: string }> = {
  investigating: { label: 'Investigating', color: 'bg-amber-500' },
  identified: { label: 'Identified', color: 'bg-orange-500' },
  monitoring: { label: 'Monitoring', color: 'bg-blue-500' },
  resolved: { label: 'Resolved', color: 'bg-green-500' },
  postmortem: { label: 'Postmortem', color: 'bg-purple-500' },
};

function statusColor(meta?: { color: string }) {
  return meta?.color || 'bg-gray-500';
}

export default function PublicStatusPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [page, setPage] = useState<any>(null);

  useEffect(() => {
    fetch(`/api/public/status-pages/${slug}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Not found'))))
      .then((data) => setPage(data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (notFound || !page) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Status page not found</h1>
          <p className="text-sm mt-2">This status page does not exist or is not public.</p>
        </div>
      </div>
    );
  }

  const allOperational = page.components.every((c: any) => c.status === 'operational');

  return (
    <div className="min-h-screen bg-slate-50 py-12">
      <div className="max-w-2xl mx-auto px-4">
        <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className={`w-3 h-3 rounded-full ${allOperational ? 'bg-green-500' : 'bg-red-500'}`} />
            <h1 className="text-xl font-semibold">{page.name}</h1>
          </div>
          {page.description && <p className="text-sm mt-2">{page.description}</p>}

          <div className="mt-6 space-y-3">
            {page.components.map((c: any) => {
              const meta = STATUS_META[c.status] || { label: c.status, color: 'bg-gray-500' };
              return (
                <div key={c.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
                  <span className="font-medium">{c.name}</span>
                  <span className="flex items-center gap-2 text-sm">
                    <span className={`w-2.5 h-2.5 rounded-full ${statusColor(meta)}`} />
                    {meta.label}
                  </span>
                </div>
              );
            })}
          </div>

          {page.incidents && page.incidents.length > 0 && (
            <div className="mt-8">
              <h2 className="font-semibold mb-3">Incidents</h2>
              <div className="space-y-3">
                {page.incidents.map((inc: any) => {
                  const meta = INCIDENT_META[inc.status] || { label: inc.status, color: 'bg-gray-500' };
                  return (
                    <div key={inc.id} className="rounded-lg border border-slate-200 p-4">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{inc.title}</span>
                        <span className="flex items-center gap-2 text-xs">
                          <span className={`w-2 h-2 rounded-full ${statusColor(meta)}`} />
                          {meta.label}
                        </span>
                      </div>
                      {inc.description && <p className="text-sm mt-2">{inc.description}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}