import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

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
    },
  });

  if (!organization) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
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
