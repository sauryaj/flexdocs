'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Bell, X, Check, AlertTriangle, AlertCircle, Info, CheckCircle2, Inbox } from 'lucide-react';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  severity: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

const severityStyles: Record<string, { bg: string; text: string; icon: typeof Info }> = {
  danger: { bg: 'rgba(248,113,113,0.12)', text: '#f87171', icon: AlertCircle },
  warning: { bg: 'rgba(251,191,36,0.12)', text: '#fbbf24', icon: AlertTriangle },
  success: { bg: 'rgba(52,211,153,0.12)', text: '#34d399', icon: CheckCircle2 },
  info: { bg: 'rgba(96,165,250,0.12)', text: '#60a5fa', icon: Info },
};

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
        setUnread(data.unreadCount || 0);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    // SSE drives realtime updates; this slow poll is only a fallback
    const interval = setInterval(fetchNotifications, 300000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Realtime updates via SSE; falls back to the poll above on error.
  // Closes after repeated failures (e.g. expired session) instead of retrying forever.
  useEffect(() => {
    if (typeof window === 'undefined' || !('EventSource' in window)) return;
    let failures = 0;
    const es = new EventSource('/api/notifications/stream');
    es.onerror = () => {
      failures += 1;
      if (failures >= 3) es.close();
    };
    es.onopen = () => {
      failures = 0;
    };
    es.onmessage = (e) => {
      let data: { unreadCount?: number; bye?: boolean };
      try {
        data = JSON.parse(e.data);
      } catch {
        return;
      }
      if (data.bye) {
        es.close();
        return;
      }
      if (typeof data.unreadCount === 'number') {
        setUnread(data.unreadCount);
        fetchNotifications();
      }
    };
    return () => es.close();
  }, [fetchNotifications]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const markRead = async (ids?: string[]) => {
    const targetIds = ids || notifications.filter((n) => !n.read).map((n) => n.id);
    if (targetIds.length === 0) return;
    await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: targetIds }),
    });
    fetchNotifications();
  };

  const dismiss = async (id: string) => {
    await fetch(`/api/notifications?ids=${encodeURIComponent(id)}`, { method: 'DELETE' });
    fetchNotifications();
  };

  const clearAll = async () => {
    await fetch('/api/notifications', { method: 'DELETE' });
    setNotifications([]);
    setUnread(0);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          setOpen(!open);
          if (!open) fetchNotifications();
        }}
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
        className="relative p-2 rounded-lg transition-colors duration-150 hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-muted)]"
        style={{ color: 'var(--muted)' }}
      >
        <Bell className="w-[18px] h-[18px]" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold text-white"
            style={{ backgroundColor: 'var(--danger)' }}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 w-96 rounded-xl shadow-2xl z-50 overflow-hidden"
          style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--card-border)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Notifications</span>
            <div className="flex items-center gap-2">
              {notifications.length > 0 && (
                <button
                  onClick={clearAll}
                  className="text-[11px] px-2 py-1 rounded-md hover:bg-[var(--surface-2)] flex items-center gap-1"
                  style={{ color: 'var(--muted)' }}
                >
                  <X className="w-3 h-3" /> Clear all
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="text-[11px] px-2 py-1 rounded-md hover:bg-[var(--surface-2)]"
                style={{ color: 'var(--muted)' }}
              >
                Close
              </button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center text-sm" style={{ color: 'var(--muted)' }}>Loading…</div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center">
                <Inbox className="w-8 h-8 mx-auto mb-2 opacity-40" style={{ color: 'var(--muted)' }} />
                <p className="text-sm" style={{ color: 'var(--muted)' }}>No notifications yet</p>
              </div>
            ) : (
              notifications.map((n) => {
                const style = severityStyles[n.severity] || severityStyles.info;
                const Icon = style.icon;
                const inner = (
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: style.bg }}>
                      <Icon className="w-4 h-4" style={{ color: style.text }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold truncate" style={{ color: 'var(--foreground)' }}>{n.title}</span>
                        <span className="text-[10px] shrink-0" style={{ color: 'var(--muted)' }}>{timeAgo(n.createdAt)}</span>
                      </div>
                      <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--muted)' }}>{n.message}</p>
                    </div>
                    {!n.read && (
                      <span className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ backgroundColor: 'var(--accent)' }} />
                    )}
                  </div>
                );
                return (
                  <div
                    key={n.id}
                    className="group px-4 py-3 border-b last:border-b-0 transition-colors relative"
                    style={{ borderColor: 'var(--card-border)', opacity: n.read ? 0.7 : 1 }}
                  >
                    {n.link ? (
                      <Link
                        href={n.link}
                        onClick={(e) => {
                          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                          setOpen(false);
                          markRead([n.id]);
                        }}
                        className="block hover:bg-[var(--surface-1)] -mx-1 px-1 py-0.5 pr-7 rounded-lg"
                      >
                        {inner}
                      </Link>
                    ) : (
                      <div className="-mx-1 px-1 py-0.5 pr-7">{inner}</div>
                    )}
                    {!n.read && (
                      <button
                        onClick={() => markRead([n.id])}
                        aria-label="Mark as read"
                        title="Mark as read"
                        className="absolute right-9 top-3 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 transition-opacity p-0.5 rounded hover:bg-[var(--surface-2)]"
                        style={{ color: 'var(--muted)' }}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => dismiss(n.id)}
                      aria-label="Dismiss notification"
                      title="Dismiss"
                      className="absolute right-2.5 top-3 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 transition-opacity p-0.5 rounded hover:bg-[var(--surface-2)]"
                      style={{ color: 'var(--muted)' }}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {notifications.length > 0 && (
            <div className="px-4 py-2 border-t flex items-center justify-between" style={{ borderColor: 'var(--card-border)' }}>
              <button
                onClick={() => markRead()}
                className="text-xs flex items-center gap-1 hover:opacity-80"
                style={{ color: 'var(--muted)' }}
              >
                <Check className="w-3 h-3" /> Mark all as read
              </button>
              <Link
                href="/dashboard/settings/notifications"
                onClick={() => setOpen(false)}
                className="text-xs hover:underline"
                style={{ color: 'var(--accent)' }}
              >
                Preferences
              </Link>
            </div>
          )}
          {notifications.length === 0 && (
            <div className="px-4 py-2 border-t text-center" style={{ borderColor: 'var(--card-border)' }}>
              <Link
                href="/dashboard/settings/notifications"
                onClick={() => setOpen(false)}
                className="text-xs hover:underline"
                style={{ color: 'var(--accent)' }}
              >
                Notification preferences
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}