import { createSign } from 'crypto';
import { decrypt } from './encryption';
import logger from './logger';

export interface SyncedUser {
  name: string;
  email: string;
  suspended: boolean;
  mfaHint?: string;
}

export interface SyncResult {
  ok: boolean;
  users?: SyncedUser[];
  licenseSummary?: { sku: string; total: number; consumed: number }[];
  error?: string;
}

interface M365Creds {
  tenantId: string;
  clientId: string;
  clientSecretEnc: string;
}
interface GoogleCreds {
  serviceAccountEmail: string;
  privateKeyEnc: string;
  adminEmail: string;
}

async function m365Token(creds: M365Creds): Promise<string> {
  const res = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(creds.tenantId)}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: creds.clientId,
        client_secret: decrypt(creds.clientSecretEnc),
        scope: 'https://graph.microsoft.com/.default',
      }),
    },
  );
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || `M365 auth failed (${res.status})`);
  }
  return data.access_token as string;
}

async function syncM365(creds: M365Creds): Promise<SyncResult> {
  const token = await m365Token(creds);
  const headers = { Authorization: `Bearer ${token}` };

  const usersRes = await fetch(
    'https://graph.microsoft.com/v1.0/users?$select=displayName,userPrincipalName,mail,accountEnabled&$top=999',
    { headers },
  );
  if (!usersRes.ok) throw new Error(`Graph users failed (${usersRes.status})`);
  const usersData = await usersRes.json();

  let licenseSummary: SyncResult['licenseSummary'];
  try {
    const skusRes = await fetch('https://graph.microsoft.com/v1.0/subscribedSkus', { headers });
    if (skusRes.ok) {
      const skus = await skusRes.json();
      licenseSummary = (skus.value || []).map((s: any) => ({
        sku: (s.skuPartNumber || s.id) as string,
        total: s.totalUnits as number,
        consumed: s.consumedUnits as number,
      }));
    }
  } catch (err) {
    logger.warn('License fetch skipped', { err: String(err) });
  }

  return {
    ok: true,
    users: (usersData.value || []).map((u: any) => ({
      name: u.displayName || '',
      email: u.mail || u.userPrincipalName || '',
      suspended: u.accountEnabled === false,
    })),
    licenseSummary,
  };
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

async function googleToken(creds: GoogleCreds): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({
      iss: creds.serviceAccountEmail,
      sub: creds.adminEmail,
      scope: 'https://www.googleapis.com/auth/admin.directory.user.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    }),
  );
  const privateKey = decrypt(creds.privateKeyEnc);
  const signature = base64url(
    createSign('RSA-SHA256').update(`${header}.${claims}`).sign(privateKey),
  );
  const assertion = `${header}.${claims}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error(`Google auth failed (${res.status})`);
  return data.access_token as string;
}

async function syncGoogle(creds: GoogleCreds): Promise<SyncResult> {
  const token = await googleToken(creds);
  const res = await fetch(
    'https://admin.googleapis.com/admin/directory/v1/users?customer=my_customer&maxResults=500&projection=basic',
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Directory users failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return {
    ok: true,
    users: (data.users || []).map((u: any) => ({
      name: u.name?.fullName || '',
      email: u.primaryEmail || '',
      suspended: u.suspended === true,
      mfaHint: u.enrolledIn2Sv ? '2sv' : undefined,
    })),
  };
}

export async function runTenantSync(
  type: string,
  creds: { tenantId?: string | null; clientId?: string | null; clientSecret?: string | null; serviceAccountEmail?: string | null; privateKey?: string | null; adminEmail?: string | null },
): Promise<SyncResult> {
  try {
    if (type === 'm365') {
      if (!creds.tenantId || !creds.clientId || !creds.clientSecret) {
        return { ok: false, error: 'tenantId, clientId and clientSecret required' };
      }
      return await syncM365({
        tenantId: creds.tenantId,
        clientId: creds.clientId,
        clientSecretEnc: creds.clientSecret,
      });
    }
    if (type === 'google') {
      if (!creds.serviceAccountEmail || !creds.privateKey || !creds.adminEmail) {
        return { ok: false, error: 'serviceAccountEmail, privateKey and adminEmail required' };
      }
      return await syncGoogle({
        serviceAccountEmail: creds.serviceAccountEmail,
        privateKeyEnc: creds.privateKey,
        adminEmail: creds.adminEmail,
      });
    }
    return { ok: false, error: `unknown integration type: ${type}` };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Tenant sync failed', { type, error: message });
    return { ok: false, error: message };
  }
}
