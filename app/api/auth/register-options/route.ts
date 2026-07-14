import { generateRegistrationOptions } from '@simplewebauthn/server';
import { NextRequest, NextResponse } from 'next/server';
import { challengeStore } from '@/lib/challenge-store';
import { userDB } from '@/lib/db';

export async function POST(request: NextRequest) {
  const body = await request.json() as { username?: unknown };

  if (typeof body.username !== 'string' || !body.username.trim()) {
    return NextResponse.json({ error: 'Username is required' }, { status: 400 });
  }

  const username = body.username.trim();

  if (userDB.findByUsername(username)) {
    return NextResponse.json({ error: 'Username already taken' }, { status: 409 });
  }

  const options = await generateRegistrationOptions({
    rpName:      process.env.RP_NAME ?? 'Todo App',
    rpID:        process.env.RP_ID   ?? 'localhost',
    userName:    username,
    attestationType: 'none',
    authenticatorSelection: {
      residentKey:       'preferred',
      userVerification:  'preferred',
    },
  });

  challengeStore.save(username, options.challenge);

  return NextResponse.json(options);
}
