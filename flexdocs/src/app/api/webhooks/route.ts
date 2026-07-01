import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const user = await auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const webhooks = await prisma.webhook.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(webhooks);
}

export async function POST(request: Request) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, url, secret, events } = await request.json();

  if (!name || !url) {
    return NextResponse.json({ error: 'Name and URL required' }, { status: 400 });
  }

  const webhook = await prisma.webhook.create({
    data: {
      name,
      url,
      secret: secret || null,
      events: JSON.stringify(events || []),
      userId: user.id,
    },
  });

  return NextResponse.json(webhook, { status: 201 });
}
