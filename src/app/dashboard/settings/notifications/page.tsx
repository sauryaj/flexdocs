'use client';

import { useEffect, useState } from 'react';
import { Bell, Loader2, Check } from 'lucide-react';

const TYPE_LABELS: Record<string, string> = {
  domain_expiring: 'Domain expiry warnings',
  cert_expiring: 'SSL certificate expiry',
  breach: 'Password breach alerts',
  maintenance: 'Maintenance windows',
  system: 'System announcements',
  share: 'Sharing activity',
  emergency: 'Emergency access',
  webhook: 'Webhook events',
};

export default function NotificationSettingsPage() {
  const [mutedTypes, setMutedTypes] = useState<string[]>([]);
  const [availableTypes, setAvailableTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/notifications/preferences');
        if (res.ok) {
          const data = await res.json();
          setMutedTypes(data.mutedTypes || []);
          setAvailableTypes(data.availableTypes || []);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggle = (type: string) => {
    setMutedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
    setSaved(false);
  };

  const savePrefs = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ types: mutedTypes }),
      });
      if (res.ok) {
        const data = await res.json();
        setMutedTypes(data.mutedTypes || mutedTypes);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Bell className="w-5 h-5" /> Notifications
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Choose which notifications you want to receive. Muted types are never created for your account.
        </p>
      </div>

      <div className="space-y-1.5">
        {availableTypes.map((type) => {
          const muted = mutedTypes.includes(type);
          return (
            <button
              key={type}
              onClick={() => toggle(type)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-600 transition-colors text-left"
            >
              <div>
                <p className="text-sm font-medium">{TYPE_LABELS[type] || type}</p>
                <p className="text-xs text-slate-500">
                  {muted ? 'Muted — you will not be notified' : 'Enabled'}
                </p>
              </div>
              <span
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  muted ? 'bg-slate-300 dark:bg-slate-700' : 'bg-blue-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    muted ? 'translate-x-0.5' : 'translate-x-4.5'
                  }`}
                />
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={savePrefs}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Save preferences
        </button>
        {saved && <span className="text-sm text-green-600">Preferences saved</span>}
      </div>
    </div>
  );
}
