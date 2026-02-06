import { NextRequest, NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { userDB, authenticatorDB } from '@/lib/db';

const rpID = process.env.NEXT_PUBLIC_RP_ID || 'localhost';

export async function POST(request: NextRequest) {
  try {
    const { username } = await request.json();

    if (!username || typeof username !== 'string' || username.trim() === '') {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    const user = userDB.findByUsername(username.trim());
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Provide allowCredentials so Windows Hello can find non-discoverable credentials
    const userAuthenticators = authenticatorDB.findByUserId(user.id);
    const allowCredentials = userAuthenticators.map(auth => ({
      id: Buffer.from(auth.credential_id, 'base64').toString('base64url'),
      transports: auth.transports ? JSON.parse(auth.transports) : undefined,
    }));

    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'preferred',
      allowCredentials,
    });

    // Store challenge in cookie for verification
    const response = NextResponse.json(options);
    response.cookies.set('auth-challenge', options.challenge, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 5, // 5 minutes
      path: '/',
    });
    response.cookies.set('auth-username', username.trim(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 5, // 5 minutes
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Authentication options error:', error);
    return NextResponse.json({ error: 'Failed to generate authentication options' }, { status: 500 });
  }
}
