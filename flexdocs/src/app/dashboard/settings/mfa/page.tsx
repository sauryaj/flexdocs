'use client';

import { useEffect, useState, useCallback } from 'react';

interface MFAStatus {
  enabled: boolean;
  method: 'totp' | 'sms' | 'email';
  lastUsed?: string;
}

export default function MFASettingsPage() {
  const [status, setStatus] = useState<MFAStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupMode, setSetupMode] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/mfa/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      } else {
        setStatus({ enabled: false, method: 'totp' });
      }
    } catch {
      setStatus({ enabled: false, method: 'totp' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const startSetup = async () => {
    try {
      setError(null);
      const res = await fetch('/api/mfa/setup', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to start MFA setup');
      const data = await res.json();
      setQrCode(data.qrCode);
      setSecret(data.secret);
      setSetupMode(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start setup');
    }
  };

  const verifySetup = async () => {
    try {
      setError(null);
      if (!token.trim()) {
        setError('Enter the 6-digit code from your authenticator app');
        return;
      }
      const res = await fetch('/api/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, secret }),
      });
      if (!res.ok) throw new Error('Invalid code');
      const data = await res.json();
      if (data.recoveryCodes) setRecoveryCodes(data.recoveryCodes);
      setSuccess('2FA enabled successfully!');
      setSetupMode(false);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify');
    }
  };

  const disableMFA = async () => {
    if (!confirm('Disable 2FA? This will make your account less secure.')) return;
    try {
      setError(null);
      const res = await fetch('/api/mfa/disable', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to disable MFA');
      setSuccess('2FA disabled');
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disable');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Two-Factor Authentication</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Add an extra layer of security to your account
        </p>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <p className="text-green-600 dark:text-green-400 text-sm">{success}</p>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">Loading...</div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          {!setupMode ? (
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {status?.enabled ? '2FA is Enabled' : '2FA is Disabled'}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {status?.enabled
                    ? 'Your account is protected with two-factor authentication'
                    : 'Enable 2FA to add an extra layer of security'}
                </p>
                {status?.lastUsed && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Last used: {new Date(status.lastUsed).toLocaleString()}
                  </p>
                )}
              </div>
              <div className="flex gap-3">
                {!status?.enabled ? (
                  <button
                    onClick={startSetup}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Enable 2FA
                  </button>
                ) : (
                  <button
                    onClick={disableMFA}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Disable 2FA
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Set Up 2FA</h2>
              <ol className="list-decimal list-inside space-y-3 text-gray-700 dark:text-gray-300">
                <li>Install an authenticator app (Google Authenticator, Authy, etc.)</li>
                <li>Scan this QR code or enter the secret key manually:</li>
              </ol>

              {qrCode && (
                <div className="flex flex-col items-center gap-4">
                  <div className="bg-white p-4 rounded-lg">
                    <img src={qrCode} alt="QR Code" className="w-48 h-48" />
                  </div>
                  {secret && (
                    <div className="text-center">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Manual entry key:</p>
                      <code className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded text-sm font-mono text-gray-900 dark:text-white select-all">
                        {secret}
                      </code>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Enter the 6-digit verification code:
                </label>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={token}
                    onChange={(e) => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    maxLength={6}
                    className="w-40 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-center text-2xl font-mono tracking-widest"
                    placeholder="000000"
                  />
                  <button
                    onClick={verifySetup}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    Verify & Enable
                  </button>
                  <button
                    onClick={() => { setSetupMode(false); setQrCode(null); setSecret(null); setToken(''); }}
                    className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {recoveryCodes.length > 0 && (
            <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <h3 className="font-medium text-yellow-900 dark:text-yellow-200 mb-2">Recovery Codes</h3>
              <p className="text-sm text-yellow-800 dark:text-yellow-300 mb-3">
                Save these codes in a safe place. You can use them to log in if you lose your authenticator device.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {recoveryCodes.map((code, i) => (
                  <code key={i} className="px-2 py-1 bg-white dark:bg-gray-800 rounded text-sm font-mono text-gray-900 dark:text-white">
                    {code}
                  </code>
                ))}
              </div>
              <button
                onClick={() => navigator.clipboard.writeText(recoveryCodes.join('\n'))}
                className="mt-3 px-3 py-1 text-sm bg-yellow-600 text-white rounded hover:bg-yellow-700"
              >
                Copy All Codes
              </button>
            </div>
          )}
        </div>
      )}

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h3 className="font-medium text-blue-900 dark:text-blue-200">About Two-Factor Authentication</h3>
        <ul className="mt-2 text-sm text-blue-800 dark:text-blue-300 space-y-1">
          <li>• Uses TOTP (Time-based One-Time Password) standard</li>
          <li>• Compatible with Google Authenticator, Authy, Microsoft Authenticator, etc.</li>
          <li>• Recovery codes can be used if you lose access to your authenticator</li>
        </ul>
      </div>
    </div>
  );
}
