import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';

import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

const SECURITY_HEADERS: Record<string, string> = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com data:; " +
    "img-src 'self' data: blob:; " +
    "connect-src 'self'; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'; " +
    "object-src 'none';",
};

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();

  if (request.nextUrl.pathname.startsWith('/api/')) {
    // Auth endpoints have their own dedicated rate limits + account lockout,
    // so skip the generic limiter to avoid double-limiting legitimate logins.
    const isAuthEndpoint = ['/api/login', '/api/login/verify-mfa', '/api/register'].some(
      (p) => request.nextUrl.pathname === p || request.nextUrl.pathname.startsWith(`${p}/`)
    );

    if (!isAuthEndpoint) {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      const key = `api:${ip}:${request.nextUrl.pathname}`;

      // Reads are cheap and happen constantly from live dashboards (sidebar,
      // notification bell, SSE reconnects) — allow ~0.5 rps sustained per path.
      // Writes stay far stricter.
      const limit = request.method === 'GET' || request.method === 'HEAD' ? 400 : 60;
      const { allowed, remaining, resetAt } = await checkRateLimit(key, limit);

      response.headers.set('X-RateLimit-Limit', String(limit));
      response.headers.set('X-RateLimit-Remaining', String(remaining));
      response.headers.set('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)));

      if (!allowed) {
        return rateLimitResponse(resetAt);
      }
    }
  }

  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    const sessionCookie = request.cookies.get('flexdocs_session')?.value;
    if (!sessionCookie) {
      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Apply security headers to all pages and API responses
  Object.entries(SECURITY_HEADERS).forEach(([name, value]) => {
    response.headers.set(name, value);
  });

  // HSTS only when served over HTTPS (behind proxy)
  const proto = request.headers.get('x-forwarded-proto') || request.nextUrl.protocol;
  if (proto === 'https') {
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  }

  return response;
}

export const config = {
  matcher: ['/api/:path*', '/dashboard/:path*'],
};