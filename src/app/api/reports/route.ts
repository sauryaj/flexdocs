import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { generateComplianceReport, reportToCsv, type ReportData } from '@/lib/compliance';
import PDFDocument from 'pdfkit';

const REPORT_TYPES = ['documents', 'passwords', 'domains', 'assets', 'organizations', 'activity', 'compliance', 'health'] as const;
type ReportType = (typeof REPORT_TYPES)[number];

function csv(rows: string[][]): string {
  return rows.map((cols) => cols.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
}

function toIso(d: Date | null | undefined): string {
  return d ? new Date(d).toISOString() : '';
}

async function generateReport(userId: string, type: ReportType, format: string): Promise<{ content: string | Buffer; contentType: string; filename: string }> {
  const filenameBase = `${type}-report-${new Date().toISOString().slice(0, 10)}`;

  if (type === 'compliance') {
    const report = await generateComplianceReport(userId);
    if (format === 'pdf') {
      const content = await buildPdf(report);
      return { content, contentType: 'application/pdf', filename: `${filenameBase}.pdf` };
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

function buildPdf(report: ReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const drawHeading = (title: string) => {
      doc.moveDown(0.4);
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#1f2937').text(title);
      doc.moveDown(0.2);
      doc.strokeColor('#d1d5db').lineWidth(0.8).moveTo(doc.x, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
      doc.moveDown(0.4);
    };

    const drawTable = (headers: string[], rows: (string | number | null | undefined)[][]) => {
      const cellPad = 5;
      const colWidth = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / headers.length;
      const drawRow = (cells: (string | number | null | undefined)[], isHeader: boolean) => {
        const cellFont = isHeader ? 'Helvetica-Bold' : 'Helvetica';
        const fontSize = isHeader ? 8.5 : 8;
        doc.font(cellFont).fontSize(fontSize);
        const lineHeight = fontSize + 3;
        cells.forEach((cell, i) => {
          const x = doc.page.margins.left + i * colWidth;
          const y = doc.y;
          if (isHeader) {
            doc.fillColor('#374151').rect(x, y, colWidth, lineHeight + 4).fill('#f3f4f6');
          }
          doc.fillColor(isHeader ? '#111827' : '#4b5563');
          doc.text(String(cell ?? ''), x + cellPad, y + 2, { width: colWidth - cellPad * 2, lineBreak: false, ellipsis: true });
        });
        doc.y += lineHeight + 4;
        if (doc.y > doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
          doc.y = doc.page.margins.top + 10;
        }
      };
      drawRow(headers, true);
      rows.forEach((r) => drawRow(r, false));
    };

    doc.font('Helvetica-Bold').fontSize(18).fillColor('#111827').text('Compliance Report');
    doc.font('Helvetica').fontSize(9).fillColor('#6b7280').text(`Generated: ${report.generatedAt}`);
    doc.moveDown(0.8);

    drawHeading('Summary');
    const s = report.summary;
    drawTable(
      ['Documents', 'Passwords', 'Domains', 'Assets', 'Checklists', 'SSL Certificates'],
      [[s.totalDocuments, s.totalPasswords, s.totalDomains, s.totalAssets, s.totalChecklists, s.totalSslCerts]],
    );

    drawHeading('Domain Expiry');
    drawTable(
      ['Name', 'Registrar', 'Status', 'Expires', 'Days Left'],
      report.domainExpiry.map((d) => [d.name, d.registrar, d.status, d.expiresAt ? new Date(d.expiresAt).toISOString().slice(0, 10) : 'N/A', d.daysUntilExpiry ?? 'N/A']),
    );

    drawHeading('Password Age');
    drawTable(
      ['Name', 'Username', 'Category', 'Updated', 'Days Old'],
      report.passwordAge.map((p) => [p.name, p.username, p.category, new Date(p.updatedAt).toISOString().slice(0, 10), p.daysOld]),
    );

    drawHeading('SSL Certificates');
    drawTable(
      ['Hostname', 'Issuer', 'Valid From', 'Valid To', 'Status', 'Days Left'],
      report.sslCertificates.map((c) => [c.hostname, c.issuer, c.validFrom ? new Date(c.validFrom).toISOString().slice(0, 10) : 'N/A', c.validTo ? new Date(c.validTo).toISOString().slice(0, 10) : 'N/A', c.isExpired ? 'EXPIRED' : 'Valid', c.daysUntilExpiry ?? 'N/A']),
    );

    drawHeading('Recent Activity');
    drawTable(
      ['Action', 'Resource', 'User', 'Created'],
      report.recentActivity.map((a) => [a.action, a.resourceName ?? '', a.userName ?? '', new Date(a.createdAt).toISOString().slice(0, 16)]),
    );

    doc.end();
  });
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
  const body: BodyInit = typeof report.content === 'string' ? report.content : new Uint8Array(report.content);
  return new NextResponse(body, {
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
  const body: BodyInit = typeof report.content === 'string' ? report.content : new Uint8Array(report.content);
  return new NextResponse(body, {
    headers: {
      'Content-Type': report.contentType,
      'Content-Disposition': `attachment; filename="${report.filename}"`,
    },
  });
}