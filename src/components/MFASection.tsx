'use client';

import { useState, useEffect } from 'react';
import { Shield, ShieldCheck, ShieldOff, Loader2, Copy, Check, AlertTriangle, Key } from 'lucide-react';

interface MFAStatus {
  mfaEnabled: boolean;
  mfaSecret?: string;
  qrCodeUrl?: string;
}

export default function MFASection() {
  const [mfaStatus, setMfaStatus] = useState<MFAStatus>({ mfaEnabled: false });
  const [loading, setLoading] = useState(true);
  const [setupMode, setSetupMode] = useState(false);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryCount, setRecoveryCount] = useState({ total: 0, used: 0, remaining: 0 });

  useEffect(() => { fetchStatus(); }, []);

  const fetchStatus = async () => {
    const res = await fetch('/api/profile');
    const data = await res.json();
    setMfaStatus({ mfaEnabled: data.mfaEnabled });
    const rcRes = await fetch('/api/mfa/recovery-codes');
    if (rcRes.ok) setRecoveryCount(await rcRes.json());
    setLoading(false);
  };

  const handleSetup = async () => {
    const res = await fetch('/api/mfa/setup', { method: 'POST' });
    const data = await res.json();
    setMfaStatus(data);
    setSetupMode(true);
  };

  const handleVerify = async () => {
    setVerifying(true);
    setError('');
    const res = await fetch('/api/mfa/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: verifyCode }),
    });
    const data = await res.json();
    if (res.ok) {
      setMfaStatus((prev) => ({ ...prev, mfaEnabled: true }));
      setSetupMode(false);
      setVerifyCode('');
      generateRecoveryCodes();
    } else {
      setError(data.error || 'Invalid code');
    }
    setVerifying(false);
  };

  const generateRecoveryCodes = async () => {
    const res = await fetch('/api/mfa/recovery-codes', { method: 'POST' });
    const data = await res.json();
    setRecoveryCodes(data.codes);
    setShowRecovery(true);
    setRecoveryCount({ total: 10, used: 0, remaining: 10 });
  };

  const handleDisable = async () => {
    if (!confirm('Disable 2FA? This reduces account security.')) return;
    setDisabling(true);
    const res = await fetch('/api/mfa/disable', { method: 'POST' });
    if (res.ok) setMfaStatus({ mfaEnabled: false });
    setDisabling(false);
  };

  const copyCodes = () => {
    navigator.clipboard.writeText(recoveryCodes.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading MFA status...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {mfaStatus.mfaEnabled ? <ShieldCheck className="w-8 h-8 text-green-500" /> : <ShieldOff className="w-8 h-8 text-slate-400" />}
        <div>
          <h3 className="font-semibold text-slate-900">Two-Factor Authentication (2FA)</h3>
          <p className="text-sm text-slate-500">
            {mfaStatus.mfaEnabled ? '2FA is enabled. Your account has an extra layer of security.' : 'Add an extra layer of security with an authenticator app.'}
          </p>
        </div>
      </div>

      {mfaStatus.mfaEnabled && !setupMode ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-100 text-green-700 text-sm font-medium">
              <ShieldCheck className="w-3.5 h-3.5" /> Enabled
            </span>
            <button onClick={handleDisable} disabled={disabling} className="btn-secondary text-red-600 hover:bg-red-50 flex items-center gap-1.5">
              {disabling ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldOff className="w-4 h-4" />} Disable 2FA
            </button>
          </div>
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-amber-600" />
                <span className="text-sm text-amber-800">
                  Recovery Codes: {recoveryCount.remaining} remaining
                </span>
              </div>
              <button onClick={async () => { await generateRecoveryCodes(); }} className="text-sm text-amber-700 hover:text-amber-900 underline">
                Regenerate
              </button>
            </div>
          </div>
        </div>
      ) : showRecovery && recoveryCodes.length > 0 ? (
        <div className="p-4 bg-slate-50 rounded-lg border space-y-3">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-amber-500" />
            <h4 className="font-semibold text-slate-900">Recovery Codes</h4>
          </div>
          <p className="text-sm text-slate-600">Save these codes somewhere safe. Each code can only be used once.</p>
          <div className="grid grid-cols-2 gap-2">
            {recoveryCodes.map((code, i) => (
              <code key={i} className="px-3 py-2 bg-white border rounded text-sm font-mono text-center">{code}</code>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={copyCodes} className="btn-secondary flex items-center gap-1 text-sm">
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />} Copy All
            </button>
            <button onClick={() => setShowRecovery(false)} className="btn-primary text-sm">Done</button>
          </div>
        </div>
      ) : setupMode && mfaStatus.qrCodeUrl ? (
        <div className="space-y-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
          <div className="text-center">
            <p className="text-sm text-slate-600 mb-3">Scan this QR code with your authenticator app</p>
            <img src={mfaStatus.qrCodeUrl} alt="MFA QR Code" className="mx-auto w-48 h-48" />
          </div>
          <div className="space-y-2">
            <p className="text-xs text-slate-500 text-center">Or enter this secret manually:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-white rounded border text-sm font-mono break-all">{mfaStatus.mfaSecret}</code>
              <button onClick={() => { navigator.clipboard.writeText(mfaStatus.mfaSecret || ''); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="btn-secondary p-2">
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">Verification Code</label>
            <div className="flex gap-2">
              <input type="text" value={verifyCode} onChange={(e) => setVerifyCode(e.target.value)} placeholder="Enter 6-digit code" className="input-field flex-1" maxLength={6} />
              <button onClick={handleVerify} disabled={verifying || verifyCode.length !== 6} className="btn-primary flex items-center gap-2">
                {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Verify & Enable
              </button>
            </div>
            {error && <p className="text-sm text-red-600 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {error}</p>}
          </div>
          <button onClick={() => { setSetupMode(false); setError(''); }} className="text-sm text-slate-500 hover:text-slate-700">Cancel</button>
        </div>
      ) : (
        <button onClick={handleSetup} className="btn-primary flex items-center gap-2">
          <Shield className="w-4 h-4" /> Enable 2FA
        </button>
      )}
    </div>
  );
}
