import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const organizations = await prisma.organization.findMany({
    include: {
      _count: {
        select: {
          documents: true,
          passwords: true,
          domains: true,
          assets: true,
          checklists: true,
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json(organizations);
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
          documents: true,
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
