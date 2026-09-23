'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function InvitePage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [existing, setExisting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setToken(new URLSearchParams(window.location.hash.slice(1)).get('token') || ''); }, []);
  async function accept(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const res = await fetch('/api/invitations/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, ...(!existing ? { name, password } : {}) }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not accept invitation');
      window.history.replaceState(null, '', '/invite');
      router.push('/dashboard'); router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to connect. Try again.'); }
    finally { setBusy(false); }
  }
  return <main className="min-h-screen flex items-center justify-center p-6 bg-slate-950 text-slate-100">
    <form onSubmit={accept} className="w-full max-w-md rounded-2xl border border-slate-700 p-8 space-y-5">
      <h1 className="text-2xl font-semibold">Join FlexDocs</h1>
      <p className="text-sm text-slate-300">Accept your invitation to access your team’s documentation.</p>
      <label className="flex items-center gap-2"><input type="checkbox" checked={existing} onChange={e => setExisting(e.target.checked)} />I already have an account</label>
      {existing ? <p className="text-sm"> <a href="/login" target="_blank" rel="noopener noreferrer" className="underline">Sign in in a new tab</a> as the invited email address, then return and accept. Your existing role and password stay unchanged.</p> : <>
        <label className="block">Name<input required autoComplete="name" value={name} onChange={e => setName(e.target.value)} className="input-field mt-1" /></label>
        <label className="block">Password<input required type="password" minLength={12} maxLength={200} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} className="input-field mt-1" /><span className="text-xs text-slate-400">At least 12 characters</span></label>
      </>}
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      {!token && <p className="text-sm text-amber-300">Open the complete invitation link provided by your admin.</p>}
      <button type="submit" disabled={busy || !token} className="btn-primary w-full">{busy ? 'Accepting…' : 'Accept invitation'}</button>
    </form>
  </main>;
}
