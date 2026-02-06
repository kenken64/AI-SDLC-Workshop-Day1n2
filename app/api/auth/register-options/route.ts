import { NextRequest, NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { userDB } from '@/lib/db';

const rpName = 'Todo App';

function getRpID(request: NextRequest): string {
  const host = request.headers.get('host') || request.nextUrl.host;
  return host.split(':')[0];
}

export async function POST(request: NextRequest) {
  try {
    const { username } = await request.json();

    if (!username || typeof username !== 'string' || username.trim() === '') {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    // Check if user already exists
    const existingUser = userDB.findByUsername(username.trim());
    if (existingUser) {
      return NextResponse.json({ error: 'Username already exists' }, { status: 400 });
    }

    const rpID = getRpID(request);
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: username.trim(),
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    // Store challenge in cookie for verification
    const response = NextResponse.json(options);
    response.cookies.set('reg-challenge', options.challenge, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 5, // 5 minutes
      path: '/',
    });
    response.cookies.set('reg-username', username.trim(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 5, // 5 minutes
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Registration options error:', error);
    return NextResponse.json({ error: 'Failed to generate registration options' }, { status: 500 });
  }
}
