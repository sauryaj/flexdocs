import { hasPermission, type UserRole } from '@/lib/rbac';

export interface DocumentContext {
  userId: string;
  ownershipKind: 'personal' | 'organization';
  organizationId: string | null;
  isArchived: boolean;
  deletedAt: Date | null;
  hasPublishedSnapshot?: boolean;
}
export interface ActorContext {
  id: string;
  role: UserRole;
  memberOfOrganization?: boolean;
  grant?: { organizationId: string; role: string } | null;
}

export function documentCapabilities(document: DocumentContext, actor: ActorContext) {
  const denied = { readWorking: false, readPublished: false, edit: false, submitReview: false,
    publish: false, manageLifecycle: false, restoreHistory: false, requestTransfer: false };
  if (!hasPermission(actor.role, 'document.read')) return denied;
  const active = !document.deletedAt;
  const canWrite = hasPermission(actor.role, 'document.update');
  if (document.ownershipKind === 'personal') {
    if (document.userId !== actor.id) return denied;
    return { readWorking: active, readPublished: active && !document.isArchived && !!document.hasPublishedSnapshot,
      edit: active && canWrite, submitReview: active && canWrite, publish: active && canWrite,
      manageLifecycle: hasPermission(actor.role, 'document.delete'),
      restoreHistory: active && canWrite, requestTransfer: active && canWrite };
  }
  if (document.ownershipKind !== 'organization') return denied;
  const grant = actor.grant;
  if (!document.organizationId || !actor.memberOfOrganization || !grant || grant.organizationId !== document.organizationId ||
      !['reader', 'contributor', 'reviewer', 'administrator'].includes(grant.role)) return denied;
  const contributor = canWrite && ['contributor', 'reviewer', 'administrator'].includes(grant.role);
  const reviewer = canWrite && ['reviewer', 'administrator'].includes(grant.role);
  const administrator = canWrite && grant.role === 'administrator' && hasPermission(actor.role, 'document.delete');
  return { readWorking: active && contributor,
    readPublished: active && !document.isArchived && !!document.hasPublishedSnapshot,
    edit: active && !document.isArchived && contributor, submitReview: active && !document.isArchived && contributor, publish: active && !document.isArchived && reviewer,
    manageLifecycle: administrator, restoreHistory: active && contributor, requestTransfer: active && administrator };
}
