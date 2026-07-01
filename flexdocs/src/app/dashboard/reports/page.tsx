'use client';

import { useState } from 'react';

interface ReportType {
  id: string;
  name: string;
  description: string;
  icon: string;
  format: 'pdf' | 'csv' | 'json';
}

const REPORT_TYPES: ReportType[] = [
  { id: 'documents', name: 'Documents Report', description: 'All documents with metadata and tags', icon: '📄', format: 'csv' },
  { id: 'passwords', name: 'Passwords Report', description: 'Password inventory with strength scores', icon: '🔑', format: 'csv' },
  { id: 'domains', name: 'Domains Report', description: 'Domain names with expiry dates and WHOIS data', icon: '🌐', format: 'csv' },
  { id: 'assets', name: 'Assets Report', description: 'All assets with categories and statuses', icon: '📦', format: 'csv' },
  { id: 'organizations', name: 'Organizations Report', description: 'Organization directory with contacts', icon: '🏢', format: 'csv' },
  { id: 'activity', name: 'Activity Log Report', description: 'Complete audit trail of all actions', icon: '📋', format: 'csv' },
  { id: 'compliance', name: 'Compliance Report', description: 'Security compliance overview', icon: '✅', format: 'pdf' },
  { id: 'health', name: 'Password Health Report', description: 'Password strength and breach analysis', icon: '🏥', format: 'csv' },
];

export default function ReportsPage() {
  const [generating, setGenerating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const generateReport = async (report: ReportType) => {
    try {
      setGenerating(report.id);
      setError(null);
      setSuccess(null);

      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: report.id, format: report.format }),
      });

      if (!res.ok) throw new Error('Failed to generate report');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.name.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.${report.format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setSuccess(`${report.name} generated successfully`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report');
    } finally {
      setGenerating(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reports</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Generate and export various reports
        </p>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <p className="text-green-600 dark:text-green-400 text-sm">{success}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {REPORT_TYPES.map((report) => (
          <div
            key={report.id}
            className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-2xl">
                  {report.icon}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">{report.name}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{report.description}</p>
                  <span className="inline-block mt-2 px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded uppercase">
                    {report.format}
                  </span>
                </div>
              </div>
              <button
                onClick={() => generateReport(report)}
                disabled={generating === report.id}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {generating === report.id ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h3 className="font-medium text-blue-900 dark:text-blue-200">Scheduled Reports</h3>
        <p className="mt-1 text-sm text-blue-800 dark:text-blue-300">
          Set up scheduled reports via the Automation tab to receive regular reports via email or webhook.
        </p>
      </div>
    </div>
  );
}
