import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const startTime = Date.now();
  const checks: Array<{ name: string; status: 'healthy' | 'degraded' | 'down'; latency?: number; message?: string }> = [];

  let isHealthy = true;

  // Database check
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    checks.push({
      name: 'Database',
      status: 'healthy',
      latency: Date.now() - dbStart,
      message: 'Connected to primary database',
    });
  } catch (err: unknown) {
    isHealthy = false;
    checks.push({
      name: 'Database',
      status: 'down',
      message: err instanceof Error ? err.message : 'Database query failed',
    });
  }

  // Redis check
  try {
    const redisStart = Date.now();
    const { default: Redis } = await import('ioredis');
    const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: 1, lazyConnect: true, connectTimeout: 1000 });
    await redis.connect();
    await redis.ping();
    await redis.quit();
    checks.push({
      name: 'Redis Cache',
      status: 'healthy',
      latency: Date.now() - redisStart,
      message: 'Connected to cache service',
    });
  } catch {
    checks.push({
      name: 'Redis Cache',
      status: 'degraded',
      message: 'Offline (optional caching degraded)',
    });
  }

  // API Server check
  checks.push({
    name: 'API Server',
    status: 'healthy',
    latency: Date.now() - startTime,
    message: `Uptime: ${Math.floor(process.uptime())}s`,
  });

  return NextResponse.json({
    status: isHealthy ? 'healthy' : 'degraded',
    checks,
  });
}

