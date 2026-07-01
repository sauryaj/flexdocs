import { prisma } from '@/lib/prisma';
import { createHash, randomBytes } from 'crypto';
import logger from '@/lib/logger';

export interface SsoProvider {
  id: string;
  name: string;
  type: 'saml' | 'oidc';
  issuer: string;
  ssoUrl: string;
  certificate?: string;
  clientId?: string;
  clientSecret?: string;
  callbackUrl: string;
  isActive: boolean;
}

// SSO configuration stored in environment variables
export function getSsoConfig(): SsoProvider | null {
  const ssoType = process.env.SSO_TYPE; // 'saml' | 'oidc'
  if (!ssoType) return null;

  return {
    id: 'sso-default',
    name: process.env.SSO_NAME || 'SSO Provider',
    type: ssoType as 'saml' | 'oidc',
    issuer: process.env.SSO_ISSUER || '',
    ssoUrl: process.env.SSO_URL || '',
    certificate: process.env.SSO_CERTIFICATE,
    clientId: process.env.SSO_CLIENT_ID,
    clientSecret: process.env.SSO_CLIENT_SECRET,
    callbackUrl: process.env.SSO_CALLBACK_URL || `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'}/api/auth/sso/callback`,
    isActive: !!(process.env.SSO_URL && process.env.SSO_ISSUER),
  };
}

export function generateSsoSessionToken(): string {
  return randomBytes(32).toString('hex');
}

export async function createSsoSession(userId: string, ip?: string, userAgent?: string) {
  const token = generateSsoSessionToken();
  const session = await prisma.session.create({
    data: {
      userId,
      token: createHash('sha256').update(token).digest('hex'),
      ip,
      userAgent,
    },
  });
  return { session, plainToken: token };
}

export interface SamlResponse {
  email: string;
  name: string;
  attributes: Record<string, string>;
}

export function parseSamlResponse(samlResponse: string): SamlResponse | null {
  try {
    const decoded = Buffer.from(samlResponse, 'base64').toString('utf-8');
    // Extract NameID (email) and attributes from SAML response
    const emailMatch = decoded.match(/<saml:NameID[^>]*>([^<]+)<\/saml:NameID>/);
    const nameMatch = decoded.match(/<saml:Attribute Name="displayName"[^>]*>\s*<saml:AttributeValue[^>]*>([^<]+)<\/saml:AttributeValue>/);

    if (!emailMatch) return null;

    return {
      email: emailMatch[1],
      name: nameMatch?.[1] || emailMatch[1].split('@')[0],
      attributes: {},
    };
  } catch (err) {
    logger.error('SAML response parse error', { error: String(err) });
    return null;
  }
}

export async function handleSsoCallback(
  email: string,
  name: string,
  ip?: string,
  userAgent?: string
) {
  // Find or create user
  let user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name,
        role: 'editor',
        emailVerified: new Date(),
      },
    });
    logger.info('SSO user created', { userId: user.id, email });
  }

  // Create session
  const { plainToken } = await createSsoSession(user.id, ip, userAgent);

  return { user, token: plainToken };
}
