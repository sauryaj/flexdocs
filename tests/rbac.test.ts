import { describe, it, expect } from 'vitest';
import { hasPermission, hasAnyPermission, type Permission } from '@/lib/rbac';

describe('hasPermission', () => {
  it('grants admins all permissions', () => {
    const all: Permission[] = [
      'document.delete', 'password.delete', 'domain.delete', 'user.manage',
      'backup.create', 'organization.delete', 'report.export', 'settings.update',
    ];
    for (const p of all) {
      expect(hasPermission('admin', p)).toBe(true);
    }
  });

  it('denies destructive permissions to editors', () => {
    expect(hasPermission('editor', 'user.manage')).toBe(false);
    expect(hasPermission('editor', 'backup.create')).toBe(false);
    expect(hasPermission('editor', 'organization.create')).toBe(false);
    expect(hasPermission('editor', 'apikey.delete')).toBe(false);
  });

  it('allows editors to manage content', () => {
    expect(hasPermission('editor', 'document.update')).toBe(true);
    expect(hasPermission('editor', 'password.create')).toBe(true);
    expect(hasPermission('editor', 'webhook.read')).toBe(true);
  });

  it('restricts viewers to read-only permissions', () => {
    expect(hasPermission('viewer', 'document.read')).toBe(true);
    expect(hasPermission('viewer', 'audit.read')).toBe(true);
    expect(hasPermission('viewer', 'document.create')).toBe(false);
    expect(hasPermission('viewer', 'password.update')).toBe(false);
    expect(hasPermission('viewer', 'webhook.create')).toBe(false);
  });

  it('returns false for unknown role or permission', () => {
    expect(hasPermission('unknown' as never, 'document.read')).toBe(false);
    expect(hasPermission('admin', 'nonexistent.perm' as never)).toBe(false);
  });
});

describe('hasAnyPermission', () => {
  it('returns true when at least one permission matches', () => {
    expect(hasAnyPermission('viewer', ['document.read', 'document.create'])).toBe(true);
  });

  it('returns false when no permission matches', () => {
    expect(hasAnyPermission('viewer', ['user.manage', 'backup.create'])).toBe(false);
  });
});
