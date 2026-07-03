# PRP 11 — WebAuthn / Passkeys Authentication

## Feature Overview

The app uses **WebAuthn/Passkeys** for passwordless authentication. Users register a passkey (fingerprint, Face ID, security key) tied to a username. On login, the authenticator verifies identity. Sessions are managed as JWT tokens stored in HTTP-only cookies (7-day expiry). The `/` and `/calendar` routes are protected by middleware that redirects unauthenticated users to `/login`.

---

## User Stories

| Persona | Story | Acceptance Criteria |
|---------|-------|---------------------|
| Security-minded user | As a user, I want to authenticate with my fingerprint instead of a password | WebAuthn registration and login via biometric |
| New user | As a user, I want to register by entering a username and using my device's authenticator | Registration creates account and passkey in one step |
| Returning user | As a user, I want to log in by selecting my username and authenticating | Login succeeds after passkey verification |
| Session user | As a user, I want to stay logged in for 7 days without re-authenticating | JWT cookie persists for 7 days |
| Logout user | As a user, I want to log out and clear my session | Logout clears cookie and redirects to /login |
| Multi-device user | As a user, I want to register additional passkeys on other devices | Multiple authenticators per user supported |

---

## User Flow

### Registration
1. User opens `/login`
2. Enters a username (lowercase, trimmed)
3. Clicks **✨ Register**
4. Browser calls `/api/auth/register-options` → gets challenge + options
5. `startRegistration({ optionsJSON })` triggers browser's built-in passkey UI
6. User completes biometric / PIN
7. Browser returns credential response
8. App calls `/api/auth/register-verify` with response
9. Server verifies, creates `users` + `authenticators` rows, sets JWT cookie
10. User redirected to `/`

### Login
1. User opens `/login`
2. Enters existing username
3. Clicks **🔑 Login**
4. Browser calls `/api/auth/login-options` → gets challenge
5. `startAuthentication({ optionsJSON })` prompts for passkey
6. User authenticates
7. App calls `/api/auth/login-verify`
8. Server verifies, updates counter, sets JWT cookie
9. User redirected to `/`

### Logout
1. User clicks **Logout** button
2. Client calls `POST /api/auth/logout`
3. Cookie cleared; user redirected to `/login`

### Session Expiry
1. User visits a protected route with expired JWT
2. Middleware detects invalid token, clears cookie, redirects to `/login`

---

## Technical Requirements

### Database Schema (`lib/db.ts`)

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS authenticators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT UNIQUE NOT NULL,    -- base64url encoded
  credential_public_key BLOB NOT NULL,   -- raw binary
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT,                       -- JSON array string
  created_at TEXT DEFAULT (datetime('now'))
);
```

### TypeScript Interfaces

```typescript
export interface User {
  id: number;
  username: string;
  created_at: string;
}

export interface Authenticator {
  id: number;
  user_id: number;
  credential_id: string;       // base64url
  credential_public_key: Buffer;
  counter: number;
  transports: string | null;   // JSON string
  created_at: string;
}
```

### DB Operations (`lib/db.ts`)

```typescript
export const userDB = {
  findByUsername(username: string): User | undefined,
  findById(id: number): User | undefined,
  create(username: string): User,
};

export const authenticatorDB = {
  findByCredentialId(credentialId: string): Authenticator | undefined,
  findByUserId(userId: number): Authenticator[],
  create(data: {
    userId: number;
    credentialId: string;
    credentialPublicKey: Buffer;
    counter: number;
    transports?: string;
  }): void,
  updateCounter(credentialId: string, counter: number): void,
};
```

### In-Memory Challenge Store (`lib/challenges.ts`)

```typescript
// Acceptable for single-instance dev; replace with Redis for multi-instance prod
export const registrationChallenges = new Map<string, string>();
export const loginChallenges = new Map<string, string>();
```

### Session Management (`lib/auth.ts`)

```typescript
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'token';

export interface SessionPayload {
  userId: number;
  username: string;
}

export async function createSession(payload: SessionPayload): Promise<string>
export async function verifySession(token: string): Promise<SessionPayload | null>
export async function getSession(): Promise<SessionPayload | null>
export async function setSessionCookie(token: string): Promise<void>
export async function clearSessionCookie(): Promise<void>
```

Cookie settings:
```typescript
{
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 7,  // 7 days
  path: '/',
}
```

### Environment Variable

```bash
JWT_SECRET=<random 32+ char string>
```

**Never commit `.env.local`.** Provide `.env.local.example`:
```bash
JWT_SECRET=change-me-to-a-long-random-secret
```

### Middleware (`middleware.ts`)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';

const PROTECTED_PATHS = ['/', '/calendar'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PATHS.some(
    p => pathname === p || pathname.startsWith(p + '/')
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
```

### Registration Options Route (`app/api/auth/register-options/route.ts`)

Key parameters:
```typescript
const options = await generateRegistrationOptions({
  rpName: 'Todo App',
  rpID: request.headers.get('host')?.split(':')[0] ?? 'localhost',
  userName: username,
  userDisplayName: username,
  attestationType: 'none',
  excludeCredentials: existingAuthenticators.map(a => ({
    id: a.credential_id,
    transports: a.transports ? JSON.parse(a.transports) : undefined,
  })),
  authenticatorSelection: {
    residentKey: 'preferred',
    userVerification: 'preferred',
  },
});
```

### Registration Verify Route (`app/api/auth/register-verify/route.ts`)

```typescript
const verification = await verifyRegistrationResponse({
  response,
  expectedChallenge,
  expectedOrigin: `${proto}://${host}`,
  expectedRPID: rpID,
  requireUserVerification: false,  // 'preferred' — not required
});

// Store credential
authenticatorDB.create({
  userId: user.id,
  credentialId: Buffer.from(credential.id).toString('base64url'),
  credentialPublicKey: Buffer.from(credential.publicKey),
  counter: credential.counter ?? 0,
  transports: credential.transports ? JSON.stringify(credential.transports) : undefined,
});
```

### Login Options Route (`app/api/auth/login-options/route.ts`)

```typescript
const options = await generateAuthenticationOptions({
  rpID,
  allowCredentials: authenticators.map(a => ({
    id: a.credential_id,
    transports: a.transports ? JSON.parse(a.transports) : undefined,
  })),
  userVerification: 'preferred',
});
```

### Login Verify Route (`app/api/auth/login-verify/route.ts`)

```typescript
const verification = await verifyAuthenticationResponse({
  response,
  expectedChallenge,
  expectedOrigin: `${proto}://${host}`,
  expectedRPID: rpID,
  requireUserVerification: false,
  credential: {
    id: authenticator.credential_id,
    publicKey: new Uint8Array(authenticator.credential_public_key),
    counter: authenticator.counter ?? 0,     // ALWAYS use ?? 0
    transports: authenticator.transports
      ? JSON.parse(authenticator.transports)
      : undefined,
  },
});

// Update counter
authenticatorDB.updateCounter(
  authenticator.credential_id,
  verification.authenticationInfo.newCounter ?? 0  // ALWAYS use ?? 0
);
```

**Critical:** Always use `?? 0` for counter fields to handle undefined — see `.github/copilot-instructions.md`.

---

## UI Components

### Login Page (`app/login/page.tsx`)

```tsx
'use client';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { useRouter } from 'next/navigation';

// State: username, error, loading ('register' | 'login' | null)
// Buttons: "🔑 Login" (blue) | "✨ Register" (green)
// Error: inline red text block
// Footer: "Uses WebAuthn/Passkeys — no passwords required"
```

### Route Protection

The `/login` page should redirect authenticated users to `/`:

```typescript
// app/login/page.tsx — server component check (optional)
// Or rely on middleware: if user is already logged in,
// accessing / doesn't redirect them away.
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Username not found on login | Return `404 { error: 'User not found' }` |
| No challenge found on verify | Return `400 { error: 'No challenge found. Start registration again.' }` |
| Authenticator not found on login | Return `400 { error: 'Authenticator not found' }` |
| WebAuthn not supported by browser | `startRegistration` throws; catch and show error |
| User cancels passkey prompt | `startRegistration` throws `AbortError`; show "Registration cancelled" |
| Duplicate credential (re-register) | `excludeCredentials` prevents re-registering same authenticator |
| Expired JWT cookie | Middleware deletes cookie and redirects to `/login` |
| `JWT_SECRET` not set | `createSession` throws at startup; server logs error |
| counter undefined | Use `?? 0` everywhere counter is read from DB |

---

## Acceptance Criteria

- [ ] `/login` page has username input, Register button, Login button
- [ ] Registering with a new username creates user + authenticator + JWT session
- [ ] Logging in with existing username authenticates via passkey + sets JWT
- [ ] After auth, user redirected to `/`
- [ ] JWT cookie is HTTP-only, 7-day expiry
- [ ] Middleware redirects unauthenticated requests on `/` and `/calendar` to `/login`
- [ ] Expired/invalid JWT cleared from cookie and user redirected to `/login`
- [ ] Logout clears cookie and redirects to `/login`
- [ ] Error messages shown for: user not found, no challenge, cancelled
- [ ] Counter updated in DB after successful login
- [ ] `requireUserVerification: false` set in both verify routes

---

## Testing Requirements

### Playwright Config (`playwright.config.ts`)

```typescript
// Virtual WebAuthn authenticator
use: {
  launchOptions: {
    args: [
      '--enable-features=WebAuthenticationVirtualAuthenticators',
    ],
  },
  timezoneId: 'Asia/Singapore',
}
```

### E2E Tests (`tests/01-authentication.spec.ts`)

```typescript
test.beforeEach(async ({ page }) => {
  // Add virtual authenticator
  const cdpSession = await page.context().newCDPSession(page);
  await cdpSession.send('WebAuthn.enable');
  await cdpSession.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'usb',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
    },
  });
});

test('user can register with passkey', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[placeholder="Enter your username"]', 'testuser');
  await page.getByRole('button', { name: 'Register' }).click();
  await page.waitForURL('/');
  await expect(page).toHaveURL('/');
});

test('user can login after registering', async ({ page }) => {
  // Register first
  await helpers.register(page, 'logintest');
  // Logout
  await page.getByRole('button', { name: 'Logout' }).click();
  await page.waitForURL('/login');
  // Login
  await page.fill('[placeholder="Enter your username"]', 'logintest');
  await page.getByRole('button', { name: 'Login' }).click();
  await page.waitForURL('/');
  await expect(page).toHaveURL('/');
});

test('unauthenticated user redirected to /login', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL('/login');
});

test('logout clears session', async ({ page }) => {
  await helpers.register(page, 'logouttest');
  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL('/login');
  await page.goto('/');
  await expect(page).toHaveURL('/login');
});
```

---

## Out of Scope

- Traditional username/password fallback
- Email-based magic links
- OAuth / social login (Google, GitHub)
- Account deletion
- Username change
- Multiple accounts on the same device (managed by OS passkey store)
- Admin / role-based access

---

## Success Metrics

- Registration and login each complete in < 3s (including user interaction)
- JWT validation adds < 5ms to each protected request
- Zero unauthenticated API responses return user data
- Counter updated correctly on every successful authentication
