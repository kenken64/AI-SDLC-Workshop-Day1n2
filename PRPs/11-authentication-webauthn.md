# PRP 11: Authentication with WebAuthn and Passkeys

## Feature Overview
Implement passwordless authentication using WebAuthn passkeys with secure session cookies and route protection.

## User Stories
- As a user, I can register a passkey and sign in without passwords.
- As a user, I stay logged in with a secure session cookie.
- As a user, protected routes redirect when I am not authenticated.

## User Flow
1. User requests registration options.
2. Client invokes authenticator via `@simplewebauthn/browser`.
3. Client sends registration response for verification.
4. User logs in using assertion flow.
5. Server issues JWT session cookie and middleware protects app routes.

## Technical Requirements

### API Endpoints
- `POST /api/auth/register-options`
- `POST /api/auth/register-verify`
- `POST /api/auth/login-options`
- `POST /api/auth/login-verify`
- `POST /api/auth/logout`

### Security and Validation
- Verify challenge, origin, and RP ID during WebAuthn verification
- Persist authenticators per user
- For authenticator counters, use `authenticator.counter ?? 0`
- Return generic errors that do not leak sensitive details

### Session Management
- Session logic in `lib/auth.ts` with HTTP-only cookies
- JWT expiry target: 7 days
- Middleware protects `/` and `/calendar`

## UI Components
- Registration and login screens for passkey flows
- User feedback for browser support and failure states
- Logout action and authenticated shell state

## Edge Cases
- Browser/device without WebAuthn support
- Counter mismatch or replay attempts
- Multiple authenticators per user account
- Session expiration while using app

## Acceptance Criteria
- New user can register and sign in using passkeys
- Existing user can log in with stored authenticator
- Protected routes block anonymous access
- Auth flows remain compatible with app API session checks

## Testing Requirements

### Unit
- Session token helper tests (create/verify/expire)
- Authenticator mapping and counter fallback tests

### Integration
- Register and login endpoint verification tests
- Middleware auth gate tests for protected routes

### E2E
- Full passkey registration/login/logout with virtual authenticators
- Access control test for protected pages when logged out

## Out of Scope
- Password-based fallback authentication
- Social login providers

## Success Metrics
- High login success rate on supported browsers
- No unauthorized access in automated auth tests
