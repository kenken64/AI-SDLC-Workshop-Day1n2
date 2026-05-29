import { jwtVerify, SignJWT, type JWTPayload } from "jose";
import { cookies } from "next/headers";

const SESSION_COOKIE = "todo_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;

export interface Session extends JWTPayload {
  userId: string;
  username: string;
}

function getJwtSecret(): Uint8Array {
  const fallbackSecret = process.env.NODE_ENV === "production" ? undefined : "dev-jwt-secret-please-change-123456";
  const secret = process.env.JWT_SECRET || fallbackSecret;
  if (!secret || secret.length < 16) {
    throw new Error("JWT_SECRET must be configured and at least 16 characters");
  }
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(session: Session): Promise<string> {
  return await new SignJWT(session)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getJwtSecret());
}

export async function verifySessionToken(token: string): Promise<Session | null> {
  try {
    const result = await jwtVerify(token, getJwtSecret());
    const payload = result.payload as Partial<Session>;
    if (!payload.userId || !payload.username) {
      return null;
    }

    return {
      userId: payload.userId,
      username: payload.username,
    };
  } catch {
    return null;
  }
}

export async function createSession(session: Session): Promise<void> {
  const token = await signSessionToken(session);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  return await verifySessionToken(token);
}

export async function deleteSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
