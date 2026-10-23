import { hasPermission, type Permission, type UserRole } from '@/lib/rbac';

const toolPermissions: Record<string, Permission[]> = {
  flexdocs_get_document: ['document.read'],
  flexdocs_search: ['document.read', 'asset.read'],
  flexdocs_list_orgs: ['organization.read'],
  flexdocs_org_pulse: ['organization.read', 'domain.read', 'asset.read', 'report.read', 'document.read'],
};

export function canUseMcpTool(role: UserRole, permissions: readonly string[] | null, name: string): boolean {
  const required = toolPermissions[name];
  if (!required) return false;
  return required.every(permission => hasPermission(role, permission) && (
    permissions === null || permissions.includes(permission) ||
    // Existing UI-created keys use the legacy read scope; it grants only reads.
    (permission.endsWith('.read') && (permissions.includes('read') || permissions.includes('admin')))
  ));
}
