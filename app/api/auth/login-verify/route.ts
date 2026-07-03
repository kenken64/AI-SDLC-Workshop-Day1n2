import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { userDB, authenticatorDB } from '@/lib/db';
import { loginChallenges } from '@/lib/challenges';
import { createSession, setSessionCookie } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, response } = body;
    if (!username || !response) {
      return NextResponse.json({ error: 'Missing username or response' }, { status: 400 });
    }
    const cleanUsername = username.trim().toLowerCase();

    const user = userDB.findByUsername(cleanUsername);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const cookieStore = await cookies();
    const expectedChallenge = cookieStore.get(`lc_${cleanUsername}`)?.value;
    if (!expectedChallenge) {
      return NextResponse.json({ error: 'No challenge found. Start login again.' }, { status: 400 });
    }

    const authenticator = authenticatorDB.findByCredentialId(
      Buffer.from(response.id, 'base64url').toString('base64url')
    ) ?? authenticatorDB.findByUserId(user.id)[0];

    if (!authenticator) {
      return NextResponse.json({ error: 'Authenticator not found' }, { status: 400 });
    }

    const host = request.headers.get('host') ?? 'localhost';
    const rpID = host.split(':')[0];
    const proto = request.headers.get('x-forwarded-proto') ?? 'http';
    const expectedOrigin = `${proto}://${host}`;

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: false,
      credential: {
        id: authenticator.credential_id,
        publicKey: new Uint8Array(authenticator.credential_public_key),
        counter: authenticator.counter ?? 0,
        transports: authenticator.transports ? JSON.parse(authenticator.transports) : undefined,
      },
    });

    if (!verification.verified) {
      return NextResponse.json({ error: 'Authentication verification failed' }, { status: 400 });
    }

    // Clear the challenge cookie
    cookieStore.delete(`lc_${cleanUsername}`);
    authenticatorDB.updateCounter(
      authenticator.credential_id,
      verification.authenticationInfo.newCounter ?? 0
    );

    const token = await createSession({ userId: user.id, username: user.username });
    await setSessionCookie(token);

    return NextResponse.json({ success: true, username: user.username });
  } catch (error) {
    console.error('login-verify error:', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
