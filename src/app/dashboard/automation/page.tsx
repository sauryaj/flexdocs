'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useOrganization } from '@/lib/OrganizationContext';
import { Cloud, Server, Upload, Webhook, ArrowRight, Loader2 } from 'lucide-react';

export default function AutomationPage() {
  const { selectedOrg } = useOrganization();
  const [activeTab, setActiveTab] = useState<'discover' | 'import' | 'ingest' | 'agent'>('discover');

  return (
    <div className="space-y-6 page-enter">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Automation</h1>
        <p className="text-[var(--text-muted)] mt-1">Auto-discover, import, and ingest infrastructure data</p>
      </div>

      <div className="flex gap-2 border-b border-[var(--border)] pb-0">
        {[
          { id: 'discover', label: 'Cloud Discovery', icon: Cloud },
          { id: 'import', label: 'CSV / JSON Import', icon: Upload },
          { id: 'ingest', label: 'Webhook Ingest', icon: Webhook },
          { id: 'agent', label: 'Server Agent', icon: Server },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'discover' && <CloudDiscoveryTab orgId={selectedOrg?.id} />}
      {activeTab === 'import' && <ImportTab orgId={selectedOrg?.id} />}
      {activeTab === 'ingest' && <IngestTab />}
      {activeTab === 'agent' && <AgentTab />}
    </div>
  );
}

function CloudDiscoveryTab({ orgId }: { orgId?: string }) {
  const [credentials, setCredentials] = useState({ accessKeyId: '', secretAccessKey: '', region: 'us-east-1' });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const handleDiscover = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/cloud/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'aws', credentials, organizationId: orgId, region: credentials.region }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="card p-6 space-y-4">
        <h3 className="font-semibold">AWS Auto-Discovery</h3>
        <p className="text-sm text-[var(--text-muted)]">Enter AWS credentials to auto-discover EC2 instances, S3 buckets, and RDS databases.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Access Key ID</label>
            <input
              type="text"
              className="input-field w-full"
              placeholder="AKIA..."
              value={credentials.accessKeyId}
              onChange={(e) => setCredentials({ ...credentials, accessKeyId: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Secret Access Key</label>
            <input
              type="password"
              className="input-field w-full"
              placeholder="..."
              value={credentials.secretAccessKey}
              onChange={(e) => setCredentials({ ...credentials, secretAccessKey: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Region</label>
            <select
              className="input-field w-full"
              value={credentials.region}
              onChange={(e) => setCredentials({ ...credentials, region: e.target.value })}
            >
              <option value="us-east-1">US East (N. Virginia)</option>
              <option value="us-west-2">US West (Oregon)</option>
              <option value="eu-west-1">EU (Ireland)</option>
              <option value="eu-central-1">EU (Frankfurt)</option>
              <option value="ap-southeast-1">Asia Pacific (Singapore)</option>
              <option value="ap-northeast-1">Asia Pacific (Tokyo)</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleDiscover}
            disabled={loading || !credentials.accessKeyId}
            className="btn-primary flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />}
            {loading ? 'Scanning...' : 'Discover Resources'}
          </button>
          <Link href="/dashboard/cloud" className="btn-secondary flex items-center gap-2">
            View Cloud Resources <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {error && <div className="card p-4 border-red-500/50 bg-red-500/10 text-red-400 text-sm">{error}</div>}

      {result && (
        <div className="card p-6 space-y-3">
          <h3 className="font-semibold">Discovery Results</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-3xl font-bold text-[var(--accent)]">{result.discovered}</div>
              <div className="text-sm text-[var(--text-muted)]">Discovered</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-green-500">{result.created}</div>
              <div className="text-sm text-[var(--text-muted)]">Created</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-amber-500">{result.skipped}</div>
              <div className="text-sm text-[var(--text-muted)]">Skipped</div>
            </div>
          </div>
        </div>
      )}

      <div className="card p-6 space-y-3">
        <h3 className="font-semibold">How it works</h3>
        <div className="space-y-2 text-sm text-[var(--text-muted)]">
          <p>1. Enter your AWS access key credentials (read-only access recommended)</p>
          <p>2. The system scans EC2, S3, and RDS in the selected region</p>
          <p>3. New resources are automatically added to your Cloud Resources module</p>
          <p>4. Existing resources (matched by resourceId) are skipped to avoid duplicates</p>
        </div>
      </div>
    </div>
  );
}

function ImportTab({ orgId }: { orgId?: string }) {
  const [module, setModule] = useState('servers');
  const [csvText, setCsvText] = useState('');
  const [jsonText, setJsonText] = useState('');
  const [format, setFormat] = useState<'csv' | 'json'>('csv');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (f.name.endsWith('.csv')) {
        setFormat('csv');
        setCsvText(text);
      } else {
        setFormat('json');
        setJsonText(text);
      }
    };
    reader.readAsText(f);
  };

  const handleImport = async () => {
    setLoading(true);
    setError('');
    try {
      const data = format === 'csv' ? csvText : jsonText;
      if (!data.trim()) throw new Error('No data to import');
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module, data, format, organizationId: orgId }),
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error);
      setResult(resData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const sampleCsv = `name,hostname,ip,os,status
Web Server 01,web01,192.168.1.10,Ubuntu 22.04,active
DB Server 01,db01,192.168.1.20,PostgreSQL 15,active
App Server 01,app01,192.168.1.30,CentOS 9,active`;

  return (
    <div className="space-y-6">
      <div className="card p-6 space-y-4">
        <h3 className="font-semibold">Bulk Import</h3>
        <p className="text-sm text-[var(--text-muted)]">Import servers, network docs, cloud resources, or maintenance windows from CSV/JSON.</p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Target Module</label>
            <select className="input-field w-full" value={module} onChange={(e) => setModule(e.target.value)}>
              <option value="servers">Server Inventory</option>
              <option value="network">Network Documentation</option>
              <option value="cloud">Cloud Resources</option>
              <option value="maintenance">Maintenance Windows</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Format</label>
            <div className="flex gap-2">
              <button onClick={() => setFormat('csv')} className={`px-4 py-2 rounded-lg text-sm font-medium ${format === 'csv' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--surface-1)] text-[var(--text)]'}`}>CSV</button>
              <button onClick={() => setFormat('json')} className={`px-4 py-2 rounded-lg text-sm font-medium ${format === 'json' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--surface-1)] text-[var(--text)]'}`}>JSON</button>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Upload File</label>
          <input type="file" accept=".csv,.json" onChange={handleFile} className="input-field w-full" />
        </div>

        {format === 'csv' ? (
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-medium text-[var(--text-muted)]">CSV Data</label>
              <button onClick={() => setCsvText(sampleCsv)} className="text-xs text-[var(--accent)] hover:underline">Load sample</button>
            </div>
            <textarea
              className="input-field w-full font-mono text-sm h-48"
              placeholder="name,hostname,ip,os,status"
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
            />
          </div>
        ) : (
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">JSON Data</label>
            <textarea
              className="input-field w-full font-mono text-sm h-48"
              placeholder='[{"name": "Server 1", "hostname": "web01"}]'
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
            />
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={handleImport} disabled={loading} className="btn-primary flex items-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {loading ? 'Importing...' : 'Import Data'}
          </button>
        </div>
      </div>

      {error && <div className="card p-4 border-red-500/50 bg-red-500/10 text-red-400 text-sm">{error}</div>}

      {result && (
        <div className="card p-6 space-y-3">
          <h3 className="font-semibold">Import Results</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-3xl font-bold text-[var(--accent)]">{result.total}</div>
              <div className="text-sm text-[var(--text-muted)]">Total</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-green-500">{result.created}</div>
              <div className="text-sm text-[var(--text-muted)]">Created</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-red-500">{result.errors}</div>
              <div className="text-sm text-[var(--text-muted)]">Errors</div>
            </div>
          </div>
          {result.errorDetails?.length > 0 && (
            <div className="mt-3 space-y-1">
              {result.errorDetails.map((err: any, i: number) => (
                <div key={i} className="text-xs text-red-400">Row {err.index}: {err.error}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function IngestTab() {
  const [source, setSource] = useState('');
  const [module, setModule] = useState('servers');
  const [jsonPayload, setJsonPayload] = useState('[\n  {\n    "name": "Server 1",\n    "hostname": "web01",\n    "os": "Ubuntu 22.04",\n    "cpu": "Intel Xeon",\n    "ram_gb": 16,\n    "storage_gb": 500\n  }\n]');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const handleIngest = async () => {
    setLoading(true);
    setError('');
    try {
      const records = JSON.parse(jsonPayload);
      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, module, records }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="card p-6 space-y-4">
        <h3 className="font-semibold">Webhook Ingestion</h3>
        <p className="text-sm text-[var(--text-muted)]">Push data from external tools (Prometheus, Datadog, custom scripts) via API.</p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Source Name</label>
            <input className="input-field w-full" placeholder="e.g. prometheus, datadog, custom" value={source} onChange={(e) => setSource(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Target Module</label>
            <select className="input-field w-full" value={module} onChange={(e) => setModule(e.target.value)}>
              <option value="servers">Server Inventory</option>
              <option value="network">Network Documentation</option>
              <option value="cloud">Cloud Resources</option>
              <option value="maintenance">Maintenance Windows</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">JSON Payload (array of records)</label>
          <textarea
            className="input-field w-full font-mono text-sm h-48"
            value={jsonPayload}
            onChange={(e) => setJsonPayload(e.target.value)}
          />
        </div>

        <div className="flex gap-3">
          <button onClick={handleIngest} disabled={loading || !source} className="btn-primary flex items-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Webhook className="w-4 h-4" />}
            {loading ? 'Ingesting...' : 'Send to Ingest'}
          </button>
        </div>

        <div className="mt-4 p-4 bg-[var(--surface-1)] rounded-lg">
          <h4 className="font-medium text-sm mb-2">API Endpoint</h4>
          <code className="text-xs text-[var(--accent)]">POST /api/ingest</code>
          <p className="text-xs text-[var(--text-muted)] mt-1">Include <code>X-API-Key</code> header for authentication</p>
        </div>
      </div>

      {error && <div className="card p-4 border-red-500/50 bg-red-500/10 text-red-400 text-sm">{error}</div>}

      {result && (
        <div className="card p-6 space-y-3">
          <h3 className="font-semibold">Ingestion Results</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-3xl font-bold text-[var(--accent)]">{result.total}</div>
              <div className="text-sm text-[var(--text-muted)]">Total</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-green-500">{result.created}</div>
              <div className="text-sm text-[var(--text-muted)]">Created</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-red-500">{result.errors}</div>
              <div className="text-sm text-[var(--text-muted)]">Errors</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AgentTab() {
  const [apiKey, setApiKey] = useState('');

  const generateAgentScript = () => {
    return `#!/bin/bash
# FlexDocs Server Agent - reports system info to your FlexDocs instance
FLEXDOCS_URL="http://your-flexdocs-host:3001"
API_KEY="${apiKey || 'YOUR_API_KEY_HERE'}"

while true; do
  curl -s -X POST "\${FLEXDOCS_URL}/api/agent/report" \\
    -H "Content-Type: application/json" \\
    -d '{
      "apiKey": "'\${API_KEY}'",
      "hostname": "'$(hostname)'",
      "os": "'$(uname -s)'",
      "osVersion": "'$(uname -r)'",
      "cpu": "'$(grep -m1 "model name" /proc/cpuinfo | cut -d: -f2 | xargs)'",
      "cpuCores": '$(nproc)',
      "ramGB": '$(free -g | awk '/Mem:/{print $2}')',
      "storageGB": '$(df -BG / | tail -1 | awk "{print $2}" | tr -d G)',
      "ipAddress": "'$(hostname -I | awk '{print $1}')'",
      "uptime": '$(awk '{print int($1)}' /proc/uptime)',
      "loadAverage": ['$(cat /proc/loadavg | cut -d' ' -f1-3 | tr ' ' ',')'],
      "diskUsage": [{"mount": "/", "used": '$(df -BG / | tail -1 | awk "{print $3}" | tr -d G)', "total": '$(df -BG / | tail -1 | awk "{print $2}" | tr -d G)', "percent": '$(df / | tail -1 | awk "{print $5}" | tr -d %)'}]
    }'
  sleep 300
done`;
  };

  return (
    <div className="space-y-6">
      <div className="card p-6 space-y-4">
        <h3 className="font-semibold">Server Agent</h3>
        <p className="text-sm text-[var(--text-muted)]">Deploy a lightweight agent on your servers to auto-report specs and health.</p>

        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Your API Key (for the agent script)</label>
          <input className="input-field w-full" placeholder="fd_..." value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        </div>

        <div className="p-4 bg-[var(--surface-1)] rounded-lg">
          <h4 className="font-medium text-sm mb-2">How it works</h4>
          <div className="space-y-1 text-xs text-[var(--text-muted)]">
            <p>1. Generate an API key from Settings &gt; API Keys</p>
            <p>2. Copy the shell script below and run it on each server</p>
            <p>3. The agent reports every 5 minutes</p>
            <p>4. Servers are auto-created or updated in Server Inventory</p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Agent Script</label>
          <pre className="bg-black/20 rounded-lg p-4 text-xs font-mono overflow-x-auto max-h-64 overflow-y-auto">
            {generateAgentScript()}
          </pre>
        </div>
      </div>
    </div>
  );
}
