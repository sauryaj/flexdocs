import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { randomBytes } from 'node:crypto';
import { invitationRequest, invitationHash, invitationUrl } from '@/lib/invitations';
import { sendEmail } from '@/lib/email';
import { auditLog } from '@/lib/audit';

const select = { id: true, email: true, role: true, status: true, expiresAt: true, createdAt: true, organizationId: true, invitedBy: { select: { name: true, email: true } } } as const;
export async function GET() {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'user.invite')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const invitations = await prisma.invitation.findMany({ select, orderBy: { createdAt: 'desc' } });
  return NextResponse.json(invitations.map(i => ({ ...i, status: i.status === 'pending' && i.expiresAt <= new Date() ? 'expired' : i.status })), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'user.invite')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await req.json().catch(() => null);
  const parsed = invitationRequest.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Valid email, role and optional organization required' }, { status: 400 });
  const { email, role, organizationId } = parsed.data;
  if (organizationId && !await prisma.organization.findUnique({ where: { id: organizationId } })) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  const token = randomBytes(32).toString('hex');
  const url = invitationUrl(token);
  const expiresAt = new Date(Date.now() + 7 * 86400000);
  const invitation = await prisma.$transaction(async tx => {
    // A new link replaces prior pending links for this recipient.
    await tx.invitation.updateMany({ where: { email: { equals: email, mode: 'insensitive' }, status: 'pending' }, data: { status: 'revoked' } });
    return tx.invitation.create({ data: { email, role, organizationId, token: invitationHash(token), invitedById: user.id, expiresAt }, select });
  });
  const delivered = Boolean(process.env.SMTP_HOST) && await sendEmail({
    to: email, subject: 'Your FlexDocs invitation',
    text: `You have been invited to FlexDocs. Accept within seven days: ${url}`,
    html: `<p>You have been invited to FlexDocs.</p><p><a href="${url}">Accept invitation</a></p><p>This link expires in seven days.</p>`,
  });
  void auditLog({ userId: user.id, action: 'invitation.create', resourceType: 'invitation', resourceId: invitation.id, details: { delivered } });
  return NextResponse.json({ ...invitation, invitationUrl: url, delivery: delivered ? 'sent' : 'manual', message: delivered ? 'Invitation email sent.' : 'Email was not sent. Copy and share the invitation link securely.' }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'user.invite')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const result = await prisma.invitation.updateMany({ where: { id, status: 'pending' }, data: { status: 'revoked' } });
  if (!result.count) return NextResponse.json({ error: 'Pending invitation not found' }, { status: 404 });
  void auditLog({ userId: user.id, action: 'invitation.revoke', resourceType: 'invitation', resourceId: id });
  return NextResponse.json({ success: true });
}
