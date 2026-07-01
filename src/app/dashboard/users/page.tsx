'use client';

import { useState, useEffect } from 'react';
import { Users, Mail, Trash2, UserPlus, Loader2 } from 'lucide-react';

interface UserItem {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
  emailVerified: string | null;
  _count: { documents: number; passwords: number; domains: number };
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  invitedBy: { name: string | null; email: string };
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('editor');
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [usersRes, invRes] = await Promise.all([
      fetch('/api/rbac/users'),
      fetch('/api/rbac/invitations'),
    ]);
    if (usersRes.ok) setUsers(await usersRes.json());
    if (invRes.ok) setInvitations(await invRes.json());
    setLoading(false);
  };

  const updateRole = async (userId: string, role: string) => {
    await fetch('/api/rbac/users', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role }),
    });
    loadData();
  };

  const deleteUser = async (userId: string) => {
    if (!confirm('Delete this user?')) return;
    await fetch(`/api/rbac/users?userId=${userId}`, { method: 'DELETE' });
    loadData();
  };

  const sendInvite = async () => {
    if (!inviteEmail) return;
    setInviting(true);
    setError('');
    const res = await fetch('/api/rbac/invitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    });
    if (res.ok) {
      setInviteEmail('');
      loadData();
    } else {
      setError('Failed to send invitation');
    }
    setInviting(false);
  };

  const revokeInvite = async (id: string) => {
    await fetch(`/api/rbac/invitations?id=${id}`, { method: 'DELETE' });
    loadData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  const roleColors: Record<string, string> = {
    admin: 'bg-red-100 text-red-800',
    editor: 'bg-blue-100 text-blue-800',
    viewer: 'bg-slate-100 text-slate-600',
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Users className="w-6 h-6" /> User Management
        </h1>
        <p className="text-slate-500">Manage roles and invitations</p>
      </div>

      {/* Invite Form */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <UserPlus className="w-5 h-5" /> Invite User
        </h2>
        <div className="flex gap-3">
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="user@example.com"
            className="input-field flex-1"
          />
          <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="input-field w-32">
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
            <option value="admin">Admin</option>
          </select>
          <button onClick={sendInvite} disabled={inviting} className="btn-primary flex items-center gap-2">
            {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            Send Invite
          </button>
        </div>
        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
      </div>

      {/* Users Table */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-4">Users ({users.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="pb-3 pr-4">User</th>
                <th className="pb-3 pr-4">Role</th>
                <th className="pb-3 pr-4">Assets</th>
                <th className="pb-3 pr-4">Verified</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="py-3 pr-4">
                    <div>
                      <p className="font-medium">{u.name || u.email}</p>
                      <p className="text-slate-500 text-xs">{u.email}</p>
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <select
                      value={u.role}
                      onChange={(e) => updateRole(u.id, e.target.value)}
                      className={`text-xs font-medium px-2 py-1 rounded-full border-0 ${roleColors[u.role] || 'bg-slate-100'}`}
                    >
                      <option value="admin">Admin</option>
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </td>
                  <td className="py-3 pr-4 text-slate-500">
                    {u._count.documents + u._count.passwords + u._count.domains}
                  </td>
                  <td className="py-3 pr-4">
                    {u.emailVerified ? (
                      <span className="text-green-600 text-xs">Verified</span>
                    ) : (
                      <span className="text-amber-500 text-xs">Pending</span>
                    )}
                  </td>
                  <td className="py-3">
                    <button
                      onClick={() => deleteUser(u.id)}
                      className="text-red-500 hover:text-red-700 p-1"
                      title="Delete user"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Pending Invitations</h2>
          <div className="space-y-3">
            {invitations.filter((i) => i.status === 'pending').map((inv) => (
              <div key={inv.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div>
                  <p className="font-medium">{inv.email}</p>
                  <p className="text-xs text-slate-500">
                    Invited by {inv.invitedBy.name || inv.invitedBy.email} as {inv.role}
                  </p>
                </div>
                <button onClick={() => revokeInvite(inv.id)} className="text-red-500 hover:text-red-700 text-sm">
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
