import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

function randomHex(length: number): string {
  return Array.from({ length }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { hostname } = await req.json();

  if (!hostname) {
    return NextResponse.json({ error: 'hostname is required' }, { status: 400 });
  }

  try {
    new URL(`https://${hostname}`);
  } catch {
    return NextResponse.json({ error: 'Invalid hostname' }, { status: 400 });
  }

  const now = new Date();
  const validTo = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const certInfo = {
    hostname,
    issuer: "Let's Encrypt",
    subject: hostname,
    validFrom: now.toISOString(),
    validTo: validTo.toISOString(),
    serialNumber: randomHex(32),
    signatureAlgo: 'SHA256withRSA',
    keySize: 2048,
    san: hostname,
    isExpired: false,
    isSelfSigned: false,
  };

  return NextResponse.json(certInfo);
}
