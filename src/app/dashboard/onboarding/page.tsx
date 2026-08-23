'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Building2, Key, Globe, FileText, ShieldCheck, Check,
  ArrowRight, ArrowLeft, PartyPopper,
} from 'lucide-react';

interface StepState {
  done: boolean;
  detail: string;
}

const STEPS = [
  { id: 'org', label: 'Set up an organization', icon: Building2, description: 'Group every asset under a client or business unit.', href: '/dashboard/organizations', cta: 'Manage organizations' },
  { id: 'vault', label: 'Import your credentials', icon: Key, description: 'Bring passwords in from Bitwarden, 1Password, or Chrome in one CSV.', href: '/dashboard/settings/import-export', cta: 'Import vault' },
  { id: 'infra', label: 'Add domains & infrastructure', icon: Globe, description: 'Register what you manage so expiry radar can watch it.', href: '/dashboard/domains', cta: 'Add domains' },
  { id: 'docs', label: 'Create your first document', icon: FileText, description: 'Runbooks, procedures, network notes — markdown with templates.', href: '/dashboard/documents/new', cta: 'New document' },
  { id: 'safety', label: 'Configure a safety net', icon: ShieldCheck, description: 'Name an emergency contact so your team is never locked out.', href: '/dashboard/settings/emergency-access', cta: 'Emergency access' },
] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const [current, setCurrent] = useState(0);
  const [states, setStates] = useState<Record<string, StepState>>({});
  const [loading, setLoading] = useState(true);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [orgRes, pwRes, domRes, docRes, eaRes] = await Promise.all([
          fetch('/api/organizations'),
          fetch('/api/passwords'),
          fetch('/api/domains'),
          fetch('/api/documents'),
          fetch('/api/emergency-access'),
        ]);
        const orgs = await orgRes.json().catch(() => []);
        const pws = await pwRes.json().catch(() => []);
        const doms = await domRes.json().catch(() => []);
        const docs = await docRes.json().catch(() => []);
        const eas = await eaRes.json().catch(() => []);

        const count = (d: unknown) => (Array.isArray(d) ? d.length : Array.isArray((d as any)?.items) ? (d as any).items.length : 0);
        setStates({
          org: { done: count(orgs) > 0, detail: `${count(orgs)} organization${count(orgs) === 1 ? '' : 's'}` },
          vault: { done: count(pws) > 0, detail: `${count(pws)} credential${count(pws) === 1 ? '' : 's'}` },
          infra: { done: count(doms) > 0, detail: `${count(doms)} domain${count(doms) === 1 ? '' : 's'}` },
          docs: { done: count(docs) > 0, detail: `${count(docs)} document${count(docs) === 1 ? '' : 's'}` },
          safety: { done: count(eas) > 0, detail: count(eas) > 0 ? 'contact configured' : 'none yet' },
        });

        // Land on the first incomplete step
        setCurrent(
          STEPS.findIndex(
            (s) =>
              !((s.id === 'org' && count(orgs) > 0) ||
                (s.id === 'vault' && count(pws) > 0) ||
                (s.id === 'infra' && count(doms) > 0) ||
                (s.id === 'docs' && count(docs) > 0) ||
                (s.id === 'safety' && count(eas) > 0)),
          ),
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const allDone = STEPS.every((s) => states[s.id]?.done);

  const finish = () => {
    localStorage.setItem('flexdocs_onboarded', '1');
    setFinished(true);
    setTimeout(() => router.push('/dashboard'), 1500);
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto py-16 text-center text-sm" style={{ color: 'var(--muted)' }}>
        Loading setup progress…
      </div>
    );
  }

  if (finished || allDone) {
    return (
      <div className="max-w-3xl mx-auto card p-12 text-center mt-10">
        <PartyPopper className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--accent)' }} />
        <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>You&apos;re all set</h1>
        <p className="text-sm mt-2" style={{ color: 'var(--muted)' }}>
          Every setup step is complete. Daily monitoring is watching your data automatically.
        </p>
        <Link href="/dashboard" className="btn-primary inline-flex items-center gap-2 mt-6">
          Go to dashboard <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  const step = STEPS[Math.max(current, 0)];
  const state = states[step.id];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Progress */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--foreground)' }}>Welcome to FlexDocs</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
          Five quick steps to make this your single source of truth.
        </p>
        <div className="flex gap-1.5 mt-4">
          {STEPS.map((s, i) => (
            <div
              key={s.id}
              className="h-1.5 flex-1 rounded-full transition-colors"
              style={{ backgroundColor: states[s.id]?.done ? 'var(--accent)' : i === current ? 'var(--accent)' : 'var(--border-subtle)', opacity: states[s.id]?.done ? 1 : i === current ? 0.6 : 1 }}
            />
          ))}
        </div>
      </div>

      {/* Current step */}
      <div className="card p-8">
        <div className="flex items-start gap-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}
          >
            <step.icon className="w-6 h-6" style={{ color: 'var(--accent)' }} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
              Step {current + 1} of {STEPS.length}
            </p>
            <h2 className="text-lg font-semibold mt-0.5" style={{ color: 'var(--foreground)' }}>{step.label}</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>{step.description}</p>
            {state && (
              <p className="text-xs mt-2 font-medium" style={{ color: state.done ? '#10b981' : 'var(--muted)' }}>
                {state.done ? '✓ Complete' : `Status: ${state.detail}`}
              </p>
            )}
            <div className="flex items-center gap-3 mt-5">
              <Link href={step.href} className="btn-primary inline-flex items-center gap-2 text-sm">
                {step.cta} <ArrowRight className="w-4 h-4" />
              </Link>
              <button
                onClick={() => setCurrent((c) => Math.min(c + 1, STEPS.length - 1))}
                className="text-sm hover:underline"
                style={{ color: 'var(--muted)' }}
              >
                Skip for now
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Checklist */}
      <div className="card divide-y" style={{ borderColor: 'var(--card-border)' }}>
        {STEPS.map((s, i) => {
          const st = states[s.id];
          return (
            <button
              key={s.id}
              onClick={() => setCurrent(i)}
              className="w-full flex items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-[var(--surface-1)]"
            >
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 border"
                style={{
                  borderColor: st?.done ? '#10b981' : 'var(--card-border)',
                  backgroundColor: st?.done ? '#10b981' : 'transparent',
                }}
              >
                {st?.done ? <Check className="w-3.5 h-3.5 text-white" /> : <span className="text-[11px]" style={{ color: 'var(--muted)' }}>{i + 1}</span>}
              </span>
              <span className="text-sm font-medium flex-1 truncate" style={{ color: st?.done ? 'var(--muted)' : 'var(--foreground)' }}>
                {s.label}
              </span>
              {st && <span className="text-xs shrink-0" style={{ color: 'var(--muted)' }}>{st.detail}</span>}
              {i !== current && <ArrowRight className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--muted)', opacity: 0.5 }} />}
              {i === current && <ArrowLeft className="w-3.5 h-3.5 rotate-180 shrink-0 hidden" />}
            </button>
          );
        })}
      </div>

      <button onClick={finish} className="text-xs hover:underline mx-auto block" style={{ color: 'var(--muted)' }}>
        Don&apos;t show setup again
      </button>
    </div>
  );
}
