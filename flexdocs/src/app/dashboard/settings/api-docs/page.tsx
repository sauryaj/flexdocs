'use client';

import { useState } from 'react';

interface Endpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  description: string;
  auth: 'api-key' | 'session' | 'both';
  body?: string;
  response?: string;
}

const ENDPOINTS: Endpoint[] = [
  { method: 'GET', path: '/api/documents', description: 'List all documents', auth: 'both' },
  { method: 'POST', path: '/api/documents', description: 'Create a document', auth: 'both', body: '{ "title": "...", "content": "...", "organizationId": "..." }', response: '{ "id": "...", "title": "...", ... }' },
  { method: 'GET', path: '/api/documents/[id]', description: 'Get a document by ID', auth: 'both' },
  { method: 'PUT', path: '/api/documents/[id]', description: 'Update a document', auth: 'both', body: '{ "title": "...", "content": "..." }' },
  { method: 'DELETE', path: '/api/documents/[id]', description: 'Delete a document', auth: 'both' },
  { method: 'GET', path: '/api/passwords', description: 'List all passwords', auth: 'both' },
  { method: 'POST', path: '/api/passwords', description: 'Create a password entry', auth: 'both', body: '{ "name": "...", "username": "...", "password": "...", "url": "..." }' },
  { method: 'GET', path: '/api/passwords/health', description: 'Get password health report', auth: 'both' },
  { method: 'GET', path: '/api/domains', description: 'List all domains', auth: 'both' },
  { method: 'POST', path: '/api/domains', description: 'Add a domain', auth: 'both', body: '{ "name": "example.com" }' },
  { method: 'GET', path: '/api/assets', description: 'List all flexible assets', auth: 'both' },
  { method: 'POST', path: '/api/assets', description: 'Create an asset', auth: 'both' },
  { method: 'GET', path: '/api/organizations', description: 'List organizations', auth: 'both' },
  { method: 'POST', path: '/api/organizations', description: 'Create an organization', auth: 'both', body: '{ "name": "...", "description": "..." }' },
  { method: 'GET', path: '/api/checklists', description: 'List checklists', auth: 'both' },
  { method: 'POST', path: '/api/checklists', description: 'Create a checklist', auth: 'both' },
  { method: 'GET', path: '/api/servers', description: 'List servers', auth: 'both' },
  { method: 'POST', path: '/api/servers', description: 'Add a server', auth: 'both' },
  { method: 'GET', path: '/api/cloud', description: 'List cloud resources', auth: 'both' },
  { method: 'POST', path: '/api/cloud/discover', description: 'Auto-discover AWS resources', auth: 'both' },
  { method: 'GET', path: '/api/emergency-access', description: 'List emergency access grants', auth: 'both' },
  { method: 'POST', path: '/api/emergency-access', description: 'Request emergency access', auth: 'both' },
  { method: 'GET', path: '/api/api-keys', description: 'List API keys', auth: 'session' },
  { method: 'POST', path: '/api/api-keys', description: 'Create an API key', auth: 'session', body: '{ "name": "..." }' },
  { method: 'GET', path: '/api/webhooks', description: 'List webhooks', auth: 'both' },
  { method: 'POST', path: '/api/webhooks', description: 'Create a webhook', auth: 'both', body: '{ "name": "...", "url": "...", "events": [...] }' },
  { method: 'GET', path: '/api/sessions', description: 'List active sessions', auth: 'session' },
  { method: 'GET', path: '/api/activity', description: 'List activity log entries', auth: 'both' },
  { method: 'POST', path: '/api/activity/export', description: 'Export activity log', auth: 'both' },
  { method: 'POST', path: '/api/import', description: 'Import data (CSV/JSON)', auth: 'both', body: '{ "type": "documents|passwords|domains|assets", "data": [...] }' },
  { method: 'POST', path: '/api/reports', description: 'Generate a report', auth: 'both', body: '{ "type": "documents|passwords|domains|...", "format": "csv|pdf|json" }' },
  { method: 'POST', path: '/api/mfa/setup', description: 'Start MFA setup', auth: 'session' },
  { method: 'POST', path: '/api/mfa/verify', description: 'Verify MFA token', auth: 'session', body: '{ "token": "123456", "secret": "..." }' },
  { method: 'POST', path: '/api/mfa/disable', description: 'Disable MFA', auth: 'session' },
  { method: 'GET', path: '/api/relationships', description: 'List resource relationships', auth: 'both' },
  { method: 'GET', path: '/api/backups', description: 'List backups', auth: 'session' },
  { method: 'POST', path: '/api/backups', description: 'Create a backup', auth: 'session' },
  { method: 'POST', path: '/api/ingest', description: 'Webhook ingestion endpoint', auth: 'api-key' },
  { method: 'POST', path: '/api/agent/report', description: 'Agent report endpoint', auth: 'api-key' },
];

export default function APIDocsPage() {
  const [filter, setFilter] = useState<string>('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const methodColor = (method: string) => {
    switch (method) {
      case 'GET': return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      case 'POST': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
      case 'PUT': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
      case 'PATCH': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400';
      case 'DELETE': return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  const filtered = ENDPOINTS.filter((ep) =>
    !filter || ep.path.toLowerCase().includes(filter.toLowerCase()) ||
    ep.description.toLowerCase().includes(filter.toLowerCase()) ||
    ep.method.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">API Documentation</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          REST API reference for programmatic access
        </p>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h3 className="font-medium text-blue-900 dark:text-blue-200">Authentication</h3>
        <div className="mt-2 text-sm text-blue-800 dark:text-blue-300 space-y-2">
          <p><strong>API Key (Recommended):</strong> Include <code>X-API-Key</code> header</p>
          <pre className="bg-blue-100 dark:bg-blue-800/50 p-2 rounded font-mono text-xs">
{`curl -H "X-API-Key: fd_live_your_key_here" https://your-instance.com/api/documents`}
          </pre>
          <p><strong>Session:</strong> Standard cookie-based authentication (for web UI)</p>
        </div>
      </div>

      <div>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search endpoints..."
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {filtered.map((ep) => {
            const key = `${ep.method}-${ep.path}`;
            const isExpanded = expanded === key;
            return (
              <div key={key}>
                <button
                  onClick={() => setExpanded(isExpanded ? null : key)}
                  className="w-full p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 text-xs font-bold rounded ${methodColor(ep.method)}`}>
                      {ep.method}
                    </span>
                    <code className="text-sm font-mono text-gray-900 dark:text-white">{ep.path}</code>
                    <span className="text-sm text-gray-500 dark:text-gray-400 hidden md:inline">{ep.description}</span>
                    <span className={`ml-auto px-2 py-0.5 text-xs rounded ${
                      ep.auth === 'api-key' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400' :
                      ep.auth === 'session' ? 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/20 dark:text-cyan-400' :
                      'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                    }`}>
                      {ep.auth}
                    </span>
                    <span className="text-gray-400">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 md:hidden">{ep.description}</p>
                </button>
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3">
                    {ep.body && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Request Body</h4>
                        <pre className="bg-gray-100 dark:bg-gray-700 p-3 rounded text-xs font-mono text-gray-900 dark:text-white overflow-x-auto">
                          {ep.body}
                        </pre>
                      </div>
                    )}
                    {ep.response && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Response</h4>
                        <pre className="bg-gray-100 dark:bg-gray-700 p-3 rounded text-xs font-mono text-gray-900 dark:text-white overflow-x-auto">
                          {ep.response}
                        </pre>
                      </div>
                    )}
                    {!ep.body && !ep.response && (
                      <p className="text-sm text-gray-400 dark:text-gray-500">
                        No request body or specific response format documented.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="text-sm text-gray-500 dark:text-gray-400">
        Total: {filtered.length} endpoints
      </div>
    </div>
  );
}
