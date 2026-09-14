import { NextResponse } from 'next/server';
import { ADMIN_COOKIE, checkPassword, sessionValue } from '@/lib/admin';
import { clientIp, tooManyRequests } from '@/lib/rate-limit';
import { clean } from '@/lib/validation';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (tooManyRequests(`admin:${clientIp(request.headers)}`)) {
    return NextResponse.redirect(new URL('/admin?error=rate', request.url), 303);
  }

  const form = await request.formData();
  const candidate = clean(form.get('password'), 200);

  if (!checkPassword(candidate)) {
    return NextResponse.redirect(new URL('/admin?error=1', request.url), 303);
  }

  const response = NextResponse.redirect(new URL('/admin', request.url), 303);
  response.cookies.set(ADMIN_COOKIE, sessionValue(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 8,
  });
  return response;
}
