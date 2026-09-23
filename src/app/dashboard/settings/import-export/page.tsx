'use client';

import { useState, useRef, useEffect } from 'react';

type Tab = 'import' | 'vault' | 'export' | 'backup';

interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: string[];
}

interface BackupResult {
  success: boolean;
  imported?: Record<string, number>;
  skipped?: number;
  errors?: string[];
}

export default function ImportExportPage() {
  const [activeTab, setActiveTab] = useState<Tab>('import');
  const [importType, setImportType] = useState<string>('documents');
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<ImportResult | BackupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);
  const [selectedOrg, setSelectedOrg] = useState('');
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const backupFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/me/org-scope')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setIsAdmin(d?.mode === 'all'));
    fetch('/api/organizations')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.organizations || [];
        setOrgs(list.map((o: any) => ({ id: o.id, name: o.name })));
        setSelectedOrg(list[0]?.id || '');
      })
      .catch(() => {});
  }, []);

  const download = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    if (!file) return;
    try {
      setImporting(true);
      setError(null);
      setResult(null);
      const text = await file.text();
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: importType,
          data: importType === 'itglue' ? text : text,
          format: importType === 'itglue' ? undefined : 'csv',
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || 'Import failed');
      }
      setResult(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleVaultImport = async () => {
    if (!file) return;
    try {
      setImporting(true);
      setError(null);
      setResult(null);
      const text = await file.text();
      const res = await fetch('/api/passwords/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: text, format: 'auto' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Vault import failed');
      setResult({ success: true, imported: data.created || 0, skipped: (data.total || 0) - (data.created || 0), errors: [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vault import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleFullExport = async () => {
    try {
      setExporting(true);
      setError(null);
      const res = await fetch('/api/export');
      if (!res.ok) { const failure = await res.json(); throw new Error([failure.error, ...(failure.issues || [])].join(' — ')); }
      const blob = await res.blob();
      download(blob, `flexdocs-backup-${new Date().toISOString().slice(0, 10)}.json`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Full export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleOrgExport = async () => {
    if (!selectedOrg) return;
    try {
      setExporting(true);
      setError(null);
      const res = await fetch(`/api/organizations/${selectedOrg}/export`);
      if (!res.ok) { const failure = await res.json(); throw new Error([failure.error, ...(failure.issues || [])].join(' — ')); }
      const blob = await res.blob();
      download(blob, `cap-${selectedOrg.slice(-6)}.json`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Org export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleRestore = async () => {
    if (!backupFile) return;
    try {
      setImporting(true);
      setError(null);
      setResult(null);
      const text = await backupFile.text();
      const bundle = JSON.parse(text);
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'flexdocs-backup', data: bundle }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Restore failed');
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed (invalid backup file?)');
    } finally {
      setImporting(false);
    }
  };

  const tabBtn = (tab: Tab, label: string) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`px-4 py-2 text-sm rounded-lg transition-colors ${
        activeTab === tab
          ? 'bg-blue-600 text-white'
          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Import & Export</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          CSV imports, full portable backups, and password-manager vault imports
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {tabBtn('import', 'Import')}
        {tabBtn('vault', 'Password Vault')}
        {tabBtn('backup', 'Portable Export')}
        {tabBtn('export', 'Domains Export')}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
        </div>
      )}

      {result && (
        <div className={`rounded-lg p-4 ${result.success ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'}`}>
          <p className={`text-sm ${result.success ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
            {'imported' in result
              ? `Imported ${result.imported} records, skipped ${result.skipped}`
              : `Restored: ${JSON.stringify(result.imported)}`}
          </p>
          {result.errors && result.errors.length > 0 && (
            <div className="mt-2 text-sm text-red-600 dark:text-red-400">
              {result.errors.slice(0, 5).map((err, i) => (
                <div key={i}>• {err}</div>
              ))}
              {result.errors.length > 5 && <div>... and {result.errors.length - 5} more errors</div>}
            </div>
          )}
        </div>
      )}

      {activeTab === 'vault' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Import from Password Manager</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Export a CSV from Bitwarden, 1Password, or Chrome — the format is detected automatically.
            Duplicates are skipped; secrets are encrypted at rest.
          </p>
          <div className="space-y-4">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
            <button
              onClick={handleVaultImport}
              disabled={!file || importing}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {importing ? 'Importing…' : 'Import Vault'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'import' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Import Data</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Import Type</label>
              <select
                value={importType}
                onChange={(e) => setImportType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="documents">Documents (CSV)</option>
                <option value="passwords">Passwords (CSV)</option>
                <option value="domains">Domains (CSV)</option>
                <option value="assets">Assets (CSV)</option>
                <option value="servers">Servers (CSV)</option>
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
            <button
              onClick={handleImport}
              disabled={!file || importing}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {importing ? 'Importing...' : 'Import'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'backup' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Portable Data Export (JSON)</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Exports organizations, document history and attachments, vault secrets, domains, assets,
              checklists, servers, IPAM, contacts, locations, websites, tickets and links.
              This is not a complete system backup: accounts, sessions, audit history and integration settings are excluded.
              Use database, uploads and configuration backups for disaster recovery.
              Admin only — vault secrets are decrypted in the downloaded file.
            </p>
            <button
              onClick={handleFullExport}
              disabled={exporting}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {exporting ? 'Building…' : 'Export Data'}
            </button>

            {isAdmin && orgs.length > 0 && (
              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Per-tenant offboarding snapshot
                </label>
                <div className="flex gap-3 flex-wrap">
                  <select
                    value={selectedOrg}
                    onChange={(e) => setSelectedOrg(e.target.value)}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    {orgs.map((o) => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleOrgExport}
                    disabled={exporting}
                    className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
                  >
                    Export This Tenant
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Restore</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Re-import a backup file. Records that already exist are skipped; new ones are restored onto your account.
              Admin only.
            </p>
            <div className="space-y-4">
              <input
                ref={backupFileRef}
                type="file"
                accept=".json"
                onChange={(e) => setBackupFile(e.target.files?.[0] || null)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <button
                onClick={handleRestore}
                disabled={!backupFile || importing}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                {importing ? 'Restoring…' : 'Restore Backup'}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'export' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Domains Export</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Export domains as CSV or JSON for reporting.</p>
          <div className="flex gap-3">
            <button
              onClick={async () => {
                const res = await fetch('/api/domains/export?format=csv');
                if (res.ok) {
                  const blob = await res.blob();
                  download(blob, 'domains-export.csv');
                }
              }}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              Export as CSV
            </button>
            <button
              onClick={async () => {
                const res = await fetch('/api/domains/export?format=json');
                if (res.ok) {
                  const blob = await res.blob();
                  download(blob, 'domains-export.json');
                }
              }}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              Export as JSON
            </button>
          </div>
        </div>
      )}
    </div>
  );
}