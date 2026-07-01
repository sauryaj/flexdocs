'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import Link from 'next/link';

const categories = [
  'general',
  'procedure',
  'runbook',
  'network',
  'server',
  'application',
  'compliance',
  'onboarding',
];

interface Folder {
  id: string;
  name: string;
  color: string;
  parentId: string | null;
}

interface Organization {
  id: string;
  name: string;
}

export default function NewDocumentPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
      <NewDocumentForm />
    </Suspense>
  );
}

function NewDocumentForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetFolderId = searchParams.get('folder') || '';
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('general');
  const [folderId, setFolderId] = useState(presetFolderId);
  const [organizationId, setOrganizationId] = useState('');
  const [tags, setTags] = useState('');
  const [folders, setFolders] = useState<Folder[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/folders').then((r) => r.json()),
      fetch('/api/organizations').then((r) => r.json()),
    ]).then(([foldersData, orgsData]) => {
      setFolders(foldersData);
      setOrganizations(orgsData);
    });
  }, []);

  const rootFolders = folders.filter((f) => !f.parentId);

  const renderFolderOption = (folder: Folder, depth: number = 0) => {
    return (
      <option key={folder.id} value={folder.id}>
        {'  '.repeat(depth)}{depth > 0 ? '└ ' : ''}{folder.name}
      </option>
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const tagList = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const res = await fetch('/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        content,
        category,
        folderId: folderId || null,
        organizationId: organizationId || null,
        tags: tagList,
      }),
    });

    if (res.ok) {
      const doc = await res.json();
      router.push(`/dashboard/documents/${doc.id}`);
    }
    setLoading(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/documents" className="p-2 hover:bg-slate-100 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">New Document</h1>
          <p className="text-slate-500">Create a new documentation entry</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input-field text-lg"
            placeholder="Document title..."
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="input-field"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Folder</label>
            <select
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              className="input-field"
            >
              <option value="">No folder (Root)</option>
              {rootFolders.map((f) => renderFolderOption(f))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Organization</label>
          <select
            value={organizationId}
            onChange={(e) => setOrganizationId(e.target.value)}
            className="input-field"
          >
            <option value="">No organization</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Tags (comma separated)
          </label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="input-field"
            placeholder="network, windows, server-2022"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Content</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="input-field min-h-[400px] font-mono text-sm"
            placeholder="Write your documentation here... (supports Markdown)"
          />
        </div>

        <div className="flex justify-end gap-3">
          <Link href="/dashboard/documents" className="btn-secondary">
            Cancel
          </Link>
          <button type="submit" disabled={loading} className="btn-primary flex items-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Document
          </button>
        </div>
      </form>
    </div>
  );
}
