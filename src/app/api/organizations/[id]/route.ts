import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/rbac';
import { getOrgScope } from '@/lib/org-scope';
import { type UserRole } from '@prisma/client';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const organization = await prisma.organization.findUnique({
    where: { id },
    include: {
      documents: true,
      passwords: true,
      domains: true,
      assets: true,
      checklists: {
        include: { items: true },
      },
      contacts: true,
      locations: true,
    },
  });

  if (!organization) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Limited (client) users get a filtered view: org-visible docs, client-visible
  // password metadata only (no encrypted secrets), and no staff-only fields.
  const scope = await getOrgScope(user.id, user.role);
  if (scope.mode === 'limited') {
    const allowed = scope.orgIds.includes(id);
    if (!allowed) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { passwords, documents, ...rest } = organization;
    return NextResponse.json({
      ...rest,
      passwords: passwords
        .filter((p) => p.clientVisible)
        .map(({ password: _pw, totpSecret: _totp, notes: _notes, ...pub }) => pub),
      documents: documents.filter((d) => d.visibility === 'org' && !d.isArchived),
    });
  }

  return NextResponse.json(organization);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(user.role as UserRole, 'organization.update')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const { name, description, website, phone, email, address, logo } = await req.json();

  const organization = await prisma.organization.findUnique({
    where: { id },
  });

  if (!organization) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const updated = await prisma.organization.update({
    where: { id },
    data: {
      name,
      description: description || null,
      website: website || null,
      phone: phone || null,
      email: email || null,
      address: address || null,
      logo: logo || null,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(user.role as UserRole, 'organization.delete')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  const organization = await prisma.organization.findUnique({
    where: { id },
  });

  if (!organization) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.document.updateMany({ where: { organizationId: id }, data: { organizationId: null } }),
    prisma.password.updateMany({ where: { organizationId: id }, data: { organizationId: null } }),
    prisma.domain.updateMany({ where: { organizationId: id }, data: { organizationId: null } }),
    prisma.flexibleAsset.updateMany({ where: { organizationId: id }, data: { organizationId: null } }),
    prisma.checklist.updateMany({ where: { organizationId: id }, data: { organizationId: null } }),
    prisma.folder.updateMany({ where: { organizationId: id }, data: { organizationId: null } }),
  ]);

  await prisma.organization.delete({ where: { id } });

  return NextResponse.json({ message: 'Deleted' });
}
