import { NextRequest, NextResponse } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { userDB, authenticatorDB } from '@/lib/db';
import { registrationChallenges } from '@/lib/challenges';
import { createSession, setSessionCookie } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, response } = body;
    if (!username || !response) {
      return NextResponse.json({ error: 'Missing username or response' }, { status: 400 });
    }
    const cleanUsername = username.trim().toLowerCase();

    const expectedChallenge = registrationChallenges.get(cleanUsername);
    if (!expectedChallenge) {
      return NextResponse.json({ error: 'No challenge found. Start registration again.' }, { status: 400 });
    }

    const host = request.headers.get('host') ?? 'localhost';
    const rpID = host.split(':')[0];
    const proto = request.headers.get('x-forwarded-proto') ?? 'http';
    const expectedOrigin = `${proto}://${host}`;

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: 'Registration verification failed' }, { status: 400 });
    }

    registrationChallenges.delete(cleanUsername);

    const { credential } = verification.registrationInfo;
    const user = userDB.findByUsername(cleanUsername)!;

    authenticatorDB.create({
      userId: user.id,
      credentialId: Buffer.from(credential.id).toString('base64url'),
      credentialPublicKey: Buffer.from(credential.publicKey),
      counter: credential.counter ?? 0,
      transports: credential.transports ? JSON.stringify(credential.transports) : undefined,
    });

    const token = await createSession({ userId: user.id, username: user.username });
    await setSessionCookie(token);

    return NextResponse.json({ success: true, username: user.username });
  } catch (error) {
    console.error('register-verify error:', error);
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
