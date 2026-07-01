import { prisma } from '@/lib/prisma';

export interface ReportData {
  generatedAt: string;
  summary: {
    totalDocuments: number;
    totalPasswords: number;
    totalDomains: number;
    totalAssets: number;
    totalChecklists: number;
    totalSslCerts: number;
  };
  domainExpiry: {
    name: string;
    expiresAt: string | null;
    status: string;
    registrar: string | null;
    daysUntilExpiry: number | null;
  }[];
  passwordAge: {
    name: string;
    username: string;
    category: string;
    createdAt: string;
    updatedAt: string;
    daysOld: number;
  }[];
  sslCertificates: {
    hostname: string;
    validFrom: string | null;
    validTo: string | null;
    issuer: string | null;
    isExpired: boolean;
    daysUntilExpiry: number | null;
  }[];
  recentActivity: {
    action: string;
    resourceType: string | null;
    resourceName: string | null;
    userName: string | null;
    createdAt: string;
  }[];
}

export async function generateComplianceReport(userId: string): Promise<ReportData> {
  const [
    docCount, passCount, domainCount, assetCount, checkCount, sslCount,
    domains, passwords, sslCerts, activity,
  ] = await Promise.all([
    prisma.document.count({ where: { userId } }),
    prisma.password.count({ where: { userId } }),
    prisma.domain.count({ where: { userId } }),
    prisma.flexibleAsset.count({ where: { userId } }),
    prisma.checklist.count({ where: { userId } }),
    prisma.sslCertificate.count({ where: { userId } }),
    prisma.domain.findMany({ where: { userId }, orderBy: { expiresAt: 'asc' } }),
    prisma.password.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    prisma.sslCertificate.findMany({ where: { userId }, orderBy: { validTo: 'asc' } }),
    prisma.activityLog.findMany({
      where: { userId },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);

  const now = new Date();

  return {
    generatedAt: now.toISOString(),
    summary: {
      totalDocuments: docCount,
      totalPasswords: passCount,
      totalDomains: domainCount,
      totalAssets: assetCount,
      totalChecklists: checkCount,
      totalSslCerts: sslCount,
    },
    domainExpiry: domains.map((d) => ({
      name: d.name,
      expiresAt: d.expiresAt?.toISOString() || null,
      status: d.status,
      registrar: d.registrar,
      daysUntilExpiry: d.expiresAt
        ? Math.ceil((d.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null,
    })),
    passwordAge: passwords.map((p) => ({
      name: p.name,
      username: p.username,
      category: p.category,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      daysOld: Math.floor((now.getTime() - p.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
    })),
    sslCertificates: sslCerts.map((s) => ({
      hostname: s.hostname,
      validFrom: s.validFrom?.toISOString() || null,
      validTo: s.validTo?.toISOString() || null,
      issuer: s.issuer,
      isExpired: s.isExpired,
      daysUntilExpiry: s.validTo
        ? Math.ceil((s.validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null,
    })),
    recentActivity: activity.map((a) => ({
      action: a.action,
      resourceType: a.resourceType,
      resourceName: a.resourceName,
      userName: a.user?.name || null,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}

export function reportToCsv(report: ReportData): string {
  const lines: string[] = [];

  lines.push('=== Summary ===');
  lines.push('Metric,Count');
  lines.push(`Documents,${report.summary.totalDocuments}`);
  lines.push(`Passwords,${report.summary.totalPasswords}`);
  lines.push(`Domains,${report.summary.totalDomains}`);
  lines.push(`Assets,${report.summary.totalAssets}`);
  lines.push(`Checklists,${report.summary.totalChecklists}`);
  lines.push(`SSL Certificates,${report.summary.totalSslCerts}`);
  lines.push('');

  lines.push('=== Domain Expiry ===');
  lines.push('Domain,Expires At,Status,Registrar,Days Until Expiry');
  for (const d of report.domainExpiry) {
    lines.push(`"${d.name}","${d.expiresAt || 'N/A'}","${d.status}","${d.registrar || 'N/A'}","${d.daysUntilExpiry ?? 'N/A'}"`);
  }
  lines.push('');

  lines.push('=== Password Age ===');
  lines.push('Name,Username,Category,Created,Updated,Days Old');
  for (const p of report.passwordAge) {
    lines.push(`"${p.name}","${p.username}","${p.category}","${p.createdAt}","${p.updatedAt}",${p.daysOld}`);
  }
  lines.push('');

  lines.push('=== SSL Certificates ===');
  lines.push('Hostname,Valid From,Valid To,Issuer,Expired,Days Until Expiry');
  for (const s of report.sslCertificates) {
    lines.push(`"${s.hostname}","${s.validFrom || 'N/A'}","${s.validTo || 'N/A'}","${s.issuer || 'N/A'}",${s.isExpired},"${s.daysUntilExpiry ?? 'N/A'}"`);
  }
  lines.push('');

  lines.push('=== Recent Activity ===');
  lines.push('Action,Resource Type,Resource Name,User,Created At');
  for (const a of report.recentActivity) {
    lines.push(`"${a.action}","${a.resourceType || 'N/A'}","${a.resourceName || 'N/A'}","${a.userName || 'N/A'}","${a.createdAt}"`);
  }

  return lines.join('\n');
}
