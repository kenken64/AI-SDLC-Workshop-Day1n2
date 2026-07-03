import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { userDB, authenticatorDB } from '@/lib/db';
import { createSession, setSessionCookie } from '@/lib/auth';
import { loginChallenges } from '@/lib/challenges';

export async function POST(request: NextRequest) {
  try {
    const { username, response } = await request.json();

    if (!username || !response) {
      return NextResponse.json({ error: 'Missing username or response' }, { status: 400 });
    }

    const trimmed = username.trim().toLowerCase();
    const expectedChallenge = loginChallenges.get(trimmed);

    if (!expectedChallenge) {
      return NextResponse.json({ error: 'No challenge found. Start login again.' }, { status: 400 });
    }

    const user = userDB.findByUsername(trimmed);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // response.id is already a base64url string from the browser
    const credentialId = response.id as string;

    const authenticator = authenticatorDB.findByCredentialId(credentialId);
    if (!authenticator) {
      return NextResponse.json({ error: 'Authenticator not found' }, { status: 400 });
    }

    const rpID = request.headers.get('host')?.split(':')[0] ?? 'localhost';

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: `${request.headers.get('x-forwarded-proto') ?? 'http'}://${request.headers.get('host')}`,
      expectedRPID: rpID,
      requireUserVerification: false,
      credential: {
        id: authenticator.credential_id,
        publicKey: new Uint8Array(authenticator.credential_public_key),
        counter: authenticator.counter ?? 0,
        transports: authenticator.transports
          ? (JSON.parse(authenticator.transports) as AuthenticatorTransport[])
          : undefined,
      },
    });

    loginChallenges.delete(trimmed);

    if (!verification.verified) {
      return NextResponse.json({ error: 'Authentication verification failed' }, { status: 400 });
    }

    authenticatorDB.updateCounter(
      authenticator.credential_id,
      verification.authenticationInfo.newCounter ?? 0
    );

    const token = await createSession({ userId: user.id, username: user.username });
    const jsonResponse = NextResponse.json({ verified: true, username: user.username });
    await setSessionCookie(token);

    return jsonResponse;
  } catch (error) {
    console.error('login-verify error:', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
