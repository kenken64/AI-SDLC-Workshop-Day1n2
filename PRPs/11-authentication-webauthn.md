# WebAuthn/Passkeys Authentication

Passwordless registration and login using WebAuthn/passkeys (biometrics, security keys, or platform authenticators), with JWT-backed sessions and route protection middleware.

**Dependencies**: This is foundational infrastructure, not a downstream feature. The `session.userId` produced by `getSession()` here is required by every API route in PRPs 01–10 (`if (!session) return 401`). Per the PRP Index's Implementation Priority, it can be built in parallel with or after the other features — nothing else depends on its UI, but everything else depends on its session primitive existing before those routes can be authorized.

[← PRP Index](./README.md)

## Feature Overview

The app uses WebAuthn (passkeys) as the *only* authentication mechanism — there is no password field anywhere in the schema or UI. Users register with a username and their device's platform authenticator (Touch ID, Face ID, Windows Hello, PIN) or a roaming security key (YubiKey, etc.). Login re-authenticates the same way. A successful registration or login creates a JWT session stored in an HTTP-only cookie with a 7-day expiry. `middleware.ts` protects `/` and `/calendar`, redirecting unauthenticated requests to `/login`.

## User Stories

- **As a new user**, I want to register with just a username and my fingerprint/Face ID, so that I never have to create or remember a password.
- **As a returning user**, I want to log in with the same biometric prompt I used to register, so that access is fast and frictionless.
- **As a security-conscious user**, I want my credentials to never leave my device (no password stored server-side, no shared secret to leak), so that I'm protected even if the server's database is compromised.
- **As a user on a new device**, I want to register an additional passkey (e.g. my phone, after registering on my laptop), so that I'm not locked out of my account if one device is unavailable.
- **As a logged-in user**, I want my session to persist across page reloads and browser restarts for a reasonable period, so that I don't have to re-authenticate constantly.
- **As a user**, I want a visible logout control that immediately ends my session, so that I can secure a shared or public device.

## User Flow

### Registration
1. User navigates to `/login` (or is redirected there from a protected route).
2. User enters a username and clicks **Register**.
3. Client calls `POST /api/auth/register-options` with the username.
4. Server checks the username is not already taken, generates a WebAuthn challenge via `generateRegistrationOptions`, stores the challenge (session/short-lived store keyed by username), and returns the options.
5. Client calls `startRegistration(options)` from `@simplewebauthn/browser`, which prompts the browser's platform authenticator (fingerprint/Face ID/PIN/security key).
6. Browser returns an attestation response; client POSTs it to `POST /api/auth/register-verify`.
7. Server calls `verifyRegistrationResponse`, and on success creates the `users` row and the corresponding `authenticators` row, then calls `createSession(user)`.
8. Server responds 200; client redirects to `/`.

### Login
1. User navigates to `/login`, enters their username, clicks **Login**.
2. Client calls `POST /api/auth/login-options` with the username; server looks up the user's registered authenticator(s), generates an assertion challenge via `generateAuthenticationOptions`, stores it, returns options.
3. Client calls `startAuthentication(options)`, prompting the same biometric/security-key flow.
4. Client POSTs the assertion response to `POST /api/auth/login-verify`.
5. Server looks up the authenticator by `credential_id`, calls `verifyAuthenticationResponse`, updates the authenticator's `counter`, calls `createSession(user)`.
6. Server responds 200; client redirects to `/`.

### Session & Logout
1. On every page load of `/` or `/calendar`, `middleware.ts` checks for a valid session cookie; if missing/invalid, redirects to `/login`.
2. `/login` itself checks `GET /api/auth/me`; if already authenticated, redirects to `/`.
3. User clicks **Logout** (top-right corner) → `POST /api/auth/logout` clears the cookie → redirect to `/login`.

## Technical Requirements

### Database Schema

This PRP owns the `users` and `authenticators` tables:

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE authenticators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT UNIQUE NOT NULL,
  credential_public_key BLOB NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_authenticators_user_id ON authenticators(user_id);
```

A user may have multiple rows in `authenticators` (one per registered device) — this is a one-to-many relationship, not one-to-one.

### Types

```typescript
export interface User {
  id: number;
  username: string;
  created_at: string;
}

export interface Authenticator {
  id: number;
  user_id: number;
  credential_id: string;
  credential_public_key: Buffer;
  counter: number;
  created_at: string;
}

export interface Session {
  userId: number;
  username: string;
}
```

### `lib/auth.ts`

```typescript
export async function createSession(user: User): Promise<void>;
// Signs a JWT { userId, username }, sets it as an HTTP-only, SameSite=Lax,
// Secure-in-production cookie with a 7-day expiry.

export async function getSession(): Promise<Session | null>;
// Reads the session cookie, verifies the JWT, returns the decoded session
// or null if absent/invalid/expired. Called first in every protected API route.

export async function deleteSession(): Promise<void>;
// Clears the session cookie immediately (logout).
```

### API Endpoints

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/auth/register-options` | Generate a WebAuthn registration challenge for a username |
| POST | `/api/auth/register-verify` | Verify the registration attestation, create `users`/`authenticators` rows, create session |
| POST | `/api/auth/login-options` | Generate a WebAuthn authentication challenge for a username |
| POST | `/api/auth/login-verify` | Verify the authentication assertion, update `counter`, create session |
| POST | `/api/auth/logout` | Clear the session cookie |
| GET | `/api/auth/me` | Return the current session's user, or 401 |

### WebAuthn Flow (4 steps, applies to both register and login)

1. Client requests options from the server (`*-options` endpoint) → server generates and persists a random challenge.
2. Client hands the options to `@simplewebauthn/browser`'s `startRegistration()`/`startAuthentication()`, which drives the platform authenticator UI.
3. Client POSTs the browser's response to the `*-verify` endpoint.
4. Server verifies the response against the stored challenge using `@simplewebauthn/server`, persists/updates the authenticator, and establishes a session.

```typescript
// app/api/auth/register-options/route.ts
export async function POST(request: NextRequest) {
  const { username } = await request.json();
  if (userDB.findByUsername(username)) {
    return NextResponse.json({ error: 'Username already taken' }, { status: 409 });
  }
  const options = await generateRegistrationOptions({
    rpName: process.env.RP_NAME!,
    rpID: process.env.RP_ID!,
    userName: username,
    attestationType: 'none',
  });
  await challengeStore.save(username, options.challenge);
  return NextResponse.json(options);
}
```

```typescript
// app/api/auth/login-verify/route.ts
export async function POST(request: NextRequest) {
  const { username, response } = await request.json();
  const authenticator = authenticatorDB.findByCredentialId(response.id);
  if (!authenticator) {
    return NextResponse.json({ error: 'Authenticator not recognized' }, { status: 401 });
  }

  const expectedChallenge = await challengeStore.get(username);
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: process.env.RP_ORIGIN!,
    expectedRPID: process.env.RP_ID!,
    authenticator: {
      credentialID: isoBase64URL.toBuffer(authenticator.credential_id),
      credentialPublicKey: authenticator.credential_public_key,
      // Always coalesce — counter can be undefined on some authenticator records.
      counter: authenticator.counter ?? 0,
    },
  });

  if (!verification.verified) {
    return NextResponse.json({ error: 'Verification failed' }, { status: 401 });
  }

  authenticatorDB.updateCounter(authenticator.id, verification.authenticationInfo.newCounter ?? 0);
  const user = userDB.findById(authenticator.user_id);
  await createSession(user);
  return NextResponse.json({ success: true });
}
```

**Critical pitfall — `counter ?? 0`:** `authenticator.counter` can come back `undefined` from the database layer or from a fresh authenticator record. Every place `counter` is read — building the `verifyAuthenticationResponse` argument, computing the new counter, storing it — must use `?? 0`. This was a real bug previously fixed at two call sites in `app/api/auth/login-verify/route.ts`. Never assume `counter` is a number without the guard.

**Buffer/encoding requirement:** `credential_id` is stored as text but WebAuthn APIs operate on buffers with base64url encoding. Use `isoBase64URL` from `@simplewebauthn/server/helpers` for all conversions between the stored string form and the buffer form the verification functions expect. Mixing base64 and base64url encodings is a common source of "authenticator not recognized" bugs.

### Route Protection (`middleware.ts`)

```typescript
export async function middleware(request: NextRequest) {
  const protectedPaths = ['/', '/calendar'];
  if (protectedPaths.includes(request.nextUrl.pathname)) {
    const session = await getSession();
    if (!session) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/calendar'],
};
```

Every other feature's API routes follow the same first-line pattern:

```typescript
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  // use session.userId for all DB queries
}
```

## UI Components

### `/login` page

```tsx
'use client';
import { useState } from 'react';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleRegister() {
    setError(null);
    const optionsRes = await fetch('/api/auth/register-options', {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
    if (!optionsRes.ok) return setError((await optionsRes.json()).error);
    const options = await optionsRes.json();

    const attestation = await startRegistration(options);

    const verifyRes = await fetch('/api/auth/register-verify', {
      method: 'POST',
      body: JSON.stringify({ username, response: attestation }),
    });
    if (!verifyRes.ok) return setError((await verifyRes.json()).error);
    router.push('/');
  }

  async function handleLogin() {
    setError(null);
    const optionsRes = await fetch('/api/auth/login-options', {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
    if (!optionsRes.ok) return setError((await optionsRes.json()).error);
    const options = await optionsRes.json();

    const assertion = await startAuthentication(options);

    const verifyRes = await fetch('/api/auth/login-verify', {
      method: 'POST',
      body: JSON.stringify({ username, response: assertion }),
    });
    if (!verifyRes.ok) return setError((await verifyRes.json()).error);
    router.push('/');
  }

  return (
    <div>
      <input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Username"
      />
      {error && <p role="alert">{error}</p>}
      <button onClick={handleRegister}>Register</button>
      <button onClick={handleLogin}>Login</button>
    </div>
  );
}
```

### Logout button

```tsx
async function handleLogout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  router.push('/login');
}
// Rendered top-right of the main app layout, visible on all authenticated pages.
```

## Edge Cases

- **Username already taken on register** → `register-options` returns 409 before a challenge is even generated.
- **Login with unregistered username** → `login-options` returns 404/400 rather than leaking whether other usernames exist (avoid confirming valid usernames where practical).
- **No authenticator found for a `credential_id` on login-verify** → 401, generic "Authenticator not recognized" message.
- **Authenticator counter regression** — `verifyAuthenticationResponse` rejects if the assertion's counter is not greater than the stored counter (a classic sign of a cloned authenticator), *except* when both are 0, since some authenticators (e.g. certain platform authenticators) never increment the counter and always report 0.
- **`counter` is `undefined`** on a freshly-read authenticator row — always guard with `?? 0` (see Technical Requirements).
- **JWT cookie expired or tampered** — `getSession()` must fail closed (return `null`), never throw uncaught, so middleware and API routes correctly treat it as unauthenticated.
- **Browser/device does not support WebAuthn** — `startRegistration`/`startAuthentication` throw; catch and show a clear "your browser/device doesn't support passkeys" message rather than a raw exception.
- **User cancels the biometric/security-key prompt** — the promise from `startRegistration`/`startAuthentication` rejects (`NotAllowedError`); treat as a cancellation, not an error, and let the user retry without wiping their typed username.
- **Multiple authenticators per user** — a user registering a second device (e.g. phone after laptop) creates a second `authenticators` row for the same `user_id`; login must succeed with *any* of the user's registered authenticators, and `login-options` should include all of the user's `credential_id`s as `allowCredentials`.
- **Challenge replay/expiry** — a stored registration/login challenge must be single-use and short-lived; reject verification attempts against an already-consumed or expired challenge.
- **Race between register and route protection** — a user completing registration must have `createSession` succeed *before* the client redirects to `/`, or middleware will bounce them back to `/login`.

## Acceptance Criteria

- [ ] Registration creates a `users` row and at least one `authenticators` row on success
- [ ] Registration rejects duplicate usernames with a 409 before generating a challenge
- [ ] Login succeeds only with a previously-registered authenticator for that username
- [ ] Login updates the authenticator's `counter` on every successful assertion
- [ ] `counter` is never read or written without a `?? 0` fallback anywhere in the auth code path
- [ ] A successful register or login sets an HTTP-only session cookie with a 7-day expiry
- [ ] `GET /api/auth/me` returns the current user when authenticated, 401 otherwise
- [ ] `POST /api/auth/logout` clears the session cookie and subsequent requests are treated as unauthenticated
- [ ] `middleware.ts` redirects unauthenticated requests to `/` and `/calendar` to `/login`
- [ ] `/login` redirects an already-authenticated user to `/`
- [ ] A user can register a second authenticator (second device) and log in with either
- [ ] Session persists across a full page reload and a browser restart within the 7-day window

## Testing Requirements

Test file: `tests/01-authentication.spec.ts` (first in the suite — every other feature's tests depend on being able to authenticate first, so this file must be green before other suites are meaningful). Playwright is configured with **virtual WebAuthn authenticators** via Chromium DevTools Protocol flags in `playwright.config.ts`, and `timezoneId: 'Asia/Singapore'` set globally.

**E2E tests:**
- [ ] Register a new user with a virtual authenticator, verify redirect to `/`
- [ ] Register with a username that already exists, verify error message shown, no navigation
- [ ] Login with a previously-registered virtual authenticator, verify redirect to `/`
- [ ] Login with an unregistered username, verify error shown
- [ ] Logout, verify redirect to `/login` and that navigating back to `/` redirects to `/login` again
- [ ] Reload the page after login, verify session persists (still on `/`, not bounced to `/login`)
- [ ] Navigate directly to `/calendar` while unauthenticated, verify redirect to `/login`
- [ ] Navigate to `/login` while already authenticated, verify redirect to `/`
- [ ] Register a second authenticator for the same username, verify login succeeds with either

**Unit tests:**
- [ ] `createSession`/`getSession`/`deleteSession` round-trip (create → read back matches → delete → read returns null)
- [ ] JWT verification rejects a tampered token
- [ ] JWT verification rejects an expired token
- [ ] Counter-regression check rejects a replayed assertion with a stale (non-zero, non-incrementing) counter
- [ ] Counter comparison logic correctly allows repeated `0` counters (authenticators that don't support counting)

## Out of Scope

- Password-based login as a fallback or alternative to passkeys
- Social/OAuth login (Google, GitHub, etc.)
- Multi-factor authentication beyond the passkey itself
- Account recovery when a user loses their only registered passkey — this is a real, currently-unaddressed gap (no recovery codes, no email-based reset) and should be flagged to stakeholders rather than silently assumed solved
- Email verification or email-based communication of any kind
- Admin/user-management UI (listing, disabling, or deleting other users' accounts)
- Rate limiting / brute-force protection on the auth endpoints (tracked separately under the project's Security Guidelines, not this PRP)

## Success Metrics

- Registration and login flows each complete in under 5 seconds end-to-end, including the biometric/security-key prompt
- Zero session-fixation or replay vulnerabilities in security review (counter-regression check verified effective)
- 7-day session expiry is enforced consistently — no session observed valid past 7 days, no session invalidated early
- 100% of protected-route API requests without a valid session return 401, with no data leakage in the response body
- Users can register and authenticate from at least two different device/authenticator combinations without errors
