import { NextResponse } from 'next/server';
import { handleSsoCallback, parseSamlResponse } from '@/lib/sso';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  const { samlResponse, token } = await req.json();

  // Handle OIDC callback with token
  if (token) {
    // In a real OIDC flow, you'd validate the token against the provider
    // For now, we trust the token from the SSO callback
    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: true },
    });

    if (session) {
      return NextResponse.json({
        user: {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
        },
        token: session.token,
      });
    }
  }

  // Handle SAML response
  if (samlResponse) {
    const parsed = parseSamlResponse(samlResponse);
    if (!parsed) {
      return NextResponse.json({ error: 'Invalid SAML response' }, { status: 400 });
    }

    const { user, token } = await handleSsoCallback(parsed.email, parsed.name);
    return NextResponse.json({ user, token });
  }

  return NextResponse.json({ error: 'Missing samlResponse or token' }, { status: 400 });
}
