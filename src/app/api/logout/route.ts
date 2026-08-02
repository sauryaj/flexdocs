import { NextResponse } from 'next/server';
import { destroySession } from '@/lib/session';

export async function POST() {
  await destroySession();

  const response = NextResponse.json({ message: 'Logged out successfully' });
  response.cookies.set('flexdocs_session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: new Date(0),
    path: '/',
  });
  return response;
}
