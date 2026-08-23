import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { generateComplianceReport, type ReportData } from '@/lib/compliance';
import PDFDocument from 'pdfkit';

const REPORT_TYPES = ['documents', 'passwords', 'domains', 'assets', 'organizations', 'activity', 'compliance', 'health'] as const;
type ReportType = (typeof REPORT_TYPES)[number];

type Cell = string | number | null | undefined;
interface ReportSection {
  heading: string;
  headers: string[];
  rows: Cell[][];
}
interface StructuredReport {
  title: string;
  sections: ReportSection[];
}

function csv(rows: Cell[][]): string {
  return rows.map((cols) => cols.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
}

function toIso(d: Date | null | undefined): string {
  return d ? new Date(d).toISOString() : '';
}

function toDay(d: Date | string | null | undefined): string {
  return d ? new Date(d).toISOString().slice(0, 10) : 'N/A';
}

async function buildStructuredReport(userId: string, type: ReportType): Promise<StructuredReport> {
  if (type === 'health') {
    const passwords = await prisma.password.findMany({ where: { userId } });
    const now = new Date();
    const rows: Cell[][] = passwords.map((p) => [
      p.name,
      p.username,
      p.category,
      toIso(p.createdAt),
      toIso(p.updatedAt),
      Math.floor((now.getTime() - (p.updatedAt || p.createdAt).getTime()) / 86400000),
      toIso(p.expiresAt),
    ]);
    return {
      title: 'Password Health Report',
      sections: [{ heading: 'Passwords', headers: ['Name', 'Username', 'Category', 'Created', 'Updated', 'Age (days)', 'Expires'], rows }],
    };
  }

  if (type === 'documents') {
    const items = await prisma.document.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' }, include: { tags: true } });
    const rows: Cell[][] = items.map((d) => [d.title, d.type, d.category, (d.tags || []).map((t) => t.name).join('; '), String(d.isArchived), toIso(d.updatedAt)]);
    return {
      title: 'Documents Report',
      sections: [{ heading: 'Documents', headers: ['Title', 'Type', 'Category', 'Tags', 'Archived', 'Updated'], rows }],
    };
  }

  if (type === 'passwords') {
    const items = await prisma.password.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' } });
    const rows: Cell[][] = items.map((p) => [p.name, p.username, p.category, p.url || '', String(p.isFavorite), toIso(p.expiresAt), toIso(p.updatedAt)]);
    return {
      title: 'Passwords Report',
      sections: [{ heading: 'Passwords', headers: ['Name', 'Username', 'Category', 'URL', 'Favorite', 'Expires', 'Updated'], rows }],
    };
  }

  if (type === 'domains') {
    const items = await prisma.domain.findMany({ where: { userId }, orderBy: { expiresAt: 'asc' } });
    const now = new Date();
    const rows: Cell[][] = items.map((d) => {
      const days = d.expiresAt ? Math.ceil((d.expiresAt.getTime() - now.getTime()) / 86400000) : null;
      return [d.name, d.registrar || '', d.status, toIso(d.expiresAt), days === null ? '' : days];
    });
    return {
      title: 'Domains Report',
      sections: [{ heading: 'Domains', headers: ['Name', 'Registrar', 'Status', 'Expires', 'Days Until Expiry'], rows }],
    };
  }

  if (type === 'assets') {
    const items = await prisma.flexibleAsset.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' } });
    const rows: Cell[][] = items.map((a) => [a.name, a.assetType, String(a.isArchived), toIso(a.updatedAt)]);
    return {
      title: 'Assets Report',
      sections: [{ heading: 'Flexible Assets', headers: ['Name', 'Type', 'Archived', 'Updated'], rows }],
    };
  }

  if (type === 'organizations') {
    const items = await prisma.organization.findMany({ orderBy: { name: 'asc' } });
    const rows: Cell[][] = items.map((o) => [o.name, o.website || '', o.email || '', o.phone || '', o.address || '']);
    return {
      title: 'Organizations Report',
      sections: [{ heading: 'Organizations', headers: ['Name', 'Website', 'Email', 'Phone', 'Address'], rows }],
    };
  }

  if (type === 'activity') {
    const items = await prisma.activityLog.findMany({
      where: { userId },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const rows: Cell[][] = items.map((a) => [a.action, a.resourceType || '', a.resourceName || '', a.user?.name || '', toIso(a.createdAt)]);
    return {
      title: 'Activity Report',
      sections: [{ heading: 'Recent Activity', headers: ['Action', 'Resource Type', 'Resource Name', 'User', 'Created At'], rows }],
    };
  }

  throw new Error('Unknown report type');
}

function complianceSections(report: ReportData): StructuredReport {
  const s = report.summary;
  return {
    title: 'Compliance Report',
    sections: [
      {
        heading: 'Summary',
        headers: ['Documents', 'Passwords', 'Domains', 'Assets', 'Checklists', 'SSL Certificates'],
        rows: [[s.totalDocuments, s.totalPasswords, s.totalDomains, s.totalAssets, s.totalChecklists, s.totalSslCerts]],
      },
      {
        heading: 'Domain Expiry',
        headers: ['Name', 'Registrar', 'Status', 'Expires', 'Days Left'],
        rows: report.domainExpiry.map((d) => [d.name, d.registrar, d.status, toDay(d.expiresAt), d.daysUntilExpiry ?? 'N/A']),
      },
      {
        heading: 'Password Age',
        headers: ['Name', 'Username', 'Category', 'Updated', 'Days Old'],
        rows: report.passwordAge.map((p) => [p.name, p.username, p.category, toDay(p.updatedAt), p.daysOld]),
      },
      {
        heading: 'SSL Certificates',
        headers: ['Hostname', 'Issuer', 'Valid From', 'Valid To', 'Status', 'Days Left'],
        rows: report.sslCertificates.map((c) => [c.hostname, c.issuer, toDay(c.validFrom), toDay(c.validTo), c.isExpired ? 'EXPIRED' : 'Valid', c.daysUntilExpiry ?? 'N/A']),
      },
      {
        heading: 'Recent Activity',
        headers: ['Action', 'Resource', 'User', 'Created'],
        rows: report.recentActivity.map((a) => [a.action, a.resourceName ?? '', a.userName ?? '', a.createdAt.slice(0, 16)]),
      },
    ],
  };
}

async function generateReport(userId: string, type: ReportType, format: string): Promise<{ content: string | Buffer; contentType: string; filename: string }> {
  const filenameBase = `${type}-report-${new Date().toISOString().slice(0, 10)}`;

  let structured: StructuredReport;
  if (type === 'compliance') {
    structured = complianceSections(await generateComplianceReport(userId));
  } else {
    structured = await buildStructuredReport(userId, type);
  }

  if (format === 'pdf') {
    const content = await buildPdf(structured);
    return { content, contentType: 'application/pdf', filename: `${filenameBase}.pdf` };
  }

  const csvRows: Cell[][] = [];
  for (const section of structured.sections) {
    csvRows.push([section.heading]);
    csvRows.push(section.headers);
    csvRows.push(...section.rows);
    csvRows.push([]);
  }
  return { content: csv(csvRows), contentType: 'text/csv', filename: `${filenameBase}.csv` };
}

function buildPdf(report: StructuredReport): Promise<Buffer> {
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

    const drawTable = (headers: string[], rows: Cell[][]) => {
      const cellPad = 5;
      const colWidth = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / headers.length;
      const drawRow = (cells: Cell[], isHeader: boolean) => {
        const cellFont = isHeader ? 'Helvetica-Bold' : 'Helvetica';
        const fontSize = isHeader ? 8.5 : 8;
        doc.font(cellFont).fontSize(fontSize);
        const lineHeight = fontSize + 3;
        cells.forEach((cell, i) => {
          const x = doc.page.margins.left + i * colWidth;
          const y = doc.y;
          if (isHeader) {
            doc.rect(x, y, colWidth, lineHeight + 4).fill('#f3f4f6');
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
      doc.moveDown(0.3);
    };

    doc.font('Helvetica-Bold').fontSize(18).fillColor('#111827').text(report.title);
    doc.font('Helvetica').fontSize(9).fillColor('#6b7280').text(`Generated: ${new Date().toISOString()}`);
    doc.moveDown(0.8);

    for (const section of report.sections) {
      drawHeading(section.heading);
      drawTable(section.headers, section.rows);
    }

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
