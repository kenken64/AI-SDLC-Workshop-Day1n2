import { NextRequest, NextResponse } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { userDB, authenticatorDB } from '@/lib/db';
import { createSession, setSessionCookie } from '@/lib/auth';
import { registrationChallenges } from '@/lib/challenges';

export async function POST(request: NextRequest) {
  try {
    const { username, response } = await request.json();

    if (!username || !response) {
      return NextResponse.json({ error: 'Missing username or response' }, { status: 400 });
    }

    const trimmed = username.trim().toLowerCase();
    const expectedChallenge = registrationChallenges.get(trimmed);

    if (!expectedChallenge) {
      return NextResponse.json({ error: 'No challenge found. Start registration again.' }, { status: 400 });
    }

    const rpID = request.headers.get('host')?.split(':')[0] ?? 'localhost';

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: `${request.headers.get('x-forwarded-proto') ?? 'http'}://${request.headers.get('host')}`,
      expectedRPID: rpID,
    });

    registrationChallenges.delete(trimmed);

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: 'Registration verification failed' }, { status: 400 });
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    void credentialDeviceType;
    void credentialBackedUp;

    let user = userDB.findByUsername(trimmed);
    if (!user) {
      user = userDB.create(trimmed);
    }

    authenticatorDB.create({
      userId: user.id,
      credentialId: Buffer.from(credential.id).toString('base64url'),
      credentialPublicKey: Buffer.from(credential.publicKey),
      counter: credential.counter ?? 0,
      transports: credential.transports ? JSON.stringify(credential.transports) : undefined,
    });

    const token = await createSession({ userId: user.id, username: user.username });
    const jsonResponse = NextResponse.json({ verified: true, username: user.username });
    await setSessionCookie(token);

    return jsonResponse;
  } catch (error) {
    console.error('register-verify error:', error);
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
