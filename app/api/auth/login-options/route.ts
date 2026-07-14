import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { NextRequest, NextResponse } from 'next/server';
import { challengeStore } from '@/lib/challenge-store';
import { userDB, authenticatorDB } from '@/lib/db';

export async function POST(request: NextRequest) {
  const body = await request.json() as { username?: unknown };

  if (typeof body.username !== 'string' || !body.username.trim()) {
    return NextResponse.json({ error: 'Username is required' }, { status: 400 });
  }

  const username = body.username.trim();
  const user     = userDB.findByUsername(username);

  // Return a generic error to avoid confirming whether a username exists.
  if (!user) {
    return NextResponse.json({ error: 'Username not found' }, { status: 404 });
  }

  const authenticators = authenticatorDB.findByUserId(user.id);

  if (authenticators.length === 0) {
    return NextResponse.json({ error: 'No passkeys registered for this account' }, { status: 400 });
  }

  const options = await generateAuthenticationOptions({
    rpID: process.env.RP_ID ?? 'localhost',
    allowCredentials: authenticators.map(auth => ({ id: auth.credential_id })),
    userVerification: 'preferred',
  });

  challengeStore.save(username, options.challenge);

  return NextResponse.json(options);
}
