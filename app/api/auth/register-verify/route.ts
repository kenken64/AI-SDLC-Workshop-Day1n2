import { NextRequest, NextResponse } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import { userDB, authenticatorDB } from '@/lib/db';
import { createSession } from '@/lib/auth';

function getRpID(request: NextRequest): string {
  const host = request.headers.get('host') || request.nextUrl.host;
  return host.split(':')[0];
}

export async function POST(request: NextRequest) {
  try {
    const body: RegistrationResponseJSON = await request.json();

    const challenge = request.cookies.get('reg-challenge')?.value;
    const username = request.cookies.get('reg-username')?.value;

    if (!challenge || !username) {
      console.error('[AUTH] Registration missing cookies - challenge:', !!challenge, 'username:', !!username);
      return NextResponse.json({ error: 'Registration session expired' }, { status: 400 });
    }

    console.log('[AUTH] Registration for user:', username);

    // Derive RP ID and origin from request to match the browser's domain
    const rpID = getRpID(request);
    const origin = request.headers.get('origin') || `${request.nextUrl.protocol}//${request.nextUrl.host}`;

    console.log('[AUTH] Registration origin:', origin);
    console.log('[AUTH] Registration RPID:', rpID);

    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });

    console.log('[AUTH] Registration verification result:', verification.verified);

    if (!verification.verified || !verification.registrationInfo) {
      console.error('[AUTH] Registration verification failed');
      return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
    }

    const registrationInfo = verification.registrationInfo;

    // Extract credential information from the new API structure
    const finalCredentialID = registrationInfo.credential?.id;
    const finalCredentialPublicKey = registrationInfo.credential?.publicKey;
    const counter = registrationInfo.credential?.counter ?? 0;
    const credentialDeviceType = registrationInfo.credentialDeviceType;
    const credentialBackedUp = registrationInfo.credentialBackedUp ?? false;

    if (!finalCredentialID || !finalCredentialPublicKey) {
      return NextResponse.json({ error: 'Invalid credential data' }, { status: 400 });
    }

    // Create user
    const user = userDB.create(username);

    // Convert credential ID consistently: body.id is base64url, convert to base64 for storage
    const credentialIdBase64 = Buffer.from(body.id, 'base64url').toString('base64');

    console.log('[AUTH] Storing credential ID:', process.env.NODE_ENV === 'development' ? credentialIdBase64 : '***');

    // Store authenticator - pass transports array directly, not stringified
    authenticatorDB.create(
      user.id,
      credentialIdBase64,
      Buffer.from(finalCredentialPublicKey).toString('base64'),
      counter,
      credentialDeviceType,
      credentialBackedUp,
      body.response.transports
    );

    // Create session
    await createSession(user.id, user.username);

    // Clear registration cookies
    const response = NextResponse.json({ success: true, user: { id: user.id, username: user.username } });
    response.cookies.delete('reg-challenge');
    response.cookies.delete('reg-username');

    return response;
  } catch (error) {
    console.error('[AUTH] Registration verification error:', error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
