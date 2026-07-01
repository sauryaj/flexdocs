'use client';

import { useState, useRef } from 'react';

type ImportType = 'documents' | 'passwords' | 'domains' | 'assets' | 'itglue';

interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: string[];
}

export default function ImportExportPage() {
  const [activeTab, setActiveTab] = useState<'import' | 'export'>('import');
  const [importType, setImportType] = useState<ImportType>('documents');
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImport = async () => {
    if (!file) {
      setError('Please select a file');
      return;
    }

    try {
      setImporting(true);
      setError(null);
      setResult(null);

      const text = await file.text();
      let payload: Record<string, unknown>;

      if (importType === 'itglue') {
        payload = { type: 'itglue', data: text };
      } else {
        const lines = text.split('\n').filter((l) => l.trim());
        const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
        const rows = lines.slice(1).map((line) => {
          const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
          const obj: Record<string, string> = {};
          headers.forEach((h, i) => { obj[h] = values[i] || ''; });
          return obj;
        });
        payload = { type: importType, data: rows };
      }

      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Import failed');
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleExport = async (format: 'csv' | 'json') => {
    try {
      setExporting(true);
      setError(null);

      const res = await fetch(`/api/domains/export?format=${format}`);
      if (!res.ok) throw new Error('Export failed');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `domains-export.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Import & Export</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Import data from CSV/JSON or IT Glue, or export your data
        </p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('import')}
          className={`px-4 py-2 text-sm rounded-lg transition-colors ${
            activeTab === 'import'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          Import
        </button>
        <button
          onClick={() => setActiveTab('export')}
          className={`px-4 py-2 text-sm rounded-lg transition-colors ${
            activeTab === 'export'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          Export
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
        </div>
      )}

      {result && (
        <div className={`rounded-lg p-4 ${result.success ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'}`}>
          <p className={`text-sm ${result.success ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
            Imported {result.imported} records, skipped {result.skipped}
          </p>
          {result.errors.length > 0 && (
            <div className="mt-2 text-sm text-red-600 dark:text-red-400">
              {result.errors.slice(0, 5).map((err, i) => (
                <div key={i}>• {err}</div>
              ))}
              {result.errors.length > 5 && <div>... and {result.errors.length - 5} more errors</div>}
            </div>
          )}
        </div>
      )}

      {activeTab === 'import' ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Import Data</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Import Type</label>
              <select
                value={importType}
                onChange={(e) => setImportType(e.target.value as ImportType)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="documents">Documents (CSV)</option>
                <option value="passwords">Passwords (CSV)</option>
                <option value="domains">Domains (CSV)</option>
                <option value="assets">Assets (CSV)</option>
                <option value="itglue">IT Glue (CSV/JSON)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">File</label>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.json,.txt"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            {importType !== 'itglue' && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  Expected CSV format: First row should contain column headers. Supported headers vary by type.
                </p>
              </div>
            )}

            <button
              onClick={handleImport}
              disabled={!file || importing}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {importing ? 'Importing...' : 'Import'}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Export Data</h2>
          <div className="space-y-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Export your domains data in CSV or JSON format.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleExport('csv')}
                disabled={exporting}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {exporting ? 'Exporting...' : 'Export as CSV'}
              </button>
              <button
                onClick={() => handleExport('json')}
                disabled={exporting}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                {exporting ? 'Exporting...' : 'Export as JSON'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
