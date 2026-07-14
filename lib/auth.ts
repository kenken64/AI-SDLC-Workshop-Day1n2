/**
 * lib/auth.ts — JWT session helpers for API routes and server components.
 *
 * Uses `next/headers` cookies() — valid in Route Handlers and Server Components only.
 * Middleware does its own JWT check directly on request.cookies (see middleware.ts).
 */

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import type { User, Session } from './db';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'change-me-in-production-min-32-chars!!',
);
const COOKIE_NAME = 'session';

/**
 * Creates a signed JWT and writes it as an HTTP-only session cookie.
 * Call this after a successful WebAuthn registration or login verification.
 */
export async function createSession(user: User): Promise<void> {
  const token = await new SignJWT({ userId: user.id, username: user.username })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET);

  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days in seconds
    path: '/',
  });
}

/**
 * Reads and verifies the session cookie. Returns the decoded session or null.
 * Fails closed — any error returns null so the caller treats the request as unauthenticated.
 */
export async function getSession(): Promise<Session | null> {
  try {
    const jar = await cookies();
    const token = jar.get(COOKIE_NAME)?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, JWT_SECRET);
    return {
      userId: payload.userId as number,
      username: payload.username as string,
    };
  } catch {
    return null;
  }
}

/**
 * Deletes the session cookie immediately (logout).
 */
export async function deleteSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}
