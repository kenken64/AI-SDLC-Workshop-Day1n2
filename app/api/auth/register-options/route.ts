import { NextRequest, NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { userDB, authenticatorDB } from '@/lib/db';
import { registrationChallenges } from '@/lib/challenges';

export async function POST(request: NextRequest) {
  try {
    const { username } = await request.json();

    if (!username || typeof username !== 'string' || !username.trim()) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    const trimmed = username.trim().toLowerCase();

    let user = userDB.findByUsername(trimmed);
    if (!user) {
      user = userDB.create(trimmed);
    }

    const existingAuthenticators = authenticatorDB.findByUserId(user.id);

    const options = await generateRegistrationOptions({
      rpName: 'Todo App',
      rpID: request.headers.get('host')?.split(':')[0] ?? 'localhost',
      userName: trimmed,
      userDisplayName: trimmed,
      attestationType: 'none',
      excludeCredentials: existingAuthenticators.map((auth) => ({
        id: auth.credential_id,
        transports: auth.transports
          ? (JSON.parse(auth.transports) as AuthenticatorTransport[])
          : undefined,
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    registrationChallenges.set(trimmed, options.challenge);

    return NextResponse.json({ options, userId: user.id });
  } catch (error) {
    console.error('register-options error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
