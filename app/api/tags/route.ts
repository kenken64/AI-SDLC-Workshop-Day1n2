import { NextRequest, NextResponse } from 'next/server';
import { tagDB, SYSTEM_USER_ID } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  return NextResponse.json(tagDB.findByUserId(session.userId));
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await request.json();
    const { name, color } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Tag name is required' }, { status: 400 });
    }
    if (name.trim().length > 50) {
      return NextResponse.json({ error: 'Tag name must be 50 characters or fewer' }, { status: 400 });
    }
    if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
      return NextResponse.json({ error: 'Invalid color format' }, { status: 400 });
    }

    try {
      const tag = tagDB.create({ userId: session.userId, name: name.trim(), color });
      return NextResponse.json(tag, { status: 201 });
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes('UNIQUE')) {
        return NextResponse.json({ error: 'Tag name already exists' }, { status: 400 });
      }
      throw e;
    }
  } catch (error) {
    console.error('POST /api/tags error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
