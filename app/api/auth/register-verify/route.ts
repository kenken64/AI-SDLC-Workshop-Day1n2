import { verifyRegistrationResponse } from '@simplewebauthn/server';
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
    return NextResponse.json({ error: 'Challenge expired or not found — start registration again' }, { status: 400 });
  }

  // Reject if username was claimed between register-options and register-verify.
  if (userDB.findByUsername(username)) {
    return NextResponse.json({ error: 'Username already taken' }, { status: 409 });
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response:           body.response as Parameters<typeof verifyRegistrationResponse>[0]['response'],
      expectedChallenge:  challenge,
      expectedOrigin:     process.env.RP_ORIGIN ?? 'http://localhost:3000',
      expectedRPID:       process.env.RP_ID     ?? 'localhost',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Verification error';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
  }

  const { credential } = verification.registrationInfo;

  const user = userDB.create(username);
  authenticatorDB.create({
    user_id:              user.id,
    // credential.id is already a Base64URLString in @simplewebauthn/server v13+
    credential_id:        credential.id as string,
    credential_public_key: Buffer.from(credential.publicKey),
    counter:              credential.counter ?? 0,
  });

  await createSession(user);

  return NextResponse.json({ success: true });
}
