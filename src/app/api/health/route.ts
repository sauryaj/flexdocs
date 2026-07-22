import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const checks: Record<string, string> = {};
  let healthy = true;

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch {
    checks.database = 'error';
    healthy = false;
  }

  try {
    const { default: Redis } = await import('ioredis');
    const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: 1, lazyConnect: true, connectTimeout: 1000 });
    await redis.connect();
    await redis.ping();
    await redis.quit();
    checks.redis = 'ok';
  } catch {
    checks.redis = 'offline (optional)';
  }

  checks.timestamp = new Date().toISOString();
  checks.uptime = `${Math.floor(process.uptime())}s`;

  return NextResponse.json(
    { status: healthy ? 'healthy' : 'degraded', checks },
    { status: healthy ? 200 : 503 }
  );
}
