import { NextRequest, NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { userDB, authenticatorDB } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { username } = await request.json();
    if (!username || typeof username !== 'string' || !username.trim()) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }
    const cleanUsername = username.trim().toLowerCase();

    const user = userDB.findByUsername(cleanUsername);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const authenticators = authenticatorDB.findByUserId(user.id);
    const rpID = request.headers.get('host')?.split(':')[0] ?? 'localhost';

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: authenticators.map(a => ({
        id: a.credential_id,
        transports: a.transports ? JSON.parse(a.transports) : undefined,
      })),
      userVerification: 'preferred',
    });

    const res = NextResponse.json(options);
    res.cookies.set(`lc_${cleanUsername}`, options.challenge, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 300,
      path: '/',
    });
    return res;
  } catch (error) {
    console.error('login-options error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
