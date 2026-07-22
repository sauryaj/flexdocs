import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';

import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();

  if (request.nextUrl.pathname.startsWith('/api/')) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const key = `api:${ip}:${request.nextUrl.pathname}`;

    const { allowed, remaining, resetAt } = await checkRateLimit(key);

    response.headers.set('X-RateLimit-Remaining', String(remaining));
    response.headers.set('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)));

    if (!allowed) {
      return rateLimitResponse(resetAt);
    }
  }

  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  }

  return response;
}

export const config = {
  matcher: ['/api/:path*', '/dashboard/:path*'],
};