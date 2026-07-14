import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { NextRequest, NextResponse } from 'next/server';
import { challengeStore } from '@/lib/challenge-store';
import { userDB, authenticatorDB } from '@/lib/db';
import { createSession } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const body = await request.json() as { username?: unknown; response?: unknown };

  if (typeof body.username !== 'string' || !body.username.trim() || !body.response) {
    return NextResponse.json({ error: 'username and response are required' }, { status: 400 });
  }

  const username  = body.username.trim();
  const challenge = challengeStore.consume(username);

  if (!challenge) {
    return NextResponse.json({ error: 'Challenge expired or not found — start login again' }, { status: 400 });
  }

  const resp = body.response as { id?: string };
  if (!resp.id) {
    return NextResponse.json({ error: 'Missing credential id in response' }, { status: 400 });
  }

  const authenticator = authenticatorDB.findByCredentialId(resp.id);
  if (!authenticator) {
    return NextResponse.json({ error: 'Authenticator not recognized' }, { status: 401 });
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response:          body.response as Parameters<typeof verifyAuthenticationResponse>[0]['response'],
      expectedChallenge: challenge,
      expectedOrigin:    process.env.RP_ORIGIN ?? 'http://localhost:3000',
      expectedRPID:      process.env.RP_ID     ?? 'localhost',
      credential: {
        // counter ?? 0: guard against undefined on some authenticator records.
        id:        authenticator.credential_id,
        // Wrap Buffer in a plain Uint8Array — Buffer extends ArrayBufferLike which is
        // too broad for the Uint8Array<ArrayBuffer> signature in @simplewebauthn v13.
        publicKey: new Uint8Array(authenticator.credential_public_key),
        counter:   authenticator.counter ?? 0,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Verification error';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (!verification.verified) {
    return NextResponse.json({ error: 'Verification failed' }, { status: 401 });
  }

  // Update stored counter — critical for clone-attack detection.
  const newCounter = verification.authenticationInfo?.newCounter ?? authenticator.counter ?? 0;
  authenticatorDB.updateCounter(authenticator.id, newCounter);

  const user = userDB.findById(authenticator.user_id);
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  await createSession(user);

  return NextResponse.json({ success: true });
}
