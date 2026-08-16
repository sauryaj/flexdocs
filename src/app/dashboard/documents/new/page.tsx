'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Save,
  Loader2,
  Eye,
  Edit3,
  Columns,
  FileText,
  AtSign,
  Bold,
  Italic,
  List,
  Heading,
  Code,
  Table,
  AlertCircle,
  Trash2,
  RotateCcw,
  Sparkles,
  BookOpen,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { MentionPicker } from '@/components/MentionPicker';
import { MarkdownPreview } from '@/components/MarkdownPreview';

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

const TEMPLATES = [
  {
    id: 'sop',
    name: 'SOP (Procedure)',
    category: 'procedure',
    tags: 'sop, procedure, operations',
    icon: BookOpen,
    description: 'Standard Operating Procedure template with prerequisites and rollback steps',
    content: `# Standard Operating Procedure: [Procedure Name]

## 1. Overview & Purpose
Provide a high-level summary of what this procedure achieves and who should follow it.

## 2. Prerequisites & Requirements
- [ ] Required permission role / access level
- [ ] Access to target environment
- [ ] Required CLI tools or software packages

## 3. Step-by-Step Instructions
### Step 1: Initial Health & Environment Check
\`\`\`bash
# Check system status & kernel version
uname -a
df -h
\`\`\`

### Step 2: Main Operational Execution
Execute the procedure steps carefully:
1. Pause active background jobs
2. Apply system updates or configuration patches

### Step 3: Post-Execution Verification
\`\`\`bash
# Verify service health status
curl -I http://localhost:3000/api/health
\`\`\`

## 4. Rollback Plan
If an unexpected failure occurs, execute the following steps:
1. Stop running processes
2. Revert to previous backup state
`,
  },
  {
    id: 'runbook',
    name: 'Server Runbook',
    category: 'runbook',
    tags: 'runbook, server, infrastructure',
    icon: FileText,
    description: 'Infrastructure runbook for host specs, service management, and diagnostics',
    content: `# Runbook: [Server / Service Name]

> [!NOTE]
> **Environment**: Production | **Primary Owner**: DevOps Infrastructure Team

## System Specification
- **Hostname / Primary IP**: \`10.0.0.45\`
- **Operating System**: Ubuntu 22.04 LTS
- **Role**: Core Database & Cache Host

## Key Service Management Commands
### Service Status & Control
\`\`\`bash
# Check service status
sudo systemctl status app-service

# Restart service safely
sudo systemctl restart app-service
\`\`\`

### Diagnostics & Log Tail
\`\`\`bash
# Inspect live logs (last 100 lines)
journalctl -u app-service -f -n 100
\`\`\`

## Disaster Recovery & Backups
- Automated snapshots occur daily at 02:00 UTC.
- Backup location: \`/mnt/backups/daily\`
`,
  },
  {
    id: 'postmortem',
    name: 'Incident Post-Mortem',
    category: 'general',
    tags: 'incident, post-mortem, rca',
    icon: AlertCircle,
    description: 'Root Cause Analysis template with timeline and preventive action items',
    content: `# Incident Post-Mortem: [Incident Title]

> [!WARNING]
> **Severity**: P1 - High | **Date**: ${new Date().toISOString().split('T')[0]}

## Executive Summary
Brief description of the service disruption, total duration, and affected user scope.

## Impact Metrics
- **Downtime Duration**: 35 minutes
- **Affected Services**: Authentication Service, Web Dashboard
- **User Impact**: ~12% of active API sessions

## Incident Timeline (UTC)
- **14:00** - Automated monitor reported latency spikes.
- **14:08** - On-call engineer acknowledged alert; triage initiated.
- **14:22** - Root cause identified (database connection pool exhaustion).
- **14:35** - Connection pool limit adjusted and service restarted.
- **14:40** - All metric dashboards returned to baseline green.

## Root Cause Analysis (RCA)
Detailed technical explanation of why the failure occurred.

## Remediation & Preventive Actions
- [ ] Adjust default database max connections configuration
- [ ] Add automated alerting threshold for connection pool usage > 80%
`,
  },
  {
    id: 'onboarding',
    name: 'Onboarding Guide',
    category: 'onboarding',
    tags: 'onboarding, setup, access',
    icon: CheckCircle2,
    description: 'Team member onboarding guide with checklist and required access steps',
    content: `# Team Onboarding & Setup Guide

Welcome to the team! Follow this setup guide to get your workspace and access configured.

## Provisioning Checklist
- [ ] Create corporate SSO account
- [ ] Set up multi-factor authentication (MFA)
- [ ] Provision SSH keys and add to GitHub organization
- [ ] Request access to staging and development clusters

## Core Resources & Documentation
- Workspace API Documentation
- Engineering Coding Standards & Guidelines
`,
  },
];

const DRAFT_KEY = 'flexdocs_new_doc_draft';

export default function NewDocumentPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading editor...</div>}>
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

  const [viewMode, setViewMode] = useState<'write' | 'preview' | 'split'>('write');
  const [isMentionOpen, setIsMentionOpen] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load Folders & Organizations
  useEffect(() => {
    Promise.all([
      fetch('/api/folders').then((r) => r.json()),
      fetch('/api/organizations').then((r) => r.json()),
    ]).then(([foldersData, orgsData]) => {
      if (Array.isArray(foldersData)) setFolders(foldersData);
      if (Array.isArray(orgsData)) setOrganizations(orgsData);
    });
  }, []);

  // Check for auto-saved draft on mount
  useEffect(() => {
    try {
      const savedDraft = localStorage.getItem(DRAFT_KEY);
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft);
        if (parsed.title || parsed.content) {
          setTitle(parsed.title || '');
          setContent(parsed.content || '');
          if (parsed.category) setCategory(parsed.category);
          if (parsed.folderId) setFolderId(parsed.folderId);
          if (parsed.organizationId) setOrganizationId(parsed.organizationId);
          if (parsed.tags) setTags(parsed.tags);
          setHasDraft(true);
          if (parsed.savedAt) {
            setDraftSavedAt(new Date(parsed.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
          }
        }
      }
    } catch {
      // Ignore localStorage read errors
    }
  }, []);

  // Auto-save draft on changes
  useEffect(() => {
    if (!title && !content) return;
    const timeout = setTimeout(() => {
      try {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({
            title,
            content,
            category,
            folderId,
            organizationId,
            tags,
            savedAt: new Date().toISOString(),
          })
        );
        setHasDraft(true);
        setDraftSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      } catch {
        // Ignore localStorage write errors
      }
    }, 1000);

    return () => clearTimeout(timeout);
  }, [title, content, category, folderId, organizationId, tags]);

  const clearDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    setTitle('');
    setContent('');
    setCategory('general');
    setFolderId(presetFolderId);
    setOrganizationId('');
    setTags('');
    setHasDraft(false);
    setDraftSavedAt(null);
  };

  const applyTemplate = (tmpl: (typeof TEMPLATES)[0]) => {
    if (content && !confirm('Applying a template will overwrite your current document content. Continue?')) {
      return;
    }
    if (!title || title === '') {
      setTitle(tmpl.name);
    }
    setContent(tmpl.content);
    setCategory(tmpl.category);
    setTags(tmpl.tags);
  };

  const insertFormatting = (prefix: string, suffix: string = '', defaultText: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end) || defaultText;
    const replacement = `${prefix}${selectedText}${suffix}`;

    const newContent = content.substring(0, start) + replacement + content.substring(end);
    setContent(newContent);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + selectedText.length);
    }, 0);
  };

  const handleSelectMention = (item: { id: string; name: string; type: string }) => {
    const textarea = textareaRef.current;
    const mentionTag = `@[${item.name}](${item.type}:${item.id})`;

    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newContent = content.substring(0, start) + mentionTag + content.substring(end);
      setContent(newContent);

      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + mentionTag.length, start + mentionTag.length);
      }, 0);
    } else {
      setContent((prev) => prev + ' ' + mentionTag);
    }
    setIsMentionOpen(false);
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
      localStorage.removeItem(DRAFT_KEY);
      const doc = await res.json();
      router.push(`/dashboard/documents/${doc.id}`);
    }
    setLoading(false);
  };

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const charCount = content.length;
  const readTime = Math.max(1, Math.ceil(wordCount / 200));

  const safeFolders = Array.isArray(folders) ? folders : [];
  const safeOrgs = Array.isArray(organizations) ? organizations : [];
  const rootFolders = safeFolders.filter((f) => f && !f.parentId);

  const renderFolderOption = (folder: Folder, depth: number = 0) => {
    return (
      <option key={folder.id} value={folder.id}>
        {'  '.repeat(depth)}
        {depth > 0 ? '└ ' : ''}
        {folder.name}
      </option>
    );
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Top Header Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/documents" className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">New Document</h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Create a new documentation entry or runbook
            </p>
          </div>
        </div>

        {/* Draft Restore & Clear Notification */}
        {hasDraft && (
          <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-3 py-1.5 rounded-xl text-xs text-amber-800 dark:text-amber-300">
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Draft auto-saved {draftSavedAt ? `at ${draftSavedAt}` : ''}</span>
            <button
              type="button"
              onClick={clearDraft}
              className="ml-2 underline text-amber-900 dark:text-amber-200 hover:text-red-600 font-semibold"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Templates Selector */}
        <div className="card p-4 space-y-3 bg-gradient-to-r from-blue-50/50 via-white to-indigo-50/50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900/80 border border-blue-100 dark:border-slate-800">
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
            <Sparkles className="w-4 h-4" />
            <span>Quick Document Templates</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {TEMPLATES.map((tmpl) => {
              const IconComp = tmpl.icon;
              return (
                <button
                  key={tmpl.id}
                  type="button"
                  onClick={() => applyTemplate(tmpl)}
                  className="p-3 text-left bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md transition-all group"
                >
                  <div className="flex items-center gap-2 font-semibold text-sm text-slate-800 dark:text-slate-200 group-hover:text-blue-600">
                    <IconComp className="w-4 h-4 text-blue-500" />
                    <span>{tmpl.name}</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                    {tmpl.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Primary Document Metadata */}
        <div className="card p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Document Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input-field text-lg font-semibold"
              placeholder="e.g. Production Web Server Setup & Disaster Recovery SOP"
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="input-field capitalize"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Folder</label>
              <select
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
                className="input-field"
              >
                <option value="">No folder (Root)</option>
                {rootFolders.map((f) => renderFolderOption(f))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Organization</label>
              <select
                value={organizationId}
                onChange={(e) => setOrganizationId(e.target.value)}
                className="input-field"
              >
                <option value="">No organization</option>
                {safeOrgs.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Tags (comma separated)
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="input-field"
              placeholder="e.g. network, windows, server-2022, production"
            />
          </div>
        </div>

        {/* Content Section & Rich Toolbar */}
        <div className="card p-6 space-y-4">
          {/* Header Controls: Formatting Toolbar & View Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
            {/* Formatting Action Tools */}
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => insertFormatting('**', '**', 'bold text')}
                title="Bold"
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-300 transition-colors"
              >
                <Bold className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => insertFormatting('*', '*', 'italic text')}
                title="Italic"
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-300 transition-colors"
              >
                <Italic className="w-4 h-4" />
              </button>
              <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1" />
              <button
                type="button"
                onClick={() => insertFormatting('## ', '', 'Heading 2')}
                title="Heading"
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-300 transition-colors"
              >
                <Heading className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => insertFormatting('- ', '', 'List item')}
                title="Bullet List"
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-300 transition-colors"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => insertFormatting('```bash\n', '\n```', '# bash commands here')}
                title="Code Block"
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-300 transition-colors"
              >
                <Code className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() =>
                  insertFormatting(
                    '\n| Feature | Status | Notes |\n| :--- | :--- | :--- |\n| Service A | Active | Primary |\n'
                  )
                }
                title="Insert Table"
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-300 transition-colors"
              >
                <Table className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => insertFormatting('> [!NOTE]\n> ', '', 'Important note details...')}
                title="Callout Box"
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-300 transition-colors"
              >
                <AlertCircle className="w-4 h-4" />
              </button>

              <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1" />

              {/* Mention Asset Button */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsMentionOpen(!isMentionOpen)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-xs font-semibold rounded-lg border border-blue-200 dark:border-blue-800 transition-all"
                >
                  <AtSign className="w-3.5 h-3.5" />
                  <span>Mention Asset...</span>
                </button>

                <MentionPicker
                  isOpen={isMentionOpen}
                  onClose={() => setIsMentionOpen(false)}
                  onSelect={handleSelectMention}
                />
              </div>
            </div>

            {/* View Mode Switcher (Write / Preview / Split) */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-medium">
              <button
                type="button"
                onClick={() => setViewMode('write')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all ${
                  viewMode === 'write'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Write</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('preview')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all ${
                  viewMode === 'preview'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Preview</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('split')}
                className={`hidden md:flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all ${
                  viewMode === 'split'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Columns className="w-3.5 h-3.5" />
                <span>Split</span>
              </button>
            </div>
          </div>

          {/* Editor Body depending on ViewMode */}
          <div className="min-h-[420px]">
            {viewMode === 'write' && (
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="input-field min-h-[420px] font-mono text-sm leading-relaxed p-4 bg-slate-50/50 dark:bg-slate-950/50 focus:bg-white dark:focus:bg-slate-950 transition-colors"
                placeholder="Write your documentation here... (supports Markdown formatting & @mentions)"
              />
            )}

            {viewMode === 'preview' && (
              <div className="min-h-[420px] p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 overflow-y-auto">
                {content.trim() ? (
                  <MarkdownPreview content={content} />
                ) : (
                  <div className="text-slate-400 italic text-center py-16">
                    Nothing to preview. Write some documentation content above.
                  </div>
                )}
              </div>
            )}

            {viewMode === 'split' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-h-[420px]">
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="input-field min-h-[420px] font-mono text-sm leading-relaxed p-4 bg-slate-50/50 dark:bg-slate-950/50 focus:bg-white dark:focus:bg-slate-950 transition-colors"
                  placeholder="Write your documentation here..."
                />
                <div className="min-h-[420px] p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 overflow-y-auto max-h-[500px]">
                  {content.trim() ? (
                    <MarkdownPreview content={content} />
                  ) : (
                    <div className="text-slate-400 italic text-center py-16">
                      Live preview pane...
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer Stats & Actions */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-4">
              <span>{wordCount} words</span>
              <span>•</span>
              <span>{charCount} characters</span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {readTime} min read
              </span>
            </div>

            <div className="flex items-center gap-3">
              <Link href="/dashboard/documents" className="btn-secondary text-xs">
                Cancel
              </Link>
              <button type="submit" disabled={loading} className="btn-primary flex items-center gap-2 text-xs py-2 px-4">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Document
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

