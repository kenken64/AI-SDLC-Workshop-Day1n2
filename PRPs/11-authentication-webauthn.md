# PRP 11: WebAuthn/Passkeys Authentication

## Feature Overview

Implement passwordless authentication using the WebAuthn standard with passkeys. Users register and log in using biometric authenticators (fingerprint, face ID) or hardware security keys — no passwords involved.

This PRP follows behavior documented in:
- USER_GUIDE section 1 (Authentication)
- copilot-instructions.md (Authentication Flow)
- EVALUATION.md Feature 11 checklist

### Objectives
- Provide secure, passwordless authentication via WebAuthn/Passkeys.
- Manage sessions with HTTP-only JWT cookies (7-day expiry).
- Protect todo routes so each user sees only their own data.
- Redirect unauthenticated users to a login page.
- Support registration and login flows with `@simplewebauthn/server` and `@simplewebauthn/browser`.

### Scope Notes
- This PRP adds auth infrastructure only. Existing CRUD routes gain `user_id` scoping.
- The login page lives at `/login`; protected routes are `/` and `/calendar`.
- WebAuthn challenges are stored in-memory (server restart clears pending challenges).

---

## User Stories

1. As a new user, I can register with a username and my device biometric so I have passwordless access.
2. As a returning user, I can log in with my passkey so I can access my todos securely.
3. As a logged-in user, I can log out so nobody else can use my session.
4. As an unauthenticated visitor, I am redirected to `/login` when trying to access protected pages.
5. As a logged-in user, I see a logout button in the header.

---

## User Flow

### A) Registration
1. User navigates to `/login`.
2. User enters a username and clicks Register.
3. Client calls `POST /api/auth/register-options` → receives challenge.
4. Client invokes `@simplewebauthn/browser` `startRegistration()` with options.
5. Browser shows biometric/security-key prompt.
6. Client posts authenticator response to `POST /api/auth/register-verify`.
7. Server verifies, creates user + authenticator rows, issues JWT session cookie.
8. Client redirects to `/`.

### B) Login
1. User navigates to `/login`.
2. User enters username and clicks Login.
3. Client calls `POST /api/auth/login-options` → receives challenge.
4. Client invokes `startAuthentication()`.
5. Browser shows biometric prompt.
6. Client posts response to `POST /api/auth/login-verify`.
7. Server verifies, issues JWT session cookie.
8. Client redirects to `/`.

### C) Logout
1. User clicks Logout button.
2. Client calls `POST /api/auth/logout`.
3. Server clears session cookie.
4. Client redirects to `/login`.

### D) Route Protection
1. Middleware intercepts requests to `/` and `/calendar`.
2. If no valid session cookie → redirect to `/login`.
3. If valid session → allow request through.

---

## Technical Requirements

### Dependencies
- `@simplewebauthn/server` — server-side WebAuthn verification
- `@simplewebauthn/browser` — client-side WebAuthn ceremony
- `jose` — lightweight JWT creation/verification (edge-compatible)

### Database Tables

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  current_challenge TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS authenticators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  credential_id TEXT NOT NULL UNIQUE,
  credential_public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

Add `user_id` column to `todos` table:
```sql
ALTER TABLE todos ADD COLUMN user_id INTEGER REFERENCES users(id);
```

### Auth Library (`lib/auth.ts`)
- `createSession(userId)` — sign JWT with `jose`, set HTTP-only cookie (7-day expiry).
- `getSession()` — read cookie, verify JWT, return `{ userId, username }` or `null`.
- `deleteSession()` — clear cookie.
- JWT secret from `process.env.JWT_SECRET` with fallback for development.

### API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/auth/register-options` | Generate registration challenge |
| POST | `/api/auth/register-verify` | Verify registration response |
| POST | `/api/auth/login-options` | Generate login challenge |
| POST | `/api/auth/login-verify` | Verify login response |
| POST | `/api/auth/logout` | Clear session cookie |
| GET | `/api/auth/me` | Return current user info (health check) |

### Middleware (`middleware.ts`)
- Runs on `/` and `/calendar` paths.
- Checks for valid `session` cookie.
- Redirects to `/login` if missing/invalid.
- Does NOT run on `/login`, `/api/*`, or static assets.

### WebAuthn Configuration
- `rpName`: "Todo App"
- `rpID`: derived from request hostname (supports localhost and production domains)
- `origin`: derived from request (supports both http://localhost:3000 and production HTTPS)

### Buffer Encoding
- Use `isoBase64URL` from `@simplewebauthn/server/helpers` for credential_id storage.
- Always use `?? 0` for authenticator counter field to handle undefined.

---

## UI Components

### Login Page (`app/login/page.tsx`)
- Username text input.
- Register button — initiates registration flow.
- Login button — initiates login flow.
- Status/error message area.
- Redirect to `/` if already authenticated.

### Logout Button (in main page header)
- Visible when logged in.
- Calls `POST /api/auth/logout` then redirects to `/login`.

---

## Edge Cases

1. User registers with a username that already exists.
2. User attempts login with unregistered username.
3. User cancels biometric prompt mid-ceremony.
4. Session cookie expires after 7 days.
5. Server restarts while a challenge is pending (challenge lost — user retries).
6. Multiple authenticators for one user (e.g. fingerprint + security key).
7. Counter mismatch indicating cloned authenticator.

---

## Acceptance Criteria

1. User can register with username + passkey.
2. User can log in with existing passkey.
3. Session persists for 7 days via HTTP-only cookie.
4. Logout clears cookie and redirects to `/login`.
5. Unauthenticated access to `/` or `/calendar` redirects to `/login`.
6. `/login` redirects authenticated users to `/`.
7. `/api/auth/me` returns current user info or 401.
8. Registration with duplicate username returns clear error.
9. Login with unknown username returns clear error.
10. Existing todo CRUD routes continue to work (user_id scoping is additive).

---

## Testing Requirements

### E2E Tests (with virtual authenticator)
- Register new user with virtual WebAuthn authenticator.
- Login with registered user.
- Logout clears session.
- Protected route redirects when unauthenticated.
- `/login` redirects to `/` when already authenticated.

### Unit Tests
- JWT creation and verification round-trip.
- Session cookie attributes (HTTP-only, path, max-age).

---

## Out of Scope

- Multi-factor authentication beyond WebAuthn.
- Password fallback or email/password registration.
- Account deletion or username change.
- User-to-user data sharing or admin roles.

---

## Success Metrics

1. Registration and login E2E tests pass with virtual authenticator.
2. All protected routes redirect correctly.
3. JWT session survives page reload within expiry window.
4. No plaintext secrets in client-accessible responses.
5. Auth infrastructure does not break existing CRUD functionality.

---

## Implementation Notes for AI Assistants

- Use `jose` (not `jsonwebtoken`) for JWT — it's edge-runtime compatible with Next.js middleware.
- Middleware must be at project root (`middleware.ts`), not inside `app/`.
- `params` is a Promise in Next.js 16 — use `await params` in route handlers.
- All DB operations via `better-sqlite3` are synchronous — no async for queries.
- Store `credential_public_key` as base64url string, not raw Buffer.
- Always apply `?? 0` to authenticator counter to handle undefined values.
