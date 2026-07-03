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
    const cleanUsername = username.trim().toLowerCase();

    let user = userDB.findByUsername(cleanUsername);
    if (!user) user = userDB.create(cleanUsername);

    const existingAuthenticators = authenticatorDB.findByUserId(user.id);
    const rpID = request.headers.get('host')?.split(':')[0] ?? 'localhost';

    const options = await generateRegistrationOptions({
      rpName: 'Todo App',
      rpID,
      userName: cleanUsername,
      userDisplayName: cleanUsername,
      attestationType: 'none',
      excludeCredentials: existingAuthenticators.map(a => ({
        id: a.credential_id,
        transports: a.transports ? JSON.parse(a.transports) : undefined,
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    registrationChallenges.set(cleanUsername, options.challenge);
    return NextResponse.json(options);
  } catch (error) {
    console.error('register-options error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
