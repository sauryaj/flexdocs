'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useOrganization } from '@/lib/OrganizationContext';
import { Send, Sparkles, FileText, Loader2 } from 'lucide-react';

interface Answer {
  answer: string;
  sources: { id: string; title: string }[];
}

const SUGGESTIONS = [
  'What is the VPN configuration?',
  'Summarize the network setup',
  'Which servers exist and what do they run?',
  'How do we handle backups?',
];

export default function AssistantPage() {
  const { selectedOrg } = useOrganization();
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<{ q: string; a: Answer | null; error?: string }[]>([]);
  const [busy, setBusy] = useState(false);

  const ask = async (q: string) => {
    if (!q.trim() || busy) return;
    setBusy(true);
    setQuestion('');
    setHistory((h) => [...h, { q, a: null }]);
    try {
      const res = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, ...(selectedOrg?.id ? { organizationId: selectedOrg.id } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      setHistory((h) => {
        const next = [...h];
        next[next.length - 1] = res.ok
          ? { q, a: { answer: data.answer, sources: data.sources ?? [] } }
          : { q, a: null, error: data.error || 'Request failed.' };
        return next;
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--foreground)' }}>
          <Sparkles className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          Ask the Docs
        </h1>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          Answers grounded in your documentation only{selectedOrg ? ` — scoped to ${selectedOrg.name}` : ''}. Secrets never leave the vault.
        </p>
      </div>

      {history.length === 0 && (
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--muted)' }}>Try asking</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => ask(s)}
                className="text-xs px-3 py-1.5 rounded-full border transition-colors hover:border-[var(--accent)]"
                style={{ borderColor: 'var(--card-border)', color: 'var(--muted)' }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-4">
        {history.map((h, i) => (
          <div key={i} className="space-y-2">
            <div className="flex justify-end">
              <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-br-sm text-sm font-medium" style={{ backgroundColor: 'var(--accent)', color: '#fff' }}>
                {h.q}
              </div>
            </div>
            {h.error ? (
              <div className="card p-4 text-sm" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}>{h.error}</div>
            ) : !h.a ? (
              <div className="card p-4 flex items-center gap-2 text-sm" style={{ color: 'var(--muted)' }}>
                <Loader2 className="w-4 h-4 animate-spin" /> Reading the docs…
              </div>
            ) : (
              <div className="card p-4">
                <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--foreground)' }}>{h.a.answer}</p>
                {h.a.sources.length > 0 && (
                  <div className="mt-3 pt-3 flex flex-wrap gap-1.5" style={{ borderTop: '1px solid var(--card-border)' }}>
                    <span className="text-[10px] font-semibold uppercase tracking-wider mr-1 self-center" style={{ color: 'var(--muted)' }}>Sources</span>
                    {h.a.sources.map((s) => (
                      <Link
                        key={s.id}
                        href={`/dashboard/documents/${s.id}`}
                        className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border hover:underline"
                        style={{ borderColor: 'var(--card-border)', color: 'var(--muted)' }}
                      >
                        <FileText className="w-3 h-3" /> {s.title}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Composer */}
      <div className="sticky bottom-4">
        <div className="card p-2 flex items-center gap-2 shadow-lg">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(question); } }}
            placeholder={selectedOrg ? `Ask about ${selectedOrg.name}…` : 'Ask your documentation…'}
            aria-label="Ask the documentation"
            className="input-field border-0 focus:ring-0 flex-1"
            autoFocus
          />
          <button onClick={() => ask(question)} disabled={busy || !question.trim()} aria-label="Send question" className="btn-primary p-2.5 disabled:opacity-40">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
