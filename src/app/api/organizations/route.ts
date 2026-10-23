import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/rbac';
import { type UserRole } from '@prisma/client';
import { listVisibleOrganizations } from '@/lib/organization-read';
import { DocumentWriteError } from '@/lib/document-write';

export async function GET() {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    return NextResponse.json(await listVisibleOrganizations(user.id), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof DocumentWriteError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Unable to load organizations' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(user.role as UserRole, 'organization.create')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { name, description, website, phone, email, address, logo } = await req.json();

  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const organization = await prisma.organization.create({
    data: {
      name,
      description: description || null,
      website: website || null,
      phone: phone || null,
      email: email || null,
      address: address || null,
      logo: logo || null,
    },
    include: {
      _count: {
        select: {
          documents: { where: { deletedAt: null } },
          passwords: true,
          domains: true,
          assets: true,
          checklists: true,
        },
      },
    },
  });

  return NextResponse.json(organization, { status: 201 });
}
