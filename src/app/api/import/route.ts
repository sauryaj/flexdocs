import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hasAnyPermission } from '@/lib/rbac';
import { auditLog } from '@/lib/audit';
import { encrypt } from '@/lib/encryption';
import { restoreBackup } from '@/lib/import';
import { type UserRole } from '@prisma/client';

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.trim().split('\n');
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const rows = lines.slice(1).map((line) =>
    line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, ''))
  );
  return { headers, rows };
}

function mapRowToModule(row: string[], headers: string[]): Record<string, any> {
  const data: Record<string, any> = {};
  headers.forEach((h, i) => {
    const val = row[i] || '';
    const key = h.toLowerCase().replace(/\s+/g, '');
    data[key] = val;
  });
  return data;
}

function dateOrNull(v: any): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

const CSV_MODULES = ['documents', 'passwords', 'domains', 'assets', 'servers', 'network', 'cloud', 'maintenance'];

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { module, type, data, format, organizationId } = body;
  const target = module || type;

  if (!target || !data) {
    return NextResponse.json({ error: 'module/type and data required' }, { status: 400 });
  }

  // Full portable backup restore (admin only)
  if (target === 'flexdocs-backup') {
    if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const report = await restoreBackup(data, user.id);
    void auditLog({ userId: user.id, action: 'data.import', resourceType: 'backup', resourceName: 'full', details: report.imported });
    return NextResponse.json({ success: report.success, imported: report.imported, skipped: report.skipped, errors: report.errors });
  }

  if (target === 'itglue') {
    // IT Glue exports arrive as JSON arrays or CSV text; route by detected shape
    let rows: Record<string, any>[] | null = null;
    if (typeof data === 'string') {
      try {
        rows = JSON.parse(data);
      } catch {
        const { headers, rows: csvRows } = parseCsv(data);
        rows = csvRows.map((r) => mapRowToModule(r, headers));
      }
    } else {
      rows = Array.isArray(data) ? data : null;
    }
    if (!rows || !Array.isArray(rows)) return NextResponse.json({ error: 'expected JSON array or CSV text of IT Glue rows' }, { status: 400 });
    let created = 0;
    const errors: string[] = [];
    for (let i = 0; i < rows.length; i++) {
      try {
        const r = rows[i];
        const isPassword = 'password' in r || 'username' in r;
        if (isPassword) {
          await prisma.password.create({
            data: {
              name: String(r.name || r.title || `ITGlue ${i + 1}`),
              username: String(r.username || ''),
              password: encrypt(String(r.password || '')),
              url: r.url || null,
              category: 'general',
              organizationId: organizationId || null,
              userId: user.id,
            },
          });
        } else {
          await prisma.document.create({
            data: {
              title: String(r.name || r.title || `ITGlue ${i + 1}`),
              content: String(r.body || r.content || JSON.stringify(r)),
              category: r.category || 'general',
              organizationId: organizationId || null,
              userId: user.id,
            },
          });
        }
        created++;
      } catch (e: any) {
        errors.push(`row ${i}: ${e?.message || e}`);
      }
    }
    return NextResponse.json({ success: true, imported: created, skipped: rows.length - created, errors });
  }

  if (!hasAnyPermission(user.role as UserRole, ['document.create', 'password.create'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let records: Record<string, any>[] = [];
  if (format === 'csv' || typeof data === 'string') {
    const { headers, rows } = parseCsv(typeof data === 'string' ? data : String(data));
    records = rows.map((row) => mapRowToModule(row, headers));
  } else if (format === 'json' || Array.isArray(data)) {
    records = Array.isArray(data) ? data : [data];
  } else {
    return NextResponse.json({ error: 'format must be csv or json' }, { status: 400 });
  }

  const created: unknown[] = [];
  const errors: Array<{ index: number; error: string }> = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    try {
      let item: any;

      switch (target) {
        case 'documents':
          item = await prisma.document.create({
            data: {
              title: record.title || record.name || `Document ${i + 1}`,
              content: record.content || record.body || '',
              category: record.category || 'general',
              organizationId: organizationId || null,
              userId: user.id,
            },
          });
          break;

        case 'passwords':
          item = await prisma.password.create({
            data: {
              name: record.name || record.title || `Password ${i + 1}`,
              username: record.username || record.user || '',
              password: encrypt(String(record.password || '')),
              url: record.url || record.website || null,
              notes: record.notes || null,
              category: record.category || 'general',
              organizationId: organizationId || null,
              userId: user.id,
            },
          });
          break;

        case 'domains':
          item = await prisma.domain.create({
            data: {
              name: record.name || record.domain || `Domain ${i + 1}`,
              registrar: record.registrar || null,
              nameservers: record.nameservers || record['nameserver,nameservers'] || null,
              expiresAt: dateOrNull(record.expiresat || record.expiry || record.expirydate),
              autoRenew: String(record.autorenew === undefined || record.autorenew === true).toLowerCase() === 'true',
              organizationId: organizationId || null,
              userId: user.id,
            },
          });
          break;

        case 'assets':
          item = await prisma.flexibleAsset.create({
            data: {
              name: record.name || record.title || `Asset ${i + 1}`,
              assetType: record.assettype || record.type || 'generic',
              fields: record.fields || '{}',
              notes: record.notes || null,
              organizationId: organizationId || null,
              userId: user.id,
            },
          });
          break;

        case 'servers':
          item = await prisma.server.create({
            data: {
              name: record.name || `Server ${i + 1}`,
              hostname: record.hostname || null,
              ipAddress: record.ipaddress || record.ip || null,
              os: record.os || null,
              osVersion: record.osversion || record['os version'] || null,
              cpu: record.cpu || null,
              cpuCores: parseInt(record.cpucores || record.cores || '') || null,
              ramGB: parseFloat(record.ramgb || record.ram || '') || null,
              storageGB: parseFloat(record.storagegb || record.storage || '') || null,
              storageType: record.storagetype || null,
              status: record.status || 'active',
              location: record.location || null,
              serialNumber: record.serialnumber || null,
              notes: record.notes || null,
              organizationId: organizationId || null,
              userId: user.id,
            },
          });
          break;

        case 'network':
          item = await prisma.networkDocument.create({
            data: {
              name: record.name || `Network ${i + 1}`,
              type: record.type || 'ip-schema',
              content: record.content || JSON.stringify(record),
              notes: record.notes || null,
              organizationId: organizationId || null,
              userId: user.id,
            },
          });
          break;

        case 'cloud':
          item = await prisma.cloudResource.create({
            data: {
              name: record.name || `Resource ${i + 1}`,
              provider: record.provider || 'aws',
              service: record.service || 'unknown',
              resourceId: record.resourceid || null,
              region: record.region || null,
              status: record.status || 'active',
              cost: parseFloat(record.cost || '') || null,
              cloudTags: record.tags || '{}',
              notes: record.notes || null,
              organizationId: organizationId || null,
              userId: user.id,
            },
          });
          break;

        case 'maintenance':
          item = await prisma.maintenanceWindow.create({
            data: {
              name: record.name || `Maintenance ${i + 1}`,
              description: record.description || null,
              startTime: dateOrNull(record.starttime || record['start time']) || new Date(),
              endTime: dateOrNull(record.endtime || record['end time']) || new Date(Date.now() + 3600000),
              status: record.status || 'scheduled',
              priority: record.priority || 'medium',
              impact: record.impact || null,
              organizationId: organizationId || null,
              userId: user.id,
            },
          });
          break;

        default:
          errors.push({ index: i, error: `Unknown module: ${target}` });
          continue;
      }

      if (item) created.push(item);
    } catch (err: any) {
      errors.push({ index: i, error: err.message });
    }
  }

  void auditLog({ userId: user.id, action: 'data.import', resourceType: target, resourceName: `${created.length}/${records.length}`, details: { module: target } });

  return NextResponse.json({
    success: errors.length === 0,
    imported: created.length,
    skipped: records.length - created.length - errors.length,
    errors: errors.map((e) => e.error),
  });
}