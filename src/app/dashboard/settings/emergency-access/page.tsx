'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface EmergencyAccessGrant {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  accessType: 'view' | 'edit' | 'admin';
  delayDays: number;
  delayHours: number;
  status: 'pending' | 'approved' | 'revoked' | 'expired';
  requestReason?: string;
  createdAt: string;
  expiresAt?: string;
  updatedAt: string;
}

export default function EmergencyAccessPage() {
  const router = useRouter();
  const [grants, setGrants] = useState<EmergencyAccessGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showRevokeModal, setShowRevokeModal] = useState<string | null>(null);
  const [showApproveModal, setShowApproveModal] = useState<string | null>(null);
  const [form, setForm] = useState({
    userId: '',
    accessType: 'view' as const,
    delayDays: 7,
    delayHours: 0,
    requestReason: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadGrants = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/emergency-access');
      if (!res.ok) throw new Error('Failed to load grants');
      const data = await res.json();
      setGrants(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load grants');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadGrants(); }, [loadGrants]);

  const handleRequest = async () => {
    try {
      setError(null);
      if (!form.userId.trim()) {
        setError('User ID is required');
        return;
      }
      const res = await fetch('/api/emergency-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          delayDays: parseInt(form.delayDays as unknown as string),
          delayHours: parseInt(form.delayHours as unknown as string),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create request');
      }
      setSuccess('Emergency access requested successfully');
      setShowRequestModal(false);
      setForm({ userId: '', accessType: 'view', delayDays: 7, delayHours: 0, requestReason: '' });
      await loadGrants();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create request');
    }
  };

  const handleApprove = async (grantId: string) => {
    try {
      setError(null);
      const res = await fetch(`/api/emergency-access/${grantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      });
      if (!res.ok) throw new Error('Failed to approve grant');
      setSuccess('Access granted');
      setShowApproveModal(null);
      await loadGrants();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve');
    }
  };

  const handleRevoke = async (grantId: string) => {
    try {
      setError(null);
      const res = await fetch(`/api/emergency-access/${grantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'revoked' }),
      });
      if (!res.ok) throw new Error('Failed to revoke grant');
      setSuccess('Access revoked');
      setShowRevokeModal(null);
      await loadGrants();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke');
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
      case 'approved': return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      case 'revoked': return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
      case 'expired': return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
      default: return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  const accessTypeIcon = (type: string) => {
    switch (type) {
      case 'view': return '👁️';
      case 'edit': return '✏️';
      case 'admin': return '👑';
      default: return '🔑';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Emergency Access</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Manage time-delayed access for trusted users in case of emergencies
          </p>
        </div>
        <button
          onClick={() => setShowRequestModal(true)}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          Request Access
        </button>
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

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Access Grants</h2>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">Loading...</div>
        ) : grants.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            <div className="text-4xl mb-3">🔒</div>
            <p>No emergency access grants configured.</p>
            <p className="text-sm mt-2">Set up time-delayed access so trusted users can access resources in an emergency.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {grants.map((grant) => (
              <div key={grant.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-xl">
                      {accessTypeIcon(grant.accessType)}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">
                        {grant.userName || grant.userEmail || grant.userId}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {grant.accessType === 'view' ? 'View Only' : grant.accessType === 'edit' ? 'Edit Access' : 'Admin Access'} • Delay: {grant.delayDays}d {grant.delayHours}h
                      </div>
                      {grant.requestReason && (
                        <div className="text-sm text-gray-500 dark:text-gray-400 mt-1 italic">
                          &quot;{grant.requestReason}&quot;
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor(grant.status)}`}>
                      {grant.status}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {new Date(grant.createdAt).toLocaleDateString()}
                    </span>
                    <div className="flex gap-1">
                      {grant.status === 'pending' && (
                        <button
                          onClick={() => setShowApproveModal(grant.id)}
                          className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                        >
                          Approve
                        </button>
                      )}
                      {(grant.status === 'pending' || grant.status === 'approved') && (
                        <button
                          onClick={() => setShowRevokeModal(grant.id)}
                          className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h3 className="font-medium text-blue-900 dark:text-blue-200">How Emergency Access Works</h3>
        <ul className="mt-2 text-sm text-blue-800 dark:text-blue-300 space-y-1">
          <li>• Request access to another user&apos;s account with a time delay</li>
          <li>• The user must approve your request before the delay starts</li>
          <li>• After the delay period, you gain access to their resources</li>
          <li>• The original user can revoke access at any time</li>
        </ul>
      </div>

      {showRequestModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Request Emergency Access</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">User ID or Email</label>
                <input
                  type="text"
                  value={form.userId}
                  onChange={(e) => setForm({ ...form, userId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Enter user ID or email"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Access Level</label>
                <select
                  value={form.accessType}
                  onChange={(e) => setForm({ ...form, accessType: e.target.value as 'view' | 'edit' | 'admin' })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="view">View Only</option>
                  <option value="edit">Edit Access</option>
                  <option value="admin">Admin Access</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Delay (Days)</label>
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={form.delayDays}
                    onChange={(e) => setForm({ ...form, delayDays: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Delay (Hours)</label>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={form.delayHours}
                    onChange={(e) => setForm({ ...form, delayHours: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reason (optional)</label>
                <textarea
                  value={form.requestReason}
                  onChange={(e) => setForm({ ...form, requestReason: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  rows={3}
                  placeholder="Why do you need access?"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowRequestModal(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleRequest}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Request Access
              </button>
            </div>
          </div>
        </div>
      )}

      {showApproveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Approve Access?</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              This will start the delay timer. After the delay period, the user will gain access.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowApproveModal(null)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => handleApprove(showApproveModal)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {showRevokeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Revoke Access?</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              The user will immediately lose access to all resources.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowRevokeModal(null)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRevoke(showRevokeModal)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Revoke
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
