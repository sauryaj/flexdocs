import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { canAccessOrganization } from '@/lib/org-scope';
import PDFDocument from 'pdfkit';

const DAY = 86400000;

export async function GET(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'report.export')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const organizationId = url.searchParams.get('organizationId');
  if (!organizationId) {
    return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
  }
  if (!(await canAccessOrganization(user.id, user.role, organizationId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  });
  if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

  const in90 = new Date(Date.now() + 90 * DAY);
  const staleCutoff = new Date(Date.now() - 30 * DAY);

  const [
    docCount, passCount, assetCount,
    domains, certs, servers, renewals,
  ] = await Promise.all([
    prisma.document.count({ where: { organizationId } }),
    prisma.password.count({ where: { organizationId } }),
    prisma.flexibleAsset.count({ where: { organizationId } }),
    prisma.domain.findMany({
      where: { organizationId, expiresAt: { lte: in90, gte: new Date() } },
      orderBy: { expiresAt: 'asc' },
      select: { name: true, expiresAt: true },
    }),
    prisma.sslCertificate.findMany({
      where: { organizationId, validTo: { lte: in90, gte: new Date() } },
      orderBy: { validTo: 'asc' },
      select: { hostname: true, validTo: true },
    }),
    prisma.server.findMany({
      where: { organizationId },
      select: { name: true, updatedAt: true, lastHeartbeatAt: true, patchStatus: true },
    }),
    prisma.renewalItem.findMany({
      where: { organizationId, renewsAt: { lte: in90, gte: new Date() } },
      orderBy: { renewsAt: 'asc' },
      select: { name: true, renewsAt: true, totalCost: true },
    }),
  ]);

  const staleServers = servers.filter((s) => s.updatedAt < staleCutoff);
  const offlineAgents = servers.filter(
    (s) => s.lastHeartbeatAt && Date.now() - s.lastHeartbeatAt.getTime() > 24 * 3600000,
  );
  const patchPending = servers.filter((s) => s.patchStatus && s.patchStatus !== 'current');

  const content = await buildQbrPdf({
    orgName: org.name,
    period: new Date().toISOString().slice(0, 10),
    totals: {
      documents: docCount,
      passwords: passCount,
      assets: assetCount,
      servers: servers.length,
    },
    domains: domains.map((d) => [d.name, d.expiresAt!.toISOString().slice(0, 10)]),
    certs: certs.map((c) => [c.hostname, c.validTo!.toISOString().slice(0, 10)]),
    renewals: renewals.map((r) => [r.name, r.renewsAt.toISOString().slice(0, 10), r.totalCost != null ? `$${r.totalCost.toFixed(2)}` : '—']),
    health: {
      totalServers: servers.length,
      staleCount: staleServers.length,
      offlineAgents: offlineAgents.map((s) => s.name),
      patchPending: patchPending.map((s) => s.name),
    },
  });

  return new NextResponse(new Uint8Array(content), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="qbr-${org.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().slice(0, 10)}.pdf"`,
    },
  });
}

interface QbrData {
  orgName: string;
  period: string;
  totals: Record<string, number>;
  domains: [string, string][];
  certs: [string, string][];
  renewals: [string, string, string][];
  health: { totalServers: number; staleCount: number; offlineAgents: string[]; patchPending: string[] };
}

function buildQbrPdf(data: QbrData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const section = (title: string) => {
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').fontSize(13).fillColor('#1f2937').text(title);
      doc.moveDown(0.15);
      doc.strokeColor('#d1d5db').lineWidth(0.8).moveTo(doc.x, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
      doc.moveDown(0.35);
    };

    const kv = (label: string, value: string | number) => {
      doc.font('Helvetica').fontSize(10).fillColor('#374151').text(`${label}: `, { continued: true })
        .font('Helvetica-Bold').fillColor('#111827').text(String(value));
    };

    const list = (items: string[], emptyText: string) => {
      if (items.length === 0) {
        doc.font('Helvetica').fontSize(9.5).fillColor('#6b7280').text(emptyText);
        return;
      }
      items.forEach((i) => doc.font('Helvetica').fontSize(9.5).fillColor('#374151').text(`•  ${i}`));
    };

    doc.font('Helvetica-Bold').fontSize(20).fillColor('#111827').text(`${data.orgName} — Quarterly Review`);
    doc.font('Helvetica').fontSize(9.5).fillColor('#6b7280').text(`Generated ${data.period} · FlexDocs`);
    doc.moveDown(0.8);

    section('Managed Assets');
    kv('Documents', data.totals.documents);
    kv('Credentials under management', data.totals.passwords);
    kv('Flexible assets', data.totals.assets);
    kv('Configurations / servers', data.totals.servers);

    section('Infrastructure Health');
    list(
      [
        `${data.health.totalServers} server${data.health.totalServers === 1 ? '' : 's'} tracked`,
        ...[data.health.staleCount > 0 ? [`${data.health.staleCount} configuration${data.health.staleCount === 1 ? '' : 's'} not updated in 30+ days`] : []].flat(),
        ...data.health.offlineAgents.map((n) => `Agent offline: ${n}`),
        ...data.health.patchPending.map((n) => `Patches pending: ${n}`),
      ],
      'No configuration or agent issues detected.',
    );

    section('Domains Expiring Within 90 Days');
    list(
      data.domains.map(([n, d]) => `${n} — expires ${d}`),
      'No domain expiries in the next 90 days.',
    );

    section('SSL Certificates Expiring Within 90 Days');
    list(
      data.certs.map(([h, d]) => `${h} — expires ${d}`),
      'No certificate expiries in the next 90 days.',
    );

    section('Licenses & Contracts Renewing');
    list(
      data.renewals.map(([n, d, c]) => `${n} — renews ${d}${c !== '—' ? ` (${c})` : ''}`),
      'No renewals due in the next 90 days.',
    );

    doc.end();
  });
}
