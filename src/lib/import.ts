import { prisma } from '@/lib/prisma';
import { encrypt } from '@/lib/encryption';
import { storeFile } from '@/lib/file-storage';
import { type BackupBundle } from '@/lib/export';

export interface RestoreReport {
  success: boolean;
  imported: Record<string, number>;
  skipped: number;
  errors: string[];
}

const TICKET_FIELDS = ['id', 'subject', 'description', 'status', 'priority', 'organizationId', 'createdByUserId', 'assignedToUserId', 'firstResponseAt', 'resolvedAt', 'createdAt', 'updatedAt'];

function pick<T extends Record<string, unknown>>(src: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in src) out[k] = src[k];
  return out as unknown as Record<string, unknown>;
}

async function tryCreate(model: keyof typeof prisma | any, data: Record<string, unknown>) {
  try {
    await prisma[model as 'document'].create({ data } as any);
    return { created: true, error: null };
  } catch (e: any) {
    if (e?.code === 'P2002' || e?.code === 'P2003') return { created: false, error: null };
    return { created: false, error: String(e?.message || e) };
  }
}

interface TagIndex {
  [name: string]: { id: string };
}

async function ensureTags(tagNames: string[], adminId: string): Promise<TagIndex> {
  const out: TagIndex = {};
  for (const name of tagNames) {
    const tag = await prisma.tag.upsert({
      where: { name_userId: { name, userId: adminId } },
      update: {},
      create: { name, userId: adminId },
    });
    out[name] = { id: tag.id };
  }
  return out;
}

async function attachTags(
  model: 'document' | 'password' | 'domain' | 'checklist',
  recordId: string,
  tagIndex: TagIndex,
  tagNames: string[]
) {
  if (!tagNames?.length) return;
  try {
    await (prisma[model] as any).update({
      where: { id: recordId },
      data: { tags: { connect: tagNames.map((n) => ({ id: tagIndex[n]?.id })).filter((x) => x.id) } },
    });
  } catch {
    // non-fatal
  }
}

/** Restore a flexdocs backup bundle. Foreign records remap onto the importing admin user. */
export async function restoreBackup(bundle: BackupBundle, adminId: string): Promise<RestoreReport> {
  const report: RestoreReport = { success: false, imported: {}, skipped: 0, errors: [] };
  const inc = (k: string, n = 1) => {
    report.imported[k] = (report.imported[k] || 0) + n;
  };

  if (bundle.schema !== 'flexdocs-backup' || bundle.version !== 1) {
    report.errors.push('Unsupported backup format');
    return report;
  }

  const createdFolderIds = new Set<string>();

  // 1. Organizations + members
  for (const org of bundle.organizations as Record<string, unknown>[]) {
    const fields = pick(org, ['id', 'name', 'description', 'website', 'phone', 'email', 'address', 'logo', 'createdAt', 'updatedAt']);
    const r = await tryCreate('organization', fields as any);
    if (r.error) report.errors.push(`organization ${org.name}: ${r.error}`);
    else if (r.created) inc('organizations');
    else report.skipped++;
  }
  for (const m of bundle.members as Record<string, unknown>[]) {
    try {
      const email = String(m.email).toLowerCase();
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !m.organizationId) continue;
      if (await prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: String(m.organizationId), userId: user.id } } })) continue;
      await prisma.organizationMember.create({ data: { organizationId: String(m.organizationId), userId: user.id, role: String(m.role || 'client') } });
      inc('members');
    } catch {
      report.skipped++;
    }
  }

  // 2. Folders
  for (const f of bundle.folders as Record<string, unknown>[]) {
    const parent = f.parentId ? createdFolderIds.has(String(f.parentId)) ? String(f.parentId) : null : null;
    const data: any = pick(f, ['id', 'name', 'createdAt', 'updatedAt']);
    data.userId = adminId;
    if (parent) data.parentId = parent;
    const r = await tryCreate('folder', data);
    if (r.created) createdFolderIds.add(String(f.id));
    if (r.error) report.errors.push(`folder ${f.name}: ${r.error}`);
    else if (r.created) inc('folders');
    else report.skipped++;
  }

  // 3. Tags used across docs/passwords/domains
  const tagNames = [...new Set((bundle.tags as string[]) || [])];
  const tagIndex = await ensureTags(tagNames, adminId);

  // 4. Documents + attachments
  for (const doc of bundle.documents as (Record<string, unknown> & { attachments?: Record<string, unknown>[]; tagNames?: string[] })[]) {
    const data: any = pick(doc, ['id', 'title', 'content', 'type', 'category', 'isPinned', 'isArchived', 'reviewDate', 'lastReviewedAt', 'visibility', 'organizationId', 'createdAt', 'updatedAt']);
    data.userId = adminId;
    if (doc.folderId && createdFolderIds.has(String(doc.folderId))) data.folderId = doc.folderId;
    const r = await tryCreate('document', data);
    if (r.error) {
      report.errors.push(`document ${doc.title}: ${r.error}`);
      continue;
    }
    if (r.created) {
      inc('documents');
      const atts = doc.attachments || [];
      for (const a of atts) {
        try {
          const dataUrl = a.data as string | undefined;
          if (dataUrl) {
            await storeFile(dataUrl, String(a.filename), String(a.mimeType || 'application/octet-stream'), Number(a.size || 0), adminId, String(doc.id));
          }
          inc('attachments');
        } catch {
          report.errors.push(`attachment ${a.filename}: write failed`);
        }
      }
    }
    if (doc.tagNames?.length) await attachTags('document', String(doc.id), tagIndex, doc.tagNames);
  }

  // 5. Passwords (plaintext → re-encrypted at rest)
  for (const pw of bundle.passwords as (Record<string, unknown> & { tagNames?: string[] })[]) {
    const data: any = pick(pw, ['id', 'name', 'username', 'url', 'notes', 'category', 'isFavorite', 'expiresAt', 'rotationDays', 'lastRotatedAt', 'rotationEnabled', 'rotationMethod', 'rotationTarget', 'rotationPort', 'rotationUsername', 'clientVisible', 'totpIssuer', 'totpPeriod', 'totpDigits', 'customFields', 'autofillSelector', 'autofillNotes', 'lastBreachCheck', 'breachCount', 'organizationId', 'createdAt', 'updatedAt']);
    data.userId = adminId;
    data.password = encrypt(String(pw.password || ''));
    data.totpSecret = pw.totpSecret ? encrypt(String(pw.totpSecret)) : null;
    const r = await tryCreate('password', data);
    if (r.error) {
      report.errors.push(`password ${pw.name}: ${r.error}`);
      continue;
    }
    if (r.created) inc('passwords');
    if (pw.tagNames?.length) await attachTags('password', String(pw.id), tagIndex, pw.tagNames);
  }

  // 6. Domains (globally-unique name: skip dups)
  for (const d of bundle.domains as (Record<string, unknown> & { tagNames?: string[] })[]) {
    const data: any = pick(d, ['id', 'name', 'registrar', 'nameservers', 'expiresAt', 'autoRenew', 'status', 'notes', 'organizationId', 'whoisCreated', 'whoisCountry', 'whoisState', 'privacyProtection', 'dnsRecords', 'lastWhoisCheck', 'lastDnsCheck', 'sslCertId', 'createdAt', 'updatedAt']);
    data.userId = adminId;
    const r = await tryCreate('domain', data);
    if (r.error) {
      report.errors.push(`domain ${d.name}: ${r.error}`);
      continue;
    }
    if (r.created) inc('domains');
    if (d.tagNames?.length) await attachTags('domain', String(d.id), tagIndex, d.tagNames);
  }

  // 7. SSL certificates
  for (const c of bundle.sslCertificates as Record<string, unknown>[]) {
    const data: any = pick(c, ['id', 'hostname', 'issuer', 'subject', 'serialNumber', 'validFrom', 'validTo', 'organizationId', 'userId', 'createdAt', 'updatedAt', 'isExpired']);
    if (!data.userId) data.userId = adminId;
    const r = await tryCreate('sslCertificate', data);
    if (r.error) report.errors.push(`ssl ${c.hostname}: ${r.error}`);
    else if (r.created) inc('sslCertificates');
    else report.skipped++;
  }

  // 8. Asset types + assets
  for (const at of bundle.assetTypes as Record<string, unknown>[]) {
    const data: any = pick(at, ['id', 'name', 'color', 'icon', 'fields', 'createdAt', 'updatedAt']);
    data.userId = adminId;
    const r = await tryCreate('flexibleAssetType', data);
    if (r.error && !String(r.error).includes('unique')) report.errors.push(`assetType ${at.name}: ${r.error}`);
    else if (r.created) inc('assetTypes');
    else report.skipped++;
  }
  for (const a of bundle.assets as Record<string, unknown>[]) {
    const data: any = pick(a, ['id', 'name', 'assetType', 'fields', 'notes', 'isArchived', 'organizationId', 'createdAt', 'updatedAt']);
    data.userId = adminId;
    const r = await tryCreate('flexibleAsset', data);
    if (r.error) report.errors.push(`asset ${a.name}: ${r.error}`);
    else if (r.created) inc('assets');
    else report.skipped++;
  }

  // 9. Checklists + items
  for (const cl of bundle.checklists as (Record<string, unknown> & { items?: Record<string, unknown>[] })[]) {
    const data: any = pick(cl, ['id', 'name', 'description', 'category', 'isComplete', 'isArchived', 'dueDate', 'organizationId', 'createdAt', 'updatedAt']);
    data.userId = adminId;
    const r = await tryCreate('checklist', data);
    if (r.error) {
      report.errors.push(`checklist ${cl.name}: ${r.error}`);
      continue;
    }
    if (r.created) {
      inc('checklists');
      for (const item of cl.items || []) {
        const idata: any = pick(item, ['id', 'text', 'isComplete', 'order', 'createdAt', 'updatedAt']);
        idata.checklistId = cl.id;
        const ir = await tryCreate('checklistItem', idata);
        if (ir.error) report.errors.push(`checklistItem ${item.text}: ${ir.error}`);
        else if (ir.created) inc('items');
      }
    }
  }

  // 10. Renewals / servers / ipam / contacts / locations / websites
  const simple: Array<[string, string[], keyof typeof prisma]> = [
    ['renewalItem', ['id', 'name', 'vendor', 'type', 'seats', 'costPerSeat', 'totalCost', 'renewsAt', 'autoRenew', 'notes', 'organizationId', 'createdAt', 'updatedAt'], 'renewalItem' as const],
    ['server', ['id', 'name', 'hostname', 'ipAddress', 'macAddress', 'os', 'osVersion', 'cpu', 'cpuCores', 'ramGB', 'storageGB', 'storageType', 'status', 'location', 'rackPosition', 'serialNumber', 'assetTag', 'purchaseDate', 'warrantyExpiry', 'notes', 'lastHeartbeatAt', 'agentVersion', 'softwareInventory', 'patchStatus', 'organizationId', 'createdAt', 'updatedAt'], 'server' as const],
    ['ipamNetwork', ['id', 'name', 'cidr', 'vlanId', 'notes', 'organizationId', 'createdAt', 'updatedAt'], 'ipamNetwork' as const],
    ['contact', ['id', 'name', 'title', 'email', 'phone', 'mobile', 'notes', 'organizationId', 'createdAt', 'updatedAt'], 'contact' as const],
    ['location', ['id', 'name', 'address', 'city', 'state', 'country', 'notes', 'organizationId', 'createdAt', 'updatedAt'], 'location' as const],
    ['website', ['id', 'name', 'url', 'status', 'lastCheckedAt', 'lastStatusCode', 'lastLatencyMs', 'failCount', 'uptimePercent', 'organizationId', 'createdAt', 'updatedAt'], 'website' as const],
  ];
  for (const [label, keys, model] of simple) {
    const bundleKey = `${label}s` === 'renewalItems' ? 'renewals' : `${label}s`;
    for (const row of (bundle[bundleKey as keyof typeof bundle] || []) as Record<string, unknown>[]) {
      const data: any = pick(row, keys);
      data.userId = adminId;
      const r = await tryCreate(model, data);
      if (r.error) report.errors.push(`${label} ${row.name}: ${r.error}`);
      else if (r.created) inc(label);
      else report.skipped++;
    }
  }

  // 11. Tickets + replies (autoincrement ids preserved)
  for (const t of bundle.tickets as (Record<string, unknown> & { replies?: Record<string, unknown>[] })[]) {
    const tdata: any = pick(t, TICKET_FIELDS);
    tdata.createdByUserId = adminId;
    if (tdata.assignedToUserId) tdata.assignedToUserId = adminId;
    const r = await tryCreate('ticket', tdata);
    if (r.error) {
      report.errors.push(`ticket ${t.subject}: ${r.error}`);
      continue;
    }
    if (r.created) {
      inc('tickets');
      for (const rep of t.replies || []) {
        const rdata: any = pick(rep, ['id', 'body', 'internal', 'createdAt']);
        rdata.ticketId = t.id;
        rdata.userId = adminId;
        const rr = await tryCreate('ticketReply', rdata);
        if (rr.error) report.errors.push(`reply: ${rr.error}`);
        else if (rr.created) inc('replies');
      }
    }
  }

  // 12. Relationships (only when both endpoints exist)
  const sourceOf = (type: unknown) => (['document', 'password', 'domain', 'asset', 'checklist', 'server', 'organization'].includes(String(type)) ? String(type) : null);
  for (const rel of bundle.relationships as Record<string, unknown>[]) {
    try {
      const sModel = sourceOf(rel.sourceType);
      const tModel = sourceOf(rel.targetType);
      if (!sModel || !tModel) {
        report.skipped++;
        continue;
      }
      const sourceCount = await (prisma as any)[sModel].count({ where: { id: String(rel.sourceId) } });
      const targetCount = await (prisma as any)[tModel].count({ where: { id: String(rel.targetId) } });
      if (!sourceCount || !targetCount) {
        report.skipped++;
        continue;
      }
      const data: any = pick(rel, ['name', 'sourceType', 'sourceId', 'targetType', 'targetId', 'notes', 'createdAt']);
      await prisma.relationship.create({ data });
      inc('relationships');
    } catch (e: any) {
      if (e?.code !== 'P2002') report.errors.push(`relationship: ${String(e?.message || e)}`);
      else report.skipped++;
    }
  }

  report.success = true;
  return report;
}