'use client';

import { useState, useEffect } from 'react';
import { Database, Download, Loader2, HardDrive } from 'lucide-react';

interface BackupFile {
  name: string;
  size: number;
  created: string;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function BackupSection() {
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => { fetchBackups(); }, []);

  const fetchBackups = async () => {
    const res = await fetch('/api/backups');
    if (res.ok) setBackups(await res.json());
    setLoading(false);
  };

  const handleCreateBackup = async () => {
    setCreating(true);
    await fetch('/api/backups', { method: 'POST' });
    await fetchBackups();
    setCreating(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Database className="w-8 h-8 text-purple-500" />
          <div>
            <h3 className="font-semibold text-slate-900">Database Backups</h3>
            <p className="text-sm text-slate-500">Automated PostgreSQL backups (retained for 30 days)</p>
          </div>
        </div>
        <button onClick={handleCreateBackup} disabled={creating} className="btn-primary flex items-center gap-2">
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Create Backup
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading backups...</div>
      ) : backups.length === 0 ? (
        <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg">
          <HardDrive className="w-5 h-5 text-slate-400" />
          <p className="text-sm text-slate-500">No backups yet. Click &quot;Create Backup&quot; to generate one.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {backups.map((b) => (
            <div key={b.name} className="flex items-center justify-between p-3 bg-white border rounded-lg">
              <div className="flex items-center gap-3">
                <Database className="w-4 h-4 text-purple-400" />
                <div>
                  <p className="font-medium text-slate-900 text-sm">{b.name}</p>
                  <p className="text-xs text-slate-500">{formatBytes(b.size)} &middot; {new Date(b.created).toLocaleString()}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
