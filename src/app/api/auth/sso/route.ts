import { NextResponse } from 'next/server';
import { getSsoConfig } from '@/lib/sso';

export async function GET() {
  const config = getSsoConfig();
  if (!config) {
    return NextResponse.json({ enabled: false });
  }

  return NextResponse.json({
    enabled: config.isActive,
    name: config.name,
    type: config.type,
    ssoUrl: config.ssoUrl,
    callbackUrl: config.callbackUrl,
  });
}
