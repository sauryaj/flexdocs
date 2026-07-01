import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { fetchWhoisData, fetchDnsRecords } from '@/lib/whois-dns';

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const organizationId = body?.organizationId || undefined;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const domains = await prisma.domain.findMany({
    where: {
      userId: user.id,
      ...(organizationId ? { organizationId } : {}),
      updatedAt: { lt: sevenDaysAgo },
    },
  });

  let updatedCount = 0;
  const results: { domain: string; success: boolean; error?: string }[] = [];

  for (const domain of domains) {
    try {
      const whoisData = await fetchWhoisData(domain.name);
      let dnsRecords = null;
      try {
        dnsRecords = await fetchDnsRecords(domain.name);
      } catch {
        // DNS is optional
      }

      await prisma.domain.update({
        where: { id: domain.id },
        data: {
          registrar: whoisData.registrar || domain.registrar,
          nameservers: whoisData.nameservers?.join(', ') || domain.nameservers,
          expiresAt: whoisData.expiryDate ? new Date(whoisData.expiryDate) : domain.expiresAt,
          whoisCreated: whoisData.creationDate || domain.whoisCreated,
          whoisCountry: whoisData.registrantCountry || domain.whoisCountry,
          whoisState: whoisData.registrantState || domain.whoisState,
          privacyProtection: whoisData.privacyProtection ?? domain.privacyProtection,
          dnsRecords: dnsRecords ? JSON.stringify(dnsRecords) : domain.dnsRecords,
          lastWhoisCheck: new Date(),
          lastDnsCheck: dnsRecords ? new Date() : domain.lastDnsCheck,
        },
      });

      await prisma.domainRevision.create({
        data: {
          domainId: domain.id,
          source: 'whois',
          data: JSON.stringify({ whois: whoisData, dns: dnsRecords }),
          userId: user.id,
        },
      });

      updatedCount++;
      results.push({ domain: domain.name, success: true });
    } catch (error) {
      results.push({ domain: domain.name, success: false, error: String(error) });
    }
  }

  await auditLog({
    userId: user.id,
    action: 'domain.update',
    resourceType: 'domain',
    resourceName: 'bulk_whois',
    details: { updatedCount, totalChecked: domains.length },
  });

  return NextResponse.json({
    updatedCount,
    totalChecked: domains.length,
    results,
  });
}
