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

  const { domainId } = await req.json();

  if (!domainId) {
    return NextResponse.json({ error: 'domainId is required' }, { status: 400 });
  }

  const domain = await prisma.domain.findFirst({
    where: { id: domainId, userId: user.id },
  });

  if (!domain) {
    return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
  }

  // Fetch real WHOIS data
  const whoisData = await fetchWhoisData(domain.name);
  let dnsRecords = null;

  try {
    dnsRecords = await fetchDnsRecords(domain.name);
  } catch {
    // DNS fetch is optional
  }

  // Update domain with real data
  await prisma.domain.update({
    where: { id: domainId },
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

  const revision = await prisma.domainRevision.create({
    data: {
      domainId,
      source: 'whois',
      data: JSON.stringify({ whois: whoisData, dns: dnsRecords }),
      userId: user.id,
    },
  });

  await auditLog({
    userId: user.id,
    action: 'domain.update',
    resourceType: 'domain',
    resourceId: domainId,
    resourceName: domain.name,
    details: { source: 'whois', registrar: whoisData.registrar },
  });

  return NextResponse.json({ whois: whoisData, dns: dnsRecords, revision });
}
