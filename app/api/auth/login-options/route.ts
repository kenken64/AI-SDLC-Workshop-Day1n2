import { NextRequest, NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { userDB, authenticatorDB } from '@/lib/db';
import { loginChallenges } from '@/lib/challenges';

export async function POST(request: NextRequest) {
  try {
    const { username } = await request.json();

    if (!username || typeof username !== 'string') {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    const trimmed = username.trim().toLowerCase();
    const user = userDB.findByUsername(trimmed);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const authenticators = authenticatorDB.findByUserId(user.id);

    const options = await generateAuthenticationOptions({
      rpID: request.headers.get('host')?.split(':')[0] ?? 'localhost',
      allowCredentials: authenticators.map((auth) => ({
        id: auth.credential_id,
        transports: auth.transports
          ? (JSON.parse(auth.transports) as AuthenticatorTransport[])
          : undefined,
      })),
      userVerification: 'preferred',
    });

    loginChallenges.set(trimmed, options.challenge);

    return NextResponse.json({ options });
  } catch (error) {
    console.error('login-options error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
