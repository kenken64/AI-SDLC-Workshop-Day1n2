import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { userDB, authenticatorDB } from '@/lib/db';
import { createSession } from '@/lib/auth';

function getRpID(request: NextRequest): string {
  const host = request.headers.get('host') || request.nextUrl.host;
  return host.split(':')[0];
}

export async function POST(request: NextRequest) {
  try {
    const body: AuthenticationResponseJSON = await request.json();

    const challenge = request.cookies.get('auth-challenge')?.value;
    const username = request.cookies.get('auth-username')?.value;

    if (!challenge || !username) {
      console.error('[AUTH] Missing cookies - challenge:', !!challenge, 'username:', !!username);
      return NextResponse.json({ error: 'Authentication session expired' }, { status: 400 });
    }

    console.log('[AUTH] Login verification for user:', username);

    const rpID = getRpID(request);
    const user = userDB.findByUsername(username);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get all authenticators for this user
    const userAuthenticators = authenticatorDB.findByUserId(user.id);

    if (userAuthenticators.length === 0) {
      return NextResponse.json({ error: 'No authenticators registered for this user' }, { status: 404 });
    }

    // Try to find matching authenticator by credential ID
    const credentialId = Buffer.from(body.id, 'base64url').toString('base64');
    console.log('[AUTH] Looking for credential:', process.env.NODE_ENV === 'development' ? credentialId : '***');
    console.log('[AUTH] User has', userAuthenticators.length, 'authenticator(s)');

    const authenticator = userAuthenticators.find(a => a.credential_id === credentialId);

    if (!authenticator) {
      // Credential ID might be in different encoding, just use the first authenticator if there's only one
      if (userAuthenticators.length === 1) {
        console.log('[AUTH] Using single authenticator for user');
        const singleAuth = userAuthenticators[0];

        // Get origin from request
        const origin = request.headers.get('origin') || `${request.nextUrl.protocol}//${request.nextUrl.host}`;

        console.log('[AUTH] Verifying authentication with counter:', singleAuth.counter);
        console.log('[AUTH] Expected challenge:', process.env.NODE_ENV === 'development' ? challenge : '***');
        console.log('[AUTH] Expected origin:', origin);
        console.log('[AUTH] Expected RPID:', rpID);

        const verification = await verifyAuthenticationResponse({
          response: body,
          expectedChallenge: challenge,
          expectedOrigin: origin,
          expectedRPID: rpID,
          credential: {
            publicKey: Buffer.from(singleAuth.credential_public_key, 'base64'),
            id: singleAuth.credential_id,
            counter: singleAuth.counter ?? 0,
          },
          requireUserVerification: false,
        });

        console.log('[AUTH] Verification result:', verification.verified);
        console.log('[AUTH] New counter:', verification.authenticationInfo.newCounter);

        if (!verification.verified) {
          console.error('[AUTH] Verification failed');
          return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
        }

        // Update counter
        console.log('[AUTH] Updating counter to:', verification.authenticationInfo.newCounter);
        authenticatorDB.updateCounter(singleAuth.credential_id, verification.authenticationInfo.newCounter);

        // Create session
        await createSession(user.id, user.username);

        // Clear auth cookies
        const response = NextResponse.json({ success: true, user: { id: user.id, username: user.username } });
        response.cookies.delete('auth-challenge');
        response.cookies.delete('auth-username');

        return response;
      } else {
        return NextResponse.json({ error: 'Authenticator not found' }, { status: 404 });
      }
    }

    // Get origin from request
    const origin = request.headers.get('origin') || `${request.nextUrl.protocol}//${request.nextUrl.host}`;

    console.log('[AUTH] Verifying authentication (matched) with counter:', authenticator.counter);
    console.log('[AUTH] Expected challenge:', process.env.NODE_ENV === 'development' ? challenge : '***');
    console.log('[AUTH] Expected origin:', origin);
    console.log('[AUTH] Expected RPID:', rpID);

    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        publicKey: Buffer.from(authenticator.credential_public_key, 'base64'),
        id: authenticator.credential_id,
        counter: authenticator.counter ?? 0,
      },
      requireUserVerification: false,
    });

    console.log('[AUTH] Verification result (matched):', verification.verified);
    console.log('[AUTH] New counter (matched):', verification.authenticationInfo.newCounter);

    if (!verification.verified) {
      console.error('[AUTH] Verification failed (matched)');
      return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
    }

    // Update counter
    console.log('[AUTH] Updating counter to:', verification.authenticationInfo.newCounter);
    authenticatorDB.updateCounter(authenticator.credential_id, verification.authenticationInfo.newCounter);

    // Create session
    await createSession(user.id, user.username);

    // Clear auth cookies
    const response = NextResponse.json({ success: true, user: { id: user.id, username: user.username } });
    response.cookies.delete('auth-challenge');
    response.cookies.delete('auth-username');

    return response;
  } catch (error) {
    console.error('[AUTH] Authentication verification error:', error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
