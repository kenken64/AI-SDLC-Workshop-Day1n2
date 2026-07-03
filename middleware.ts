import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';

const PROTECTED_PATHS = ['/', '/calendar'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PATHS.some(
    p => pathname === p || (p !== '/' && pathname.startsWith(p + '/'))
  );
  if (!isProtected) return NextResponse.next();

  const token = request.cookies.get('token')?.value;
  if (!token) return NextResponse.redirect(new URL('/login', request.url));

  const session = await verifySession(token);
  if (!session) {
    const res = NextResponse.redirect(new URL('/login', request.url));
    res.cookies.delete('token');
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/calendar', '/calendar/:path*'],
};
