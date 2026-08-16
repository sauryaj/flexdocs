import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { generateComplianceReport, reportToCsv } from '@/lib/compliance';

const REPORT_TYPES = ['documents', 'passwords', 'domains', 'assets', 'organizations', 'activity', 'compliance', 'health'] as const;
type ReportType = (typeof REPORT_TYPES)[number];

function csv(rows: string[][]): string {
  return rows.map((cols) => cols.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
}

function toIso(d: Date | null | undefined): string {
  return d ? new Date(d).toISOString() : '';
}

async function generateReport(userId: string, type: ReportType, format: string): Promise<{ content: string; contentType: string; filename: string }> {
  const filenameBase = `${type}-report-${new Date().toISOString().slice(0, 10)}`;

  if (type === 'compliance') {
    const report = await generateComplianceReport(userId);
    if (format === 'pdf') {
      const body = buildPdf(reportToCsv(report));
      return { content: body, contentType: 'application/pdf', filename: `${filenameBase}.pdf` };
    }
    const csvContent = reportToCsv(report);
    return { content: csvContent, contentType: 'text/csv', filename: `${filenameBase}.csv` };
  }

  if (type === 'health') {
    const passwords = await prisma.password.findMany({ where: { userId } });
    const rows: string[][] = [['Name', 'Username', 'Category', 'Created', 'Updated', 'Age (days)', 'Expires']];
    const now = new Date();
    for (const p of passwords) {
      rows.push([
        p.name,
        p.username,
        p.category,
        toIso(p.createdAt),
        toIso(p.updatedAt),
        String(Math.floor((now.getTime() - (p.updatedAt || p.createdAt).getTime()) / 86400000)),
        toIso(p.expiresAt),
      ]);
    }
    return { content: csv(rows), contentType: 'text/csv', filename: `${filenameBase}.csv` };
  }

  if (type === 'documents') {
    const items = await prisma.document.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' }, include: { tags: true } });
    const rows: string[][] = [['Title', 'Type', 'Category', 'Tags', 'Archived', 'Updated']];
    for (const d of items) {
      rows.push([d.title, d.type, d.category, (d.tags || []).map((t) => t.name).join('; '), String(d.isArchived), toIso(d.updatedAt)]);
    }
    return { content: csv(rows), contentType: 'text/csv', filename: `${filenameBase}.csv` };
  }

  if (type === 'passwords') {
    const items = await prisma.password.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' } });
    const rows: string[][] = [['Name', 'Username', 'Category', 'URL', 'Favorite', 'Expires', 'Updated']];
    for (const p of items) {
      rows.push([p.name, p.username, p.category, p.url || '', String(p.isFavorite), toIso(p.expiresAt), toIso(p.updatedAt)]);
    }
    return { content: csv(rows), contentType: 'text/csv', filename: `${filenameBase}.csv` };
  }

  if (type === 'domains') {
    const items = await prisma.domain.findMany({ where: { userId }, orderBy: { expiresAt: 'asc' } });
    const rows: string[][] = [['Name', 'Registrar', 'Status', 'Expires', 'Days Until Expiry']];
    const now = new Date();
    for (const d of items) {
      const days = d.expiresAt ? Math.ceil((d.expiresAt.getTime() - now.getTime()) / 86400000) : null;
      rows.push([d.name, d.registrar || '', d.status, toIso(d.expiresAt), days === null ? '' : String(days)]);
    }
    return { content: csv(rows), contentType: 'text/csv', filename: `${filenameBase}.csv` };
  }

  if (type === 'assets') {
    const items = await prisma.flexibleAsset.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' } });
    const rows: string[][] = [['Name', 'Type', 'Archived', 'Updated']];
    for (const a of items) {
      rows.push([a.name, a.assetType, String(a.isArchived), toIso(a.updatedAt)]);
    }
    return { content: csv(rows), contentType: 'text/csv', filename: `${filenameBase}.csv` };
  }

  if (type === 'organizations') {
    const items = await prisma.organization.findMany({ orderBy: { name: 'asc' } });
    const rows: string[][] = [['Name', 'Website', 'Email', 'Phone', 'Address']];
    for (const o of items) {
      rows.push([o.name, o.website || '', o.email || '', o.phone || '', o.address || '']);
    }
    return { content: csv(rows), contentType: 'text/csv', filename: `${filenameBase}.csv` };
  }

  if (type === 'activity') {
    const items = await prisma.activityLog.findMany({
      where: { userId },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const rows: string[][] = [['Action', 'Resource Type', 'Resource Name', 'User', 'Created At']];
    for (const a of items) {
      rows.push([a.action, a.resourceType || '', a.resourceName || '', a.user?.name || '', toIso(a.createdAt)]);
    }
    return { content: csv(rows), contentType: 'text/csv', filename: `${filenameBase}.csv` };
  }

  throw new Error('Unknown report type');
}

function buildPdf(text: string): string {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const lines: string[] = [];
  let offset = 800;
  for (const raw of text.split('\n')) {
    lines.push(`BT /F1 9 Tf ${offset} Td (${esc(raw.slice(0, 110))}) Tj ET`);
    offset -= 14;
    if (offset < 40) break;
  }
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj',
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj`,
    `4 0 obj\n<< /Length ${lines.join('\n').length} >>\nstream\n${lines.join('\n')}\nendstream\nendobj`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += `${obj}\n`;
  }
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return pdf;
}

export async function GET(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'report.read')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const type = (searchParams.get('type') || 'compliance') as ReportType;
  const format = searchParams.get('format') || 'csv';

  const report = await generateReport(user.id, type, format);
  return new NextResponse(report.content, {
    headers: {
      'Content-Type': report.contentType,
      'Content-Disposition': `attachment; filename="${report.filename}"`,
    },
  });
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'report.read')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { type, format } = await req.json().catch(() => ({}));
  const reportType: ReportType = REPORT_TYPES.includes(type) ? type : 'compliance';
  const fmt: string = format === 'pdf' ? 'pdf' : 'csv';

  const report = await generateReport(user.id, reportType, fmt);
  return new NextResponse(report.content, {
    headers: {
      'Content-Type': report.contentType,
      'Content-Disposition': `attachment; filename="${report.filename}"`,
    },
  });
}