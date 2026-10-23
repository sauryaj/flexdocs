import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { invitationAcceptance, invitationHash } from '@/lib/invitations';
import { auditLog } from '@/lib/audit';
import { createSession, sessionCookieOptions } from '@/lib/session';

class AcceptanceError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function POST(req: Request) {
  const parsed = invitationAcceptance.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Use a valid invitation link, a name, and a password of at least 12 characters for new accounts.' }, { status: 400 });
  const { token, name, password } = parsed.data;
  const current = await auth();
  const hashedPassword = password ? await bcrypt.hash(password, 12) : undefined;
  try {
    const result = await prisma.$transaction(async tx => {
      const invitation = await tx.invitation.findUnique({ where: { token: invitationHash(token) } });
      if (!invitation || invitation.status !== 'pending' || invitation.expiresAt <= new Date()) throw new AcceptanceError(410, 'This invitation is expired, revoked, or already used. Ask an admin for a new link.');
      // Claim before reading the account so a concurrent winner cannot change the identity check.
      const claim = await tx.invitation.updateMany({ where: { id: invitation.id, status: 'pending', expiresAt: { gt: new Date() } }, data: { status: 'accepted' } });
      if (claim.count !== 1) throw new AcceptanceError(410, 'This invitation has already been used.');
      let user = await tx.user.findFirst({ where: { email: { equals: invitation.email, mode: 'insensitive' } } });
      const existing = Boolean(user);
      if (user && current?.id !== user.id) throw new AcceptanceError(401, 'Sign in as the invited email address, then return here to accept.');
      if (!user && (!name || !hashedPassword)) throw new AcceptanceError(400, 'Name and a password of at least 12 characters are required for a new account.');
      if (!user) user = await tx.user.create({ data: { email: invitation.email, name: name!, password: hashedPassword!, role: invitation.role, emailVerified: new Date() } });
      if (invitation.organizationId) await tx.organizationMember.upsert({ where: { organizationId_userId: { organizationId: invitation.organizationId, userId: user.id } }, update: {}, create: { organizationId: invitation.organizationId, userId: user.id, role: 'client' } });
      await tx.invitation.update({ where: { id: invitation.id }, data: { invitedUserId: user.id } });
      return { id: user.id, existing };
    });
    const response = NextResponse.json({ success: true, message: result.existing ? 'Invitation accepted. Your existing account role and password are unchanged.' : 'Account created.' });
    if (!result.existing) {
      const session = await createSession(result.id, req.headers.get('x-forwarded-for') || undefined, req.headers.get('user-agent') || undefined);
      response.cookies.set('flexdocs_session', session.cookieValue, sessionCookieOptions());
    }
    void auditLog({ userId: result.id, action: 'invitation.accept', resourceType: 'user', resourceId: result.id });
    return response;
  } catch (error) {
    if (error instanceof AcceptanceError) return NextResponse.json({ error: error.message }, { status: error.status });
    if ((error as { code?: string }).code === 'P2002') return NextResponse.json({ error: 'An account already exists. Sign in and accept the invitation again.' }, { status: 409 });
    throw error;
  }
}
