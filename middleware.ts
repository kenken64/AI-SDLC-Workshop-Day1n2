/**
 * middleware.ts — protects '/' and '/calendar' routes.
 *
 * Cannot use next/headers here (middleware runs before the request context is
 * established). Reads the session cookie directly from request.cookies and
 * verifies the JWT inline instead of calling getSession().
 */

import { jwtVerify } from 'jose';
import { NextRequest, NextResponse } from 'next/server';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'change-me-in-production-min-32-chars!!',
);

const PROTECTED = new Set(['/', '/calendar']);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!PROTECTED.has(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get('session')?.value;
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    await jwtVerify(token, JWT_SECRET);
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: ['/', '/calendar'],
};
